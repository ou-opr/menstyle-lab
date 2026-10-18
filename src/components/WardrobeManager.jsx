// 个人衣橱管理器（PHASE1-CONTRACT §7）：增删改查 / 状态 / 照片 / 筛选统计。
//
// 职责边界：本组件**不直接改 App 的 outfit**（契约 §7）。它只维护个人衣橱数据，
// 需要试穿时把 id 通过可选回调交出去，由 App 侧的 setOutfit 决定怎么用。
//
// 用法：
//   <WardrobeManager />                     独立使用（内部自建 useWardrobe）
//   <WardrobeManager wardrobe={w} onTry={...} />   与父层共享同一份衣橱状态
// 为什么拆成两段而不是 `props.wardrobe ?? useWardrobe()`：Hook 不能条件调用，
// 无条件多跑一个 useWardrobe 会多出一份会写 localStorage 的副作用，反而更危险。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORY_LABELS,
  FAMILY_LABELS,
  FIT_LABELS,
  ITEM_CATEGORIES,
  ITEM_FAMILIES,
  ITEM_FITS,
  ITEM_STATUSES,
  SORT_OPTIONS,
  STATUS_LABELS,
} from '../data/wardrobe.js'
import { useWardrobe } from '../hooks/useWardrobe.js'
import '../styles/wardrobe.css'

const EMPTY_FORM = {
  name: '', category: 'tops', status: 'owned', hex: '#9a9da3', family: 'neutral',
  formality: 2, warmth: 2, fit: 'regular', mesh: '', notes: '', tags: '',
}

const toForm = (item) => (item ? {
  name: item.name,
  category: item.category,
  status: item.status,
  hex: item.hex,
  family: item.family,
  formality: String(item.formality),
  warmth: String(item.warmth),
  fit: item.fit,
  mesh: item.mesh,
  notes: item.notes,
  tags: item.tags.join(', '),
} : { ...EMPTY_FORM })

const toInput = (form) => ({
  name: form.name,
  category: form.category,
  status: form.status,
  hex: form.hex,
  family: form.family,
  formality: Number(form.formality),
  warmth: Number(form.warmth),
  fit: form.fit,
  mesh: form.mesh,
  notes: form.notes,
  tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
})

/** 照片缩略图：自己按需拉取 dataURL，加载失败静默降级为占位块。 */
function PhotoThumb({ wardrobe, item, className }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    if (!item.photoId) {
      setSrc(null)
      return () => { alive = false }
    }
    wardrobe.photoDataUrl(item)
      .then((url) => { if (alive) setSrc(url) })
      .catch((error) => {
        console.warn(`[WardrobeManager] 照片 ${item.photoId} 预览失败：`, error)
        if (alive) setFailed(true)
      })
    return () => { alive = false }
  }, [item, wardrobe])

  if (!item.photoId) return <span className={`wd-thumb wd-thumb-empty ${className || ''}`} aria-hidden="true" />
  if (failed) return <span className={`wd-thumb wd-thumb-empty ${className || ''}`} aria-hidden="true">!</span>
  if (!src) return <span className={`wd-thumb wd-thumb-loading ${className || ''}`} aria-hidden="true" />
  return <img className={`wd-thumb ${className || ''}`} src={src} alt={`${item.name} 的照片`} />
}

