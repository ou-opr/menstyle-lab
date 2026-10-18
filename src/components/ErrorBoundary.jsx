import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('STYLE LAB render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app-error" role="alert">
        <span>STYLE LAB</span>
        <h1>页面遇到了一点问题</h1>
        <p>你的搭配数据没有被提交到服务器。刷新页面即可重新开始。</p>
        <button onClick={() => window.location.reload()}>重新加载</button>
      </main>
    )
  }
}
