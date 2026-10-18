import { useCountUp } from '../hooks/useMotion'

/**
 * 视觉数字：读屏由调用方提供静态值（sr-only 或 aria-label），
 * 这里只负责动画，避免读屏每帧播报。
 */
export function CountUp({ value, duration = 900, className = '' }) {
  const display = useCountUp(value, { duration })
  return <span className={className} aria-hidden="true">{display}</span>
}

export default CountUp
