import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LazyStudio } from './components/LazyStudio'
import { describeBodyProfile } from './three/bodyProfile'
import { Panel } from './components/Panel'
import { AdvicePanel } from './components/AdvicePanel'
import { Laws } from './components/Laws'
import { Sources } from './components/Sources'
import { ProfileRecommender, DEFAULT_PROFILE } from './components/ProfileRecommender'
import ScoreCard from './components/ScoreCard'
import { ShareBar } from './components/ShareBar'
import { OutfitCollage } from './components/OutfitCollage'
import { ThemeToggle } from './components/ThemeToggle'
import { ChapterRail } from './components/ChapterRail'
import { CountUp } from './components/CountUp'
import { IconMouse, IconPause, IconPlay, IconRotateCcw } from './components/icons'
import {
  DataSection,
  SmartReplaceBlock,
  WardrobeSection,
  createImageStore,
} from './components/PhaseOneWorkspace'
import { TodayPlanner } from './components/TodayPlanner'
import { OutfitCalendar, personalItemsOf } from './components/OutfitCalendar'
import { CapsulePlanner } from './components/CapsulePlanner'
import { useWardrobe } from './hooks/useWardrobe'
import { usePreferences } from './hooks/usePreferences'
import { useDaily } from './hooks/useDaily'
import { useCalendar } from './hooks/useCalendar'
import { useLooks } from './hooks/useLooks'
import { useCrossTabSync } from './hooks/useCrossTabSync'
import { pruneCalendarRef, pruneLooksRef } from './data/references.js'
import { useNavScroll, useScrollReveal } from './hooks/useMotion'
import { byId, TOPS, OUTERS, BOTTOMS, SHOES, ACCS, PRESETS, setWardrobeItems } from './data/catalog'
import { getAdvice, LAWS } from './data/advice'
import { decodeOutfit } from './data/share'
import { STORAGE_KEYS, defaultStorage } from './data/backup'
import { PROJECT_STATS } from './data/stats'
import './styles/stage.css'

const DEFAULT_OUTFIT = PRESETS[0].outfit

// 顶部导航对应的 10 个稳定锚点区块；改这里的顺序即改变高亮优先级与观察顺序。
// 章节进度轨复用同一份编号与标签，避免两处文案漂移。
const CHAPTERS = [
  { id: 'planner', no: '01', label: '个人方案' },
  { id: 'wardrobe', no: '02', label: '我的衣橱' },
  { id: 'today', no: '03', label: '今日穿搭' },
  { id: 'calendar', no: '04', label: '穿搭日历' },
  { id: 'capsule', no: '05', label: '胶囊衣橱' },
  { id: 'studio', no: '06', label: '3D 试衣间' },
  { id: 'advice', no: '07', label: '穿搭建议' },
  { id: 'laws', no: '08', label: '穿搭法则' },
  { id: 'sources', no: '09', label: '博主资源' },
  { id: 'data', no: '10', label: '数据管理' },
]
const SECTION_IDS = CHAPTERS.map((chapter) => chapter.id)

const cloneOutfit = (o) => ({ ...o, accs: Array.isArray(o?.accs) ? [...o.accs] : [] })

