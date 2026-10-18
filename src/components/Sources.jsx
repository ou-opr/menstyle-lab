import { memo, useEffect, useId, useMemo, useState } from 'react'
import { SOURCES, PLATFORMS, PERSPECTIVE_TYPES, SOURCE_STATUS } from '../data/sources'
import '../styles/sources.css'

/* ------------------------------------------------------------------ *
 * 检索核心：纯函数，无 React / DOM 依赖，可被 Node 直接断言
 * ------------------------------------------------------------------ */

export const PAGE_SIZE = 24
export const TAG_LIMIT = 16
export const EMPTY_FILTERS = { platforms: [], statuses: [], perspectives: [], tags: [] }

export const SORT_OPTIONS = [
  { value: 'default', label: '默认顺序' },
  { value: 'plays', label: '播放量优先' },
  { value: 'recent', label: '最新发布' },
  { value: 'title', label: '标题排序' },
]

const SEARCH_FIELDS = ['title', 'creator', 'note', 'editorNote']
const PLAY_UNITS = { 亿: 1e8, 万: 1e4, w: 1e4, k: 1e3 }

const collator =
  typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
    ? new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    : null

export function compareText(a, b) {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  if (collator) return collator.compare(sa, sb)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/** "241万播放" / "53万播放 · 2026-07" / "1327赞" -> 数值；无法解析返回 null */
export function parsePlays(value) {
  if (value == null) return null
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*(亿|万|[wWkK])?/)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n)) return null
  return Math.round(n * (match[2] ? PLAY_UNITS[match[2]] : 1))
}

/** 查询串 -> 小写词条数组；空白分隔表示「全部命中」 */
export function normalizeQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

const haystackCache = new WeakMap()

/** title / creator / note / editorNote / tags 拼成的小写检索串（按对象缓存） */
export function buildHaystack(source) {
  if (!source || typeof source !== 'object') return ''
  const cached = haystackCache.get(source)
  if (cached !== undefined) return cached
  const parts = SEARCH_FIELDS.map((key) => source[key])
  if (Array.isArray(source.tags)) parts.push(source.tags.join(' '))
  const text = parts.filter(Boolean).join(' ').toLowerCase()
  haystackCache.set(source, text)
  return text
}

/** 组内 OR、组间 AND */
export function filterSources(list, filters) {
  const terms = normalizeQuery(filters?.q)
  const platforms = filters?.platforms ?? []
  const statuses = filters?.statuses ?? []
  const perspectives = filters?.perspectives ?? []
  const tags = filters?.tags ?? []

  return (list ?? []).filter((source) => {
    if (platforms.length && !platforms.includes(source.platform)) return false
    if (statuses.length && !statuses.includes(source.status)) return false
    if (perspectives.length && !perspectives.includes(source.perspective)) return false
    if (tags.length && !tags.some((tag) => (source.tags ?? []).includes(tag))) return false
    if (terms.length) {
      const hay = buildHaystack(source)
      for (const term of terms) if (!hay.includes(term)) return false
    }
    return true
  })
}

/** 稳定排序：等值时保持输入顺序 */
export function sortSources(list, sortKey) {
  const decorated = (list ?? []).map((item, index) => ({ item, index }))
  const byInputOrder = (a, b) => a.index - b.index

  if (sortKey === 'plays') {
    decorated.sort((a, b) => {
      const av = parsePlays(a.item?.plays)
      const bv = parsePlays(b.item?.plays)
      if (av == null && bv == null) return byInputOrder(a, b)
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av || byInputOrder(a, b)
    })
  } else if (sortKey === 'recent') {
    decorated.sort((a, b) => {
      const av = a.item?.publishedAt ?? null
      const bv = b.item?.publishedAt ?? null
      if (av == null && bv == null) return byInputOrder(a, b)
      if (av == null) return 1
      if (bv == null) return -1
      return compareText(bv, av) || byInputOrder(a, b)
    })
  } else if (sortKey === 'title') {
    decorated.sort((a, b) => compareText(a.item?.title, b.item?.title) || byInputOrder(a, b))
  }

  return decorated.map((entry) => entry.item)
}

