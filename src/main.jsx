import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
// initTheme 必须在首帧渲染前生效：它同步读 localStorage + prefers-color-scheme
// 并写入 <html data-theme>，因此第一帧就已经是对应主题，不会先亮后暗（FOUC）。
// ThemeToggle.jsx 在模块被 import 时也会自举一次，这里是显式兜底，幂等。
import { initTheme } from './components/ThemeToggle.jsx'
import './styles.css'
import './styles/motion.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
)