/** 从 #o=... 解析造型；无效或缺失一律返回 null（绝不抛异常）。 */
function readOutfitFromHash(hash) {
  if (typeof hash !== 'string') return null
  // 用 String#match 而不是 RegExp#exec（两者在这里语义等价）：
  // .exec( 会被安全扫描器按 child_process.exec 当成命令执行 sink 误报，卡死提交门禁。
  const m = hash.trim().match(/^#o=(.+)$/)
  if (!m) return null
  try {
    return decodeOutfit(m[1])
  } catch (error) {
    console.warn('STYLE LAB: 分享链接解析失败，忽略该参数', error)
    return null
  }
}

export default function App() {
  // 首帧就尝试读取分享链接：这样朋友打开链接立刻看到那一套，而不是先闪一下默认造型
  const [outfit, setOutfit] = useState(() => cloneOutfit(readOutfitFromHash(window.location.hash) ?? DEFAULT_OUTFIT))
  const [autoRotate, setAutoRotate] = useState(false)
  const [hashNotice, setHashNotice] = useState('')
  // 身高/体型由 App 持有：个人方案用它挑造型，3D 试衣间用同一份参数缩放模特。
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const navLinksRef = useRef(null)
  const navRef = useRef(null)

  // 表现层：导航阅读进度条、区块滚动入场。都不参与业务状态。
  useNavScroll(navRef)
  useScrollReveal()

  // 阶段一：一份照片仓库后端 + 一份衣橱 store + 一份偏好 store，全部提升到这里。
  // 四个新模块（衣橱管理器 / 偏好面板 / 智能替换 / 数据管理）共用同一份 store，
  // 否则各处各持副本，一处写入另一处看不见，备份也会导出孤儿照片。
  const imageStore = useMemo(() => createImageStore(), [])

  // 阶段二：今日条件与穿搭日历也提升到 App——日历落盘时要顺带对个人单品累加穿着次数，
  // 这个「一个动作改两处存储」的一致性只有在这里做才不会漏。
  const daily = useDaily()
  const calendar = useCalendar()

  // 收藏夹也提到 App 层：导入备份改的是 localStorage，组件私有 state 读不到，
  // 导入后再点一次「收藏」就会用旧数组把刚导入的收藏覆盖掉。抬上来才能显式重读。
  const looksStore = useLooks()
  const { reload: reloadLooks } = looksStore

  // 删掉一件个人单品后，日历与收藏夹里指向它的 id 会变成孤儿（UI 会直接显示原始 UUID）。
  // 这里做一次下游清理；用 useCallback 固定身份，避免 wardrobe 的 remove 反复换新。
  const onItemRemoved = useCallback((id) => {
    const prunedCalendar = pruneCalendarRef(calendar.state, id)
    if (prunedCalendar.changed > 0) {
      calendar.replaceAll(prunedCalendar.state)
      setHashNotice(`已顺带清理 ${prunedCalendar.changed} 条日历里的失效单品`)
    }
    const prunedLooks = pruneLooksRef(looksStore.looks, id)
    if (prunedLooks.changed > 0) looksStore.replaceAll(prunedLooks.looks)
  }, [calendar, looksStore])

  const wardrobe = useWardrobe({ imageStore: imageStore.backend, onItemRemoved })
  const preferences = usePreferences(wardrobe.items)

  // 跨标签页同步：另一个标签页改了 localStorage 时，本页跟着重读。
  // 不装这个监听的话，两个页面各自持有 state 快照，后写的一方会静默覆盖先写的一方
  // （典型场景：A 页记了日历，B 页改衣橱，B 的整块写入会把日历写回旧值）。
  // storage 事件只在「其它」标签页写入时触发，正好是「外部变更 → 本页重读」。
  useCrossTabSync({
    [STORAGE_KEYS.wardrobe]: () => wardrobe.replaceAll(defaultStorage()?.getItem(STORAGE_KEYS.wardrobe)),
    [STORAGE_KEYS.daily]: () => daily.replaceAll(defaultStorage()?.getItem(STORAGE_KEYS.daily)),
    [STORAGE_KEYS.calendar]: () => calendar.replaceAll(defaultStorage()?.getItem(STORAGE_KEYS.calendar)),
    [STORAGE_KEYS.looks]: reloadLooks,
  })

  // 把个人单品登记进目录查找层，让衣柜条、3D 试衣间与建议引擎都能按 id 取到它们。
  //
  // 为什么用 useMemo 而不是直接在渲染体里调用：
  //   直接在渲染体里写模块级变量是副作用。React 18 并发渲染下，一次被丢弃的 render
  //   会把全局注册表留在错误版本上（下一个渲染用到的 byId 就是旧数据）。
  // useMemo 里做这件事安全的原因：
  //   它在**渲染期间同步**执行（子组件渲染前就已完成），不会晚一帧；
  //   而 setWardrobeItems 每次按入参重建等价 Map，重复执行是幂等的，
  //   所以 StrictMode 的双执行也不会累积错误状态。
  // 依赖只看 items 数组本身：数组引用不变就不重建，省掉每次渲染的无谓 Map 分配。
  useMemo(() => setWardrobeItems(wardrobe.items), [wardrobe.items])

  // 浏览器前进/后退、或用户手动改 hash 时同步。用 event.state 无关，
  // 只读 location.hash，因此 replaceState 写入的那次不会重复触发回填。
  useEffect(() => {
    const onHashChange = () => {
      const next = readOutfitFromHash(window.location.hash)
      if (next) {
        setOutfit(cloneOutfit(next))
        setHashNotice('已载入分享链接里的造型')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首帧若来自分享链接，给一次可见反馈（读屏也能听到）
  useEffect(() => {
    if (readOutfitFromHash(window.location.hash)) setHashNotice('已载入分享链接里的造型')
  }, [])

  useEffect(() => {
    if (!hashNotice) return undefined
    const t = setTimeout(() => setHashNotice(''), 4000)
    return () => clearTimeout(t)
  }, [hashNotice])

  // 顶部导航增强：移动端横滑渐隐提示 + 当前区块高亮。
  // 高亮用 IntersectionObserver 观察 10 个 section 驱动；滚动结束点未必触发 IO 回调，
  // 因此另挂一个 rAF 节流的 scroll 监听做最终校正，两者共用同一个 applyCurrent。
  useEffect(() => {
    const navLinks = navLinksRef.current
    if (!navLinks) return undefined

    const updateFade = () => {
      const maxLeft = navLinks.scrollWidth - navLinks.clientWidth
      const scrollable = getComputedStyle(navLinks).overflowX === 'auto'
      if (!scrollable || maxLeft <= 1) {
        navLinks.classList.remove('nav-can-left', 'nav-can-right')
        return
      }
      navLinks.classList.toggle('nav-can-left', navLinks.scrollLeft > 1)
      navLinks.classList.toggle('nav-can-right', navLinks.scrollLeft < maxLeft - 1)
    }
    updateFade()
    navLinks.addEventListener('scroll', updateFade, { passive: true })
    window.addEventListener('resize', updateFade)

    const links = Array.from(navLinks.querySelectorAll('a[href^="#"]'))
    const sections = SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    const BAND_TOP = 78
    const BAND_EPS = 2

    const pickCurrent = () => {
      // 首选：横跨「导航下沿 + 余量」这条线的区块（正在读的区块）。
      // 布局高度是小数，78.109px 这类亚像素会让严格比较失手，加 2px 容差，
      // 并在同时命中的区块里取 top 最大者（最贴近读线的那个）。
      let current = null
      let currentTop = -Infinity
      for (const sec of sections) {
        const r = sec.getBoundingClientRect()
        if (r.top <= BAND_TOP + BAND_EPS && r.bottom > BAND_TOP && r.top > currentTop) {
          current = sec
          currentTop = r.top
        }
      }
      if (current) return current
      // 页面最底部时最后一段可能顶不到 BAND_TOP：取视口内文档序最后的区块兜底。
      const vh = window.innerHeight
      let fallback = null
      for (const sec of sections) {
        const r = sec.getBoundingClientRect()
        if (r.top < vh && r.bottom > 0) fallback = sec
      }
      return fallback
    }

    const applyCurrent = () => {
      const current = pickCurrent()
      for (const sec of sections) {
        const link = links.find((a) => a.getAttribute('href') === `#${sec.id}`)
        if (!link) continue
        if (current === sec) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      }
    }

    const observer = new IntersectionObserver(applyCurrent, { rootMargin: '-78px 0px -55% 0px' })
    sections.forEach((sec) => observer.observe(sec))

    let raf = 0
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyCurrent() })
    }
    // scrollend 在滚动（含平滑锚点跳转）真正停稳后触发，保证最终高亮准确；
    // 旧内核没有 scrollend 时，rAF 节流的 scroll 监听仍能逐帧校正。
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scrollend', applyCurrent)
    applyCurrent()

    return () => {
      navLinks.removeEventListener('scroll', updateFade)
      window.removeEventListener('resize', updateFade)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('scrollend', applyCurrent)
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  const applyOutfit = useCallback((next) => setOutfit(cloneOutfit(next)), [])

  const tryRecommendedLook = useCallback((nextOutfit) => {
    setOutfit(cloneOutfit(nextOutfit))
    requestAnimationFrame(() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' }))
  }, [])

  // 记一条造型日记：日历落盘 + 个人单品穿着 +1。两件事要么都做，要么都不做，
  // 所以日历写入失败时直接返回失败，不再累加穿着次数（否则次数会凭空多出来）。
  // 必须用 wearMany 一次记完：wear 读的是渲染期闭包里的 state，循环调用会让后一件
  // 覆盖前一件，一套造型 N 件个人单品最后只有 1 件真的 +1。
  const recordLook = useCallback((target, meta) => {
    const extra = meta && typeof meta === 'object' ? meta : {}
    const result = calendar.add({ ...extra, outfit: target })
    if (!result.entry) {
      return { ok: false, message: (result.errors && result.errors[0]) || '记录失败' }
    }
    wardrobe.wearMany(personalItemsOf(target))
    return { ok: true, message: `已记录到 ${result.entry.date}`, entry: result.entry }
  }, [calendar, wardrobe])

  // 胶囊里「加入想买清单」：直接写进衣橱（status=wishlist），这样它立刻参与后续推荐与备份。
  const addWishlistItem = useCallback((input) => {
    const item = wardrobe.create({ ...input, status: 'wishlist' })
    return item ? { ok: true, item } : { ok: false, message: '加入想买清单失败' }
  }, [wardrobe])

  // 导入备份/重置之后，数据管理器改的是 localStorage，而上面几个 hook 还握着旧 state。
  // 这里让它们重新读盘——否则用户看到「导入完成」但页面毫无变化，会以为导入没生效。
  // 注意收藏夹（looks）也存在 localStorage 里，它是 App 持有的 state，导入后必须一起重读，
  // 否则下一次「收藏这套」会用旧数组写回，把刚导入的收藏整个覆盖掉。
  const syncFromStorage = useCallback(() => {
    try {
      const store = defaultStorage()
      if (!store) return
      wardrobe.replaceAll(store.getItem(STORAGE_KEYS.wardrobe))
      daily.replaceAll(store.getItem(STORAGE_KEYS.daily))
      calendar.replaceAll(store.getItem(STORAGE_KEYS.calendar))
      reloadLooks()
    } catch (error) {
      console.warn('STYLE LAB: 重新读取本地数据失败，请手动刷新页面', error)
    }
  }, [wardrobe, daily, calendar, reloadLooks])

  // 衣橱卡片上的「试穿」：个人单品也要能上身，所以按 category 落到对应槽位。
  // 配饰是数组槽，重复点同一件时直接幂等（不叠加重复 id）。
  const onTryPersonalItem = useCallback((item) => {
    if (!item || typeof item.id !== 'string') return
    setOutfit((current) => {
      const next = cloneOutfit(current)
      if (item.category === 'accs') {
        next.accs = next.accs.includes(item.id) ? next.accs : [...next.accs, item.id]
      } else if (item.category === 'tops') next.top = item.id
      else if (item.category === 'outers') next.outer = item.id
      else if (item.category === 'bottoms') next.bottom = item.id
      else if (item.category === 'shoes') next.shoes = item.id
      else return current
      return next
    })
  }, [])

  // 评分卡与建议面板共用同一次评分结果，避免重复计算（16848 组合的评分函数不便宜）
  const advice = useMemo(() => {
    try {
      return getAdvice(outfit)
    } catch (error) {
      console.warn('STYLE LAB: 建议引擎计算失败，本帧跳过建议与评分', error)
      return null
    }
  }, [outfit])

  const current = [
    { k: '上装', v: byId(TOPS, outfit.top)?.name, hex: byId(TOPS, outfit.top)?.hex, on: () => setOutfit((o) => ({ ...o, top: 't-white' })) },
    { k: '外套', v: outfit.outer === 'o-none' ? '无' : byId(OUTERS, outfit.outer)?.name, hex: byId(OUTERS, outfit.outer)?.hex, on: () => setOutfit((o) => ({ ...o, outer: 'o-none' })) },
    { k: '下装', v: byId(BOTTOMS, outfit.bottom)?.name, hex: byId(BOTTOMS, outfit.bottom)?.hex, on: () => setOutfit((o) => ({ ...o, bottom: 'b-jeans-d' })) },
    { k: '鞋子', v: byId(SHOES, outfit.shoes)?.name, hex: byId(SHOES, outfit.shoes)?.hex, on: () => setOutfit((o) => ({ ...o, shoes: 's-white' })) },
  ]

  return (
    <>
      <a className="skip-link" href="#main">跳到主要内容</a>

      <nav className="nav" ref={navRef}>
        <div className="nav-inner">
          <div className="logo">型格 <span className="en">STYLE LAB</span></div>
          {/* 间距走 CSS 里的 .nav-links { gap: var(--sp-5) }，不再内联写死：
              内联值会盖掉样式表，改令牌时导航间距调不动（原先写死 20px 而令牌是另一套值）。 */}
          <div className="nav-links" ref={navLinksRef}>
            <a href="#planner">个人方案</a>
            <a href="#wardrobe">我的衣橱</a>
            <a href="#today">今日穿搭</a>
            <a href="#calendar">穿搭日历</a>
            <a href="#capsule">胶囊衣橱</a>
            <a href="#studio">3D 试衣间</a>
            <a href="#advice">穿搭建议</a>
            <a href="#laws">穿搭法则</a>
            <a href="#sources">博主资源</a>
            <a href="#data">数据管理</a>
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <ChapterRail items={CHAPTERS} />

      {/* 分享链接载入提示：读屏可闻的浮层。配色只走令牌，不写颜色字面量。 */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed', left: '50%', top: 74, transform: 'translateX(-50%)', zIndex: 150,
          display: hashNotice ? 'block' : 'none',
          background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)',
          borderRadius: 99, padding: '8px 18px', fontSize: 13,
          boxShadow: '0 6px 22px var(--th-shadow-md)',
        }}
      >
        {hashNotice}
      </div>

      <main id="main">
        <header className="hero">
          <h1><span className="hero-line"><span className="hero-line-inner">穿得好看，</span></span><span className="hero-line"><span className="hero-line-inner"><em>是可以学的</em>。</span></span></h1>
          <p className="sub">
            我们调研了 B站、知乎、小红书、YouTube、Reddit 上数十位男士穿搭博主的视频与帖子，
            把他们的建议整理成一个可交互的 3D 试衣间：换个上装，立刻告诉你该配什么裤子、什么鞋、什么配饰——每条建议都注明出处。
          </p>
          <div className="hero-stats">
            <div className="hero-stat"><b><span className="sr-only">{PROJECT_STATS.sources}</span><CountUp value={PROJECT_STATS.sources} /></b><span>条全网博主资源</span></div>
            <div className="hero-stat"><b><span className="sr-only">{PROJECT_STATS.laws}</span><CountUp value={PROJECT_STATS.laws} /></b><span>条穿搭法则</span></div>
            <div className="hero-stat"><b><span className="sr-only">{PROJECT_STATS.items}</span><CountUp value={PROJECT_STATS.items} /></b><span>件可试穿单品</span></div>
            <div className="hero-stat"><b><span className="sr-only">{PROJECT_STATS.presets}</span><CountUp value={PROJECT_STATS.presets} /></b><span>套一键造型</span></div>
          </div>
        </header>

        <section className="section" id="planner">
          <div className="sec-head" data-reveal>
            <span className="no">01</span><h2>个人造型方案</h2>
            <span className="desc">填写身高、体型、季节和场景 · 获得三套可解释、可试穿的推荐</span>
          </div>
          <div data-reveal style={{ '--reveal-i': 1 }}>
            <ProfileRecommender onTry={tryRecommendedLook} wardrobe={wardrobe} preferences={preferences} profile={profile} onProfileChange={setProfile} />
          </div>
        </section>

        <section className="section" id="wardrobe">
          <div className="sec-head" data-reveal>
            <span className="no">02</span><h2>我的衣橱</h2>
            <span className="desc">录入你自己的单品 · 推荐与智能替换将优先使用它们 · 反馈越多越准</span>
          </div>
          <div data-reveal style={{ '--reveal-i': 1 }}>
            <WardrobeSection
              wardrobe={wardrobe}
              preferences={preferences}
              outfit={outfit}
              onTry={onTryPersonalItem}
            />
          </div>
        </section>

        <section className="section" id="today">
          <div className="sec-head" data-reveal>
            <span className="no">03</span><h2>今日穿搭</h2>
            <span className="desc">填今天的天气与场合 · 推荐会自动偏向保暖、防水与正式度</span>
          </div>
          <div data-reveal style={{ '--reveal-i': 1 }}>
            <TodayPlanner
              daily={daily}
              wardrobe={wardrobe}
              preferences={preferences}
              outfit={outfit}
              onTry={tryRecommendedLook}
              onRecord={recordLook}
            />
          </div>
        </section>

        <section className="section" id="calendar" style={{ background: 'var(--bg2)', maxWidth: '100%' }}>
          <div data-reveal style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div className="sec-head">
              <span className="no">04</span><h2>穿搭日历</h2>
              <span className="desc">记下每天穿了什么 · 看使用频率、闲置提醒与重复购买提示</span>
            </div>
            <OutfitCalendar
              calendar={calendar}
              wardrobe={wardrobe}
              outfit={outfit}
              onTry={tryRecommendedLook}
              onRecord={recordLook}
            />
          </div>
        </section>

        <section className="section" id="capsule">
          <div className="sec-head" data-reveal>
            <span className="no">05</span><h2>胶囊衣橱</h2>
            <span className="desc">按季节和场合挑出十几件就能搭出一整季 · 缺什么、先买什么一目了然</span>
          </div>
          <div data-reveal style={{ '--reveal-i': 1 }}>
            <CapsulePlanner
              wardrobe={wardrobe}
              onTry={tryRecommendedLook}
              onAddWishlist={addWishlistItem}
            />
          </div>
        </section>

        <section className="section" id="studio">
          <div className="sec-head" data-reveal>
            <span className="no">06</span><h2>3D 试衣间</h2>
            <span className="desc">拖动旋转 · 点击右侧衣柜换装 · 滚轮留给页面滚动</span>
          </div>
          <div className="studio">
            <div className="stage-wrap">
              <div className="stage">
                <LazyStudio outfit={outfit} autoRotate={autoRotate} profile={profile} />
                <span className="stage-badge"><IconMouse /> 左键拖动旋转 · {describeBodyProfile(profile)}</span>
                <div className="stage-tools">
                  <button
                    type="button"
                    className={`tool-btn ${autoRotate ? 'on' : ''}`}
                    aria-pressed={autoRotate}
                    onClick={() => setAutoRotate((v) => !v)}
                  >
                    {autoRotate ? <><IconPause /> 停止旋转</> : <><IconPlay /> 自动旋转</>}
                  </button>
                </div>
              </div>
              <div className="outfit-now">
                {current.map((c) => (
                  <span className="chip" key={c.k}>
                    <i style={{ background: c.hex === '#00000000' ? 'repeating-linear-gradient(45deg,var(--line),var(--line) 4px,var(--card) 4px,var(--card) 8px)' : c.hex }} />
                    {c.k}：{c.v}
                    <button
                      type="button" className="x"
                      title={`把${c.k}恢复默认`} aria-label={`把${c.k}恢复默认`}
                      onClick={c.on}
                    ><IconRotateCcw /></button>
                  </span>
                ))}
                {outfit.accs.map((a) => (
                  <span className="chip" key={a}>
                    <i style={{ background: byId(ACCS, a)?.hex }} />
                    {byId(ACCS, a)?.name}
                    <button
                      type="button" className="x"
                      title={`去掉${byId(ACCS, a)?.name}`}
                      aria-label={`去掉配饰${byId(ACCS, a)?.name}`}
                      onClick={() => setOutfit((o) => ({ ...o, accs: o.accs.filter((x) => x !== a) }))}
                    >×</button>
                  </span>
                ))}
              </div>

              <ShareBar
                outfit={outfit}
                onApply={applyOutfit}
                wardrobe={wardrobe}
                looks={looksStore.looks}
                onAddLook={looksStore.addLook}
                onDeleteLook={looksStore.deleteLook}
              />
            </div>
            {/* minWidth:0 是 .studio 网格项的必要约束，否则内部的单品长名会把列撑破 */}
            <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <ScoreCard score={advice?.score} />
              <Panel outfit={outfit} setOutfit={setOutfit} />
            </div>
          </div>
          {/* 契约 §7：智能替换入口放在 3D 区域，结果经 App 的 setOutfit 回填 */}
          <div className="po-replace-wrap" data-reveal>
            <SmartReplaceBlock
              outfit={outfit}
              wardrobe={wardrobe}
              preferences={preferences}
              onApply={applyOutfit}
            />
          </div>
          {/* 契约 §2：当前这套的平面拼贴，导出走 Canvas 2D，不引依赖 */}
          <OutfitCollage
            outfits={[{ name: '当前造型', outfit, score: advice?.score?.total ?? null }]}
            preset="auto"
          />
        </section>

        <section className="section" id="advice" style={{ background: 'var(--bg2)', maxWidth: '100%' }}>
          <div data-reveal style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div className="sec-head">
              <span className="no">07</span><h2>穿搭建议</h2>
              <span className="desc">随你身上的搭配实时变化 · 点击"试试这件"直接上身</span>
            </div>
            <AdvicePanel outfit={outfit} setOutfit={setOutfit} />
          </div>
        </section>

        {/* 法则字带：内容全部取自 LAWS，纯展示（aria-hidden），作为 08 区块的引子。 */}
        <div className="law-band" aria-hidden="true">
          <div className="law-band-track">
            {[...LAWS, ...LAWS].map((law, index) => (
              <span className="law-band-item" key={`${law.n}-${index}`}>
                <b>{law.n}</b>{law.title}<i>·</i>
              </span>
            ))}
          </div>
        </div>

        <section className="section" id="laws">
          <div className="sec-head" data-reveal>
            <span className="no">08</span><h2>穿搭法则</h2>
            <span className="desc">从博主视频里提炼的 {PROJECT_STATS.laws} 条通用原则，每条附原始出处</span>
          </div>
          <Laws />
        </section>

        <section className="section" id="sources" style={{ background: 'var(--bg2)', maxWidth: '100%' }}>
          <div data-reveal style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div className="sec-head">
              <span className="no">09</span><h2>博主资源库</h2>
              <span className="desc">点击任意卡片跳转到原视频/帖子 · 持续更新</span>
            </div>
            <Sources />
          </div>
        </section>

        {/* 契约 §7：数据管理器位于页脚之前，负责备份 / 恢复 / 重置 */}
        <section className="section po-data-wrap" id="data">
          <div className="sec-head" data-reveal>
            <span className="no">10</span><h2>数据管理</h2>
            <span className="desc">导出备份包 · 导入恢复 · 一键重置 · 照片与反馈都在里面</span>
          </div>
          <div data-reveal style={{ '--reveal-i': 1 }}>
            <DataSection imageStore={imageStore} onAfterImport={syncFromStorage} />
          </div>
        </section>
      </main>

      <footer>
        <div className="foot-inner">
          <span>型格 STYLE LAB · 一个用爱发电的男士穿搭知识库。建议内容整理自公开网络视频与帖子，版权归原作者所有。</span>
          <span>Built with React + Three.js · 2026-09</span>
        </div>
      </footer>
    </>
  )
}
