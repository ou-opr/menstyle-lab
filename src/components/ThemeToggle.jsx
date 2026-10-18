import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../hooks/useMotion'
import '../styles/theme.css'

/* 主题偏好的存储键（契约约定的 'stylelab:' 前缀） */
export const THEME_STORAGE_KEY = 'stylelab:theme'
/* 三态：auto 跟随系统 / light 强制亮 / dark 强制深 */
export const THEME_MODES = ['auto', 'light', 'dark']

const DARK_QUERY = '(prefers-color-scheme: dark)'
const MODE_LABELS = { auto: '自动（跟随系统）', light: '亮色', dark: '深色' }
const SHORT_LABELS = { auto: '自动', light: '亮', dark: '深' }

const isMode = (value) => THEME_MODES.includes(value)

const hasWindow = () => typeof window !== 'undefined' && typeof document !== 'undefined'

function readStoredMode() {
  if (!hasWindow()) return 'auto'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isMode(raw) ? raw : 'auto'
  } catch (error) {
    console.warn('STYLE LAB: 读取主题偏好失败，本次回退到「自动」', error)
    return 'auto'
  }
}

function storeMode(mode) {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch (error) {
    /* 隐私模式 / 存储被禁用：不影响本次会话的主题生效 */
    console.warn('STYLE LAB: 保存主题偏好失败（可能是隐私模式），本次会话内仍然生效', error)
  }
}

function systemPrefersDark() {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

const resolveTheme = (mode, prefersDark) => {
  if (mode === 'light' || mode === 'dark') return mode
  return prefersDark ? 'dark' : 'light'
}

function applyTheme(mode, prefersDark) {
  if (!hasWindow()) return 'light'
  const resolved = resolveTheme(mode, prefersDark)
  document.documentElement.dataset.theme = resolved
  /* 额外记录原始模式，便于调试与将来的 CSS 分支（如 data-theme-mode='auto'） */
  document.documentElement.dataset.themeMode = mode
  return resolved
}

/**
 * 防首屏闪烁（FOUC）：供 Lead 在 main.jsx 最顶部调用。
 * 同步读 localStorage + prefers-color-scheme 并写入 documentElement.dataset.theme，
 * 因此第一帧就已经是对应主题，不会先亮后暗。幂等，可安全重复调用。
 * @returns {'auto'|'light'|'dark'} 生效的偏好模式
 */
export function initTheme() {
  const mode = readStoredMode()
  applyTheme(mode, systemPrefersDark())
  return mode
}

/* 模块被 import 时也立刻自举一次：即使 Lead 忘记接线，
   只要这个组件被打包进来，主题在渲染前就已经确定，不会闪烁。 */
if (hasWindow()) initTheme()

export function ThemeToggle() {
  const [mode, setMode] = useState(readStoredMode)
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark)

  /* 系统主题变化的监听器：挂载一次，卸载时必定移除 */
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event) => setPrefersDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(mode, prefersDark)

  /* 用户显式选择亮/深时，prefersDark 变化不会改变 resolved，因此这里不会被系统带跑 */
  useEffect(() => {
    applyTheme(mode, prefersDark)
  }, [mode, prefersDark])

  const pick = (next) => {
    const commit = () => {
      // 同步写入 <html data-theme>：View Transition 的新快照才能捕获到新配色。
      // 随后的 effect 会再幂等执行一次，不影响结果。
      applyTheme(next, prefersDark)
      setMode(next)
      storeMode(next)
    }
    if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
      document.startViewTransition(commit)
    } else {
      commit()
    }
  }

  return (
    <div className="theme-toggle" role="group" aria-label={`主题模式，当前：${MODE_LABELS[mode]}`}>
      {THEME_MODES.map((key) => (
        <button
          key={key}
          type="button"
          className={`theme-toggle-btn ${mode === key ? 'on' : ''}`}
          aria-pressed={mode === key}
          aria-label={`切换到${MODE_LABELS[key]}主题`}
          title={`切换到${MODE_LABELS[key]}主题`}
          onClick={() => pick(key)}
        >
          <span aria-hidden="true">{SHORT_LABELS[key]}</span>
        </button>
      ))}
      <span className="sr-only" role="status">
        当前主题模式：{MODE_LABELS[mode]}，实际显示{MODE_LABELS[resolved]}
      </span>
    </div>
  )
}

export default ThemeToggle