/** 页码越界自动收敛，永不抛异常 */
export function paginate(list, page, pageSize = PAGE_SIZE) {
  const items = list ?? []
  const size = Math.max(1, Math.floor(Number(pageSize)) || PAGE_SIZE)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pageCount)
  const offset = (safePage - 1) * size
  const slice = items.slice(offset, offset + size)
  return {
    items: slice,
    page: safePage,
    pageCount,
    total,
    start: total === 0 ? 0 : offset + 1,
    end: offset + slice.length,
    hasPrev: safePage > 1,
    hasNext: safePage < pageCount,
  }
}

/** 分页条窗口：首尾页 + 当前页邻域，空缺处用 '…' 占位 */
export function pageWindow(page, pageCount, span = 1) {
  const out = []
  let last = 0
  for (let p = 1; p <= pageCount; p += 1) {
    if (!(p === 1 || p === pageCount || Math.abs(p - page) <= span)) continue
    if (last && p - last > 1) out.push('…')
    out.push(p)
    last = p
  }
  return out
}

function tally(list, getValues) {
  const map = new Map()
  for (const item of list ?? []) {
    for (const value of getValues(item)) map.set(value, (map.get(value) ?? 0) + 1)
  }
  return map
}

function withCounts(map, dictionary, labelOf) {
  return [...map.entries()]
    .map(([value, count]) => ({
      value,
      count,
      label: labelOf(dictionary?.[value], value),
      color: dictionary?.[value]?.color ?? null,
    }))
    .sort((a, b) => b.count - a.count || compareText(a.label, b.label))
}

/** 平台/状态/视角/标签选项全部从数据动态推导（声明表 ∪ 实际出现，再剔除 0 条目的死选项） */
export function buildFacets(list) {
  const items = list ?? []
  const valuesOf = (key) => (source) => (source?.[key] == null ? [] : [source[key]])

  const platforms = withCounts(tally(items, valuesOf('platform')), PLATFORMS, (entry, value) => entry?.name ?? value)
    .filter((option) => option.count > 0)
  const statuses = withCounts(tally(items, valuesOf('status')), SOURCE_STATUS, (entry, value) => entry?.label ?? value)
  const perspectives = withCounts(tally(items, valuesOf('perspective')), PERSPECTIVE_TYPES, (entry, value) => entry ?? value)
  const tags = withCounts(
    tally(items, (source) => (Array.isArray(source?.tags) ? source.tags : [])),
    null,
    (entry, value) => value,
  )

  return { platforms, statuses, perspectives, tags }
}

/** 完整流水线：筛选 -> 排序 -> 分页 */
export function searchSources(list, filters, sortKey = 'default', page = 1, pageSize = PAGE_SIZE) {
  return paginate(sortSources(filterSources(list, filters), sortKey), page, pageSize)
}

export function toggleValue(list, value) {
  const current = list ?? []
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
}

export function countActiveFilters(filters) {
  return (
    (normalizeQuery(filters?.q).length ? 1 : 0) +
    (filters?.platforms?.length ?? 0) +
    (filters?.statuses?.length ?? 0) +
    (filters?.perspectives?.length ?? 0) +
    (filters?.tags?.length ?? 0)
  )
}

/* ------------------------------------------------------------------ *
 * 视图
 * ------------------------------------------------------------------ */

