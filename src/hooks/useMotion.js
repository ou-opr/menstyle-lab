// 表现层动效 hook：滚动入场、导航进度、数字滚动。
// 只做视觉状态，不参与任何数据或推荐逻辑；所有动效都尊重 prefers-reduced-motion。

import { useEffect, useRef, useState } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** 同步读取系统的减少动效偏好（SSR / 无 matchMedia 时按 false 处理）。 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_QUERY).matches
    : false
}

/** 订阅系统的减少动效偏好，运行中切换也会即时生效。 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(REDUCED_QUERY)
    const onChange = (event) => setReduced(event.matches)
    setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * 给所有 [data-reveal] 元素加一次性入场：进入视口后加 .is-revealed。
 * 关闭动效 / 不支持 IntersectionObserver 时直接全部显示，绝不把内容锁在透明态。
 */
export function useScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'))
    if (!nodes.length) return undefined

    const root = document.documentElement
    const reveal = (node) => node.classList.add('is-revealed')

    // 先允许动效层隐藏待入场元素，再在同一个任务里把首屏元素标为已揭示，
    // 因此首屏不会闪；脚本失败时 html 没有这个类，内容默认可见。
    root.classList.add('motion-ready')

    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      nodes.forEach(reveal)
      return () => root.classList.remove('motion-ready')
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        reveal(entry.target)
        observer.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })

    // 首屏已在视口内的区块立刻显示，避免挂载后先闪一下再动画。
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < window.innerHeight * 0.94) reveal(node)
      else observer.observe(node)
    }

    return () => {
      observer.disconnect()
      root.classList.remove('motion-ready')
    }
  }, [])
}

/** 把页面滚动进度写到元素的 CSS 变量上，并按滚动距离切换紧凑态；不触发 React 重渲染。 */
export function useNavScroll(ref) {
  useEffect(() => {
    const nav = ref.current
    if (!nav) return undefined

    let raf = 0
    const update = () => {
      raf = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      nav.style.setProperty('--scroll-progress', progress.toFixed(4))
      nav.classList.toggle('is-compact', window.scrollY > 24)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

/**
 * 数字从当前值滚动到目标值。
 * 首次挂载从 0 开始；后续目标变化从当前显示值继续，不会跳回 0。
 */
export function useCountUp(value, { duration = 900 } = {}) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(reduced ? target : 0)
  const currentRef = useRef(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      currentRef.current = target
      setDisplay(target)
      return undefined
    }

    const from = currentRef.current
    if (from === target) {
      setDisplay(target)
      return undefined
    }

    let raf = 0
    let start = 0
    const step = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (target - from) * eased)
      currentRef.current = next
      setDisplay(next)
      if (t < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])

  return display
}
