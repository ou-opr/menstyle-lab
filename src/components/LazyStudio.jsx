import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { byId, TOPS, OUTERS, BOTTOMS, SHOES } from '../data/catalog'
import { IconDiamond } from './icons'

const Studio = lazy(() => import('../three/Mannequin.jsx').then((module) => ({ default: module.Studio })))

// 探测 WebGL 后必须立刻释放探测用的上下文：浏览器同时存活的 WebGL 上下文数量有上限
// （Chrome 16 个左右），探测完不 loseContext 就等于长期占掉一个名额，反复挂载会耗尽。
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return true
  } catch {
    return false
  }
}

function OutfitFallback({ outfit, title, detail }) {
  const items = [
    byId(TOPS, outfit.top)?.name,
    outfit.outer === 'o-none' ? null : byId(OUTERS, outfit.outer)?.name,
    byId(BOTTOMS, outfit.bottom)?.name,
    byId(SHOES, outfit.shoes)?.name,
  ].filter(Boolean)
  return (
    <div className="stage-fallback" role="status">
      <span className="stage-fallback-icon"><IconDiamond /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
      <div>{items.map((item) => <span key={item}>{item}</span>)}</div>
    </div>
  )
}

class StageBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('3D stage error', error) }
  render() {
    if (this.state.failed) return <OutfitFallback {...this.props} title="3D 模型加载失败" detail="你仍可使用衣柜、推荐和穿搭建议。" />
    return this.props.children
  }
}

// 进入视口才挂载（省首屏），离开视口要暂停渲染（省电）。
// 这两种语义都需要持续观察，所以 observer 不再在首次相交后 disconnect：
// 修复前它只负责「首次挂载」，滚出视口后画布仍在全速空转。
export function LazyStudio({ outfit, autoRotate, profile }) {
  const host = useRef(null)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [webgl] = useState(() => supportsWebGL())

  useEffect(() => {
    if (!webgl || ready) return undefined
    if (!('IntersectionObserver' in window)) {
      setReady(true)
      setActive(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true)
        observer.disconnect()
      }
    }, { rootMargin: '280px' })
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [ready, webgl])

  // 挂载之后单独跟踪可见性：留 120px 余量，滚到边缘前就恢复出帧，避免肉眼可见的一帧空白。
  useEffect(() => {
    if (!ready || !webgl) return undefined
    if (!('IntersectionObserver' in window)) {
      setActive(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '120px' })
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [ready, webgl])

  if (!webgl) {
    return <OutfitFallback outfit={outfit} title="当前浏览器不支持 WebGL" detail="已切换为文字试衣模式，其他功能不受影响。" />
  }

  return (
    <div className="stage-canvas-host" ref={host}>
      {ready ? (
        <StageBoundary outfit={outfit}>
          <Suspense fallback={<OutfitFallback outfit={outfit} title="正在准备 3D 试衣间" detail="先展示搭配内容，模型将在进入视野时加载。" />}>
            <Studio outfit={outfit} autoRotate={autoRotate} profile={profile} active={active} />
          </Suspense>
        </StageBoundary>
      ) : (
        <OutfitFallback outfit={outfit} title="3D 试衣间稍后加载" detail="浏览到这里时再加载模型，减少首屏等待。" />
      )}
    </div>
  )
}