function FilterGroup({ legend, options, selected, onToggle, expanded, onExpand, limit }) {
  // 必须在提前 return 之前调 hook（否则条件渲染会打乱 hook 顺序）。
  const chipsId = useId()
  if (!options.length) return null
  const collapsible = Boolean(limit) && options.length > limit
  const shown = collapsible && !expanded ? options.slice(0, limit) : options
  const hidden = options.length - shown.length

  return (
    <fieldset className="src-group">
      <legend className="src-legend">
        {legend}
        <span className="src-legend-n">
          {selected.length ? `已选 ${selected.length}` : `共 ${options.length} 项`}
        </span>
      </legend>
      <div className="src-chips" id={chipsId}>
        {shown.map((option) => {
          const on = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className="src-chip"
              aria-pressed={on}
              onClick={() => onToggle(option.value)}
            >
              {option.color ? <i className="src-dot" style={{ background: option.color }} aria-hidden="true" /> : null}
              <span>{option.label}</span>
              <span className="src-chip-n">{option.count}</span>
            </button>
          )
        })}
        {collapsible ? (
          <button
            type="button"
            className="src-chip src-chip-more"
            aria-expanded={Boolean(expanded)}
            aria-controls={chipsId}
            onClick={onExpand}
          >
            {expanded ? '收起标签' : `还有 ${hidden} 个标签`}
          </button>
        ) : null}
      </div>
    </fieldset>
  )
}