function WardrobeManagerView({ wardrobe, onTry }) {
  const { items, summary, warnings, persistence } = wardrobe
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [filters, setFilters] = useState({ status: 'all', category: 'all', family: 'all', photo: 'all', q: '', sort: 'recent' })
  const [confirmId, setConfirmId] = useState(null)
  const fileRef = useRef(null)

  const visible = useMemo(() => wardrobe.query(filters), [wardrobe, filters])
  const editing = editingId ? wardrobe.byId(editingId) : null

  const patch = useCallback((key, value) => setForm((f) => ({ ...f, [key]: value })), [])
  const patchFilter = useCallback((key, value) => setFilters((f) => ({ ...f, [key]: value })), [])

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const startEdit = useCallback((item) => {
    setForm(toForm(item))
    setEditingId(item.id)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const submit = useCallback((event) => {
    event.preventDefault()
    const input = toInput(form)
    if (!input.name) return
    if (editingId) wardrobe.update(editingId, input)
    else wardrobe.create(input)
    resetForm()
  }, [editingId, form, resetForm, wardrobe])

  const upload = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file || !editingId) return
    await wardrobe.savePhoto(editingId, file)
    if (fileRef.current) fileRef.current.value = ''
  }, [editingId, wardrobe])

  const removeItem = useCallback((id) => {
    wardrobe.remove(id)
    setConfirmId(null)
    if (editingId === id) resetForm()
  }, [editingId, resetForm, wardrobe])

  return (
    <div className="wd-wrap">
      {persistence.degraded && (
        <p className="wd-notice wd-notice-warn" role="status">{persistence.message}</p>
      )}
      {warnings.length > 0 && (
        <div className="wd-notice" role="status">
          <span>{warnings[0]}</span>
          {warnings.length > 1 && <span className="wd-notice-more">（另有 {warnings.length - 1} 条提示）</span>}
          <button type="button" className="wd-link" onClick={wardrobe.dismissWarnings}>知道了</button>
        </div>
      )}

      <div className="wd-stats" aria-label="衣橱统计">
        <span className="wd-stat"><b>{summary.total}</b> 件单品</span>
        {ITEM_STATUSES.map((status) => (
          <span className="wd-stat" key={status}>{STATUS_LABELS[status]} <b>{summary.byStatus[status]}</b></span>
        ))}
        <span className="wd-stat">带照片 <b>{summary.withPhoto}</b></span>
        <span className="wd-stat">累计穿着 <b>{summary.totalWears}</b> 次</span>
        {summary.mostWorn && <span className="wd-stat wd-stat-hint">最常穿：{summary.mostWorn.name}（{summary.mostWorn.wearCount} 次）</span>}
      </div>

      <form className="wd-form" onSubmit={submit}>
        <h3 className="wd-form-head">{editing ? `编辑：${editing.name}` : '添加一件单品'}</h3>
        <div className="wd-grid">
          <label className="wd-field wd-field-wide">
            <span>名称</span>
            <input value={form.name} maxLength={40} required onChange={(e) => patch('name', e.target.value)} placeholder="例如：藏青亚麻衬衫" />
          </label>
          <label className="wd-field">
            <span>分类</span>
            <select value={form.category} onChange={(e) => patch('category', e.target.value)}>
              {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="wd-field">
            <span>状态</span>
            <select value={form.status} onChange={(e) => patch('status', e.target.value)}>
              {ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="wd-field">
            <span>颜色</span>
            <span className="wd-color-row">
              <input type="color" value={form.hex} onChange={(e) => patch('hex', e.target.value)} aria-label="用取色器选颜色" />
              <input value={form.hex} onChange={(e) => patch('hex', e.target.value)} placeholder="#9a9da3" />
            </span>
          </label>
          <label className="wd-field">
            <span>色系</span>
            <select value={form.family} onChange={(e) => patch('family', e.target.value)}>
              {ITEM_FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABELS[f]}</option>)}
            </select>
          </label>
          <label className="wd-field">
            <span>正式度（1 休闲 - 3 正式）</span>
            <input type="range" min="1" max="3" step="1" value={form.formality} onChange={(e) => patch('formality', e.target.value)} />
            <output>{form.formality}</output>
          </label>
          <label className="wd-field">
            <span>保暖度（1 夏 - 3 冬）</span>
            <input type="range" min="1" max="3" step="1" value={form.warmth} onChange={(e) => patch('warmth', e.target.value)} />
            <output>{form.warmth}</output>
          </label>
          <label className="wd-field">
            <span>版型</span>
            <select value={form.fit} onChange={(e) => patch('fit', e.target.value)}>
              {ITEM_FITS.map((f) => <option key={f} value={f}>{FIT_LABELS[f]}</option>)}
            </select>
          </label>
          <label className="wd-field">
            <span>图片</span>
            <input ref={fileRef} type="file" accept="image/*" disabled={!editing} onChange={upload} />
          </label>
          <label className="wd-field wd-field-wide">
            <span>标签（逗号分隔）</span>
            <input value={form.tags} onChange={(e) => patch('tags', e.target.value)} placeholder="通勤, 夏季" />
          </label>
          <label className="wd-field wd-field-wide">
            <span>备注</span>
            <textarea rows={2} value={form.notes} onChange={(e) => patch('notes', e.target.value)} placeholder="版型偏大、袖长偏短……" />
          </label>
        </div>
        <div className="wd-form-actions">
          <button type="submit" className="wd-btn wd-btn-primary">{editing ? '保存修改' : '添加到衣橱'}</button>
          {editing && <button type="button" className="wd-btn" onClick={resetForm}>取消编辑</button>}
          {editing && editing.photoId && (
            <button type="button" className="wd-btn" onClick={() => wardrobe.removePhoto(editing.id)}>删除照片</button>
          )}
          {editing && (
            <PhotoThumb wardrobe={wardrobe} item={editing} className="wd-thumb-inline" />
          )}
          {!editing && <span className="wd-hint">先保存单品，再回来给它加照片。</span>}
        </div>
      </form>

      <div className="wd-filters" role="group" aria-label="筛选与排序">
        <label className="wd-field">
          <span>搜索</span>
          <input value={filters.q} onChange={(e) => patchFilter('q', e.target.value)} placeholder="名称 / 标签 / 备注" />
        </label>
        <label className="wd-field">
          <span>状态</span>
          <select value={filters.status} onChange={(e) => patchFilter('status', e.target.value)}>
            <option value="all">全部</option>
            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="wd-field">
          <span>分类</span>
          <select value={filters.category} onChange={(e) => patchFilter('category', e.target.value)}>
            <option value="all">全部</option>
            {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="wd-field">
          <span>色系</span>
          <select value={filters.family} onChange={(e) => patchFilter('family', e.target.value)}>
            <option value="all">全部</option>
            {ITEM_FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABELS[f]}</option>)}
          </select>
        </label>
        <label className="wd-field">
          <span>照片</span>
          <select value={filters.photo} onChange={(e) => patchFilter('photo', e.target.value)}>
            <option value="all">全部</option>
            <option value="with">有照片</option>
            <option value="without">无照片</option>
          </select>
        </label>
        <label className="wd-field">
          <span>排序</span>
          <select value={filters.sort} onChange={(e) => patchFilter('sort', e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <p className="wd-count" role="status">显示 {visible.length} / {summary.total} 件</p>

      {summary.total === 0 ? (
        <p className="wd-empty">衣橱还是空的。先加一件你最常穿的上装试试——个人单品会参与评分与智能替换。</p>
      ) : visible.length === 0 ? (
        <p className="wd-empty">没有符合条件的单品，换个筛选条件看看。</p>
      ) : (
        <ul className="wd-list">
          {visible.map((item) => (
            <li className="wd-card" key={item.id}>
              <div className="wd-card-main">
                <PhotoThumb wardrobe={wardrobe} item={item} />
                <div className="wd-card-text">
                  <p className="wd-card-name">
                    <i className="wd-swatch" style={{ background: item.hex }} aria-hidden="true" />
                    {item.name}
                    <span className={`wd-badge wd-badge-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  </p>
                  <p className="wd-card-meta">
                    {CATEGORY_LABELS[item.category]} · {FAMILY_LABELS[item.family]} · {FIT_LABELS[item.fit]} ·
                    正式度 {item.formality} · 保暖 {item.warmth} · 穿过 {item.wearCount} 次
                  </p>
                  {item.tags.length > 0 && (
                    <p className="wd-card-tags">{item.tags.map((t) => <span className="wd-tag" key={t}>{t}</span>)}</p>
                  )}
                  {item.notes && <p className="wd-card-notes">{item.notes}</p>}
                </div>
              </div>
              <div className="wd-card-actions">
                <button type="button" className="wd-btn" onClick={() => wardrobe.wear(item.id)}>记一次穿着</button>
                {ITEM_STATUSES.filter((s) => s !== item.status).map((s) => (
                  <button type="button" className="wd-btn" key={s} onClick={() => wardrobe.setStatus(item.id, s)}>
                    标为{STATUS_LABELS[s]}
                  </button>
                ))}
                <button type="button" className="wd-btn" onClick={() => startEdit(item)}>编辑</button>
                {typeof onTry === 'function' && (
                  <button type="button" className="wd-btn" onClick={() => onTry(item)}>试穿</button>
                )}
                {confirmId === item.id ? (
                  <span className="wd-confirm">
                    <span>确认删除？</span>
                    <button type="button" className="wd-btn wd-btn-danger" onClick={() => removeItem(item.id)}>删除</button>
                    <button type="button" className="wd-btn" onClick={() => setConfirmId(null)}>取消</button>
                  </span>
                ) : (
                  <button type="button" className="wd-btn" onClick={() => setConfirmId(item.id)}>删除</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StandaloneWardrobeManager({ onTry }) {
  const wardrobe = useWardrobe()
  return <WardrobeManagerView wardrobe={wardrobe} onTry={onTry} />
}

/**
 * 个人衣橱管理面板。不修改 App 的 outfit——需要试穿时通过可选 onTry(item) 交出去。
 * @param {{wardrobe?:object, onTry?:(item:object)=>void}} [props]
 */
export function WardrobeManager({ wardrobe, onTry } = {}) {
  if (wardrobe && typeof wardrobe.create === 'function') return <WardrobeManagerView wardrobe={wardrobe} onTry={onTry} />
  return <StandaloneWardrobeManager onTry={onTry} />
}

export default WardrobeManager
