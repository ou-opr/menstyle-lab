// 桌面端章节进度轨：只在大屏出现，作为现有顶部导航的补充。
// 键盘可聚焦、带 aria-label；小屏与减少动效场景不改变任何布局。

import { useEffect, useState } from 'react'

export function ChapterRail({ items }) {
  const [active, setActive] = useState(items[0]?.id || '')

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const line = Math.min(window.innerHeight * 0.32, 240)
      let current = items[0]?.id || ''
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= line) current = item.id
      }
      setActive((prev) => (prev === current ? prev : current))
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
  }, [items])

  return (
    <nav className="chapter-rail" aria-label="章节进度">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={active === item.id ? 'true' : undefined}
          aria-label={`第 ${item.no} 节：${item.label}`}
        >
          <span className="rail-no">{item.no}</span>
          <span className="rail-name">{item.label}</span>
        </a>
      ))}
    </nav>
  )
}

export default ChapterRail