// SourcesSection 无 props，靠 React.memo 让它彻底不受父级 outfit 变更影响：
// 换一件上装时，App 会重渲全部 10 个 section，而资源库是 187 条数据 + 24 张卡片的
// 纯静态浏览区，重渲它纯属浪费（实测这是首屏之后最重的一块 diff）。
export const Sources = memo(function Sources({ sources = SOURCES } = {}) {
  const uid = useId()
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState('default')
  const [page, setPage] = useState(1)
  const [allTags, setAllTags] = useState(false)

  // 输入防抖 200ms；生效时回到第 1 页
  useEffect(() => {
    if (rawQuery === query) return undefined
    const timer = setTimeout(() => {
      setQuery(rawQuery)
      setPage(1)
    }, 200)
    return () => clearTimeout(timer)
  }, [rawQuery, query])

  const facets = useMemo(() => buildFacets(sources), [sources])
  const filters = useMemo(() => ({ ...selection, q: query }), [selection, query])
  const result = useMemo(
    () => searchSources(sources, filters, sortKey, page, PAGE_SIZE),
    [sources, filters, sortKey, page],
  )

  const activeCount = countActiveFilters(filters)
  const pendingQuery = rawQuery !== query
  const searchId = `${uid}-q`
  const sortId = `${uid}-sort`

  const toggle = (group) => (value) => {
    setSelection((prev) => ({ ...prev, [group]: toggleValue(prev[group], value) }))
    setPage(1)
  }

  const clearAll = () => {
    setRawQuery('')
    setQuery('')
    setSelection(EMPTY_FILTERS)
    setPage(1)
  }

  const jump = (next) => setPage(Math.min(Math.max(1, next), result.pageCount))

  return (
    <div className="src-panel">
      <div className="src-toolbar">
        <div className="src-search">
          <label className="src-field-label" htmlFor={searchId}>关键词</label>
          <div className="src-input-wrap">
            <input
              id={searchId}
              className="src-input"
              type="search"
              value={rawQuery}
              autoComplete="off"
              placeholder="搜标题、博主、内容提要、推荐理由、标签…"
              onChange={(event) => setRawQuery(event.target.value)}
              aria-describedby={`${searchId}-hint`}
            />
            {rawQuery ? (
              <button type="button" className="src-input-clear" onClick={() => { setRawQuery(''); setQuery(''); setPage(1) }}>
                清除
              </button>
            ) : null}
          </div>
          <span className="src-sr" id={`${searchId}-hint`}>支持多个关键词，用空格分隔，将按全部命中筛选</span>
        </div>

        <div className="src-sort">
          <label className="src-field-label" htmlFor={sortId}>排序</label>
          <select
            id={sortId}
            className="src-select"
            value={sortKey}
            onChange={(event) => { setSortKey(event.target.value); setPage(1) }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="src-statusbar">
          <p className="src-status" role="status" aria-live="polite">
            {result.total === 0
              ? '当前 0 条结果'
              : `当前 ${result.total} 条结果${result.total > PAGE_SIZE ? `，第 ${result.page} / ${result.pageCount} 页` : ''}`}
            {pendingQuery ? <span className="src-pending">（正在筛选…）</span> : null}
          </p>
          <span className="src-total">数据源共 {sources.length} 条</span>
          {activeCount > 0 ? (
            <button type="button" className="src-reset" onClick={clearAll}>清除全部筛选（{activeCount}）</button>
          ) : null}
        </div>
      </div>

      <div className="src-filters">
        <FilterGroup
          id={`${uid}-pf`}
          legend="平台"
          options={facets.platforms}
          selected={selection.platforms}
          onToggle={toggle('platforms')}
        />
        <FilterGroup
          id={`${uid}-st`}
          legend="状态"
          options={facets.statuses}
          selected={selection.statuses}
          onToggle={toggle('statuses')}
        />
        <FilterGroup
          id={`${uid}-ps`}
          legend="视角"
          options={facets.perspectives}
          selected={selection.perspectives}
          onToggle={toggle('perspectives')}
        />
        <FilterGroup
          id={`${uid}-tg`}
          legend="标签"
          options={facets.tags}
          selected={selection.tags}
          onToggle={toggle('tags')}
          limit={TAG_LIMIT}
          expanded={allTags}
          onExpand={() => setAllTags((value) => !value)}
        />
      </div>

      {result.total === 0 ? (
        <div className="src-empty">
          <p className="src-empty-title">没有符合条件的资源</p>
          <p className="src-empty-sub">
            试试更短的关键词，或放宽平台 / 状态 / 视角 / 标签的筛选。
          </p>
          <button type="button" className="src-reset src-reset-lg" onClick={clearAll}>清除全部筛选</button>
        </div>
      ) : (
        <div className="src-grid">
          {result.items.map((source) => {
            const platform = PLATFORMS?.[source.platform]
            const status = SOURCE_STATUS?.[source.status]
            const invalid = source.status === 'invalid'
            const body = (
              <>
                <span className="pf">
                  <i style={{ background: platform?.color ?? 'currentColor' }} />
                  {platform?.name ?? source.platform}
                  {source.plays ? ` · ${source.plays}` : ''}
                </span>
                <span className="source-badges">
                  <i>{PERSPECTIVE_TYPES?.[source.perspective] ?? source.perspective}</i>
                  <i className={`status ${status?.tone ?? 'muted'}`}>{status?.label ?? source.status}</i>
                </span>
                <h3>{source.title}</h3>
                <span className="by">@{source.creator}</span>
                <span className="source-dates">发布：{source.publishedAt || '未收录'} · 最后验证：{source.verifiedAt}</span>
                <span className="note"><b>内容提要</b>{source.note}</span>
                <span className="editor-note"><b>为什么推荐</b>{String(source.editorNote ?? '').replace(/^入选理由：/, '')}</span>
                <span className="go">{invalid ? '链接已失效' : '去围观 ↗'}</span>
              </>
            )

            return invalid ? (
              <div className="src-card invalid" key={source.id} aria-disabled="true">{body}</div>
            ) : (
              <a className="src-card" key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{body}</a>
            )
          })}
        </div>
      )}

      {result.total > PAGE_SIZE ? (
        <nav className="src-pager" aria-label="结果分页">
          <button
            type="button"
            className="src-page src-page-edge"
            onClick={() => jump(result.page - 1)}
            disabled={!result.hasPrev}
            aria-disabled={!result.hasPrev}
          >
            上一页
          </button>
          {pageWindow(result.page, result.pageCount).map((entry, index) =>
            typeof entry === 'number' ? (
              <button
                key={`page-${entry}`}
                type="button"
                className="src-page"
                aria-current={entry === result.page ? 'page' : undefined}
                aria-label={`第 ${entry} 页`}
                onClick={() => jump(entry)}
              >
                {entry}
              </button>
            ) : (
              <span className="src-gap" key={`gap-${index}`} aria-hidden="true">…</span>
            ),
          )}
          <button
            type="button"
            className="src-page src-page-edge"
            onClick={() => jump(result.page + 1)}
            disabled={!result.hasNext}
            aria-disabled={!result.hasNext}
          >
            下一页
          </button>
          <span className="src-page-info">共 {result.total} 条 · 第 {result.page} / {result.pageCount} 页</span>
        </nav>
      ) : null}
    </div>
  )
})

export default Sources
