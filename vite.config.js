import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// npm run build        -> dist/        常规构建（配合 npm run preview 或部署）
// npm run build:single -> dist-single/ 单文件版：所有 JS/CSS 内联进一个 HTML，支持直接双击打开
export default defineConfig(({ mode }) => {
  const isSingle = mode === 'single'
  return {
    plugins: [react(), ...(isSingle ? [viteSingleFile()] : [])],
    base: './',
    server: { port: 5173, host: true },
    build: isSingle
      ? {
          outDir: 'dist-single',
          assetsInlineLimit: 100000000,
          chunkSizeWarningLimit: 6000,
          cssCodeSplit: false,
        }
      : {
          chunkSizeWarningLimit: 6000,
          rollupOptions: {
            output: {
              // 分包策略：把 three 生态从「懒加载 Mannequin chunk」里再切出来。
              // 原来只有 react 被单独切成 react-vendor，three + fiber + drei 全塞进
              // Mannequin-*.js（770KB / gzip 205KB）——进一次试衣间就要下完整个包。
              // 切成三片后浏览器可并行下载，且只改 UI 时 three 那部分的缓存不会失效。
              // 分包策略：**只把 react 单独切出去**，three 生态留在懒加载 chunk 里。
              //
              // 曾经把 three / fiber / drei 各切一片（three-core 669KB），理由是
              // 「浏览器可并行下载、改 UI 时 three 缓存不失效」。实测这个理由站不住：
              //
              //   · 一旦 three 成为独立 chunk，Rollup 必须在 index chunk 里生成
              //     `import "./three-core-xxx.js"`（副作用导入），否则无法保证模块初始化顺序；
              //   · Vite 见到这条静态 import，就给 index.html 注入 <link rel="modulepreload">；
              //   · 结果：**首屏就下载 three-core**，首屏 JS 从 202KB 涨到 395KB（gzip），
              //     而 three 本来只在滚到 3D 试衣间时才需要（LazyStudio 动态 import）。
              //
              // 实测对照（preview 构建，performance.getEntriesByType('resource')）：
              //   拆 three：首屏 5 个 js / 395KB（含 three-core 173KB + fiber 12 + drei 8）
              //   不拆   ：首屏 2 个 js / 202KB（index 128 + react-vendor 74）
              //   → 首屏省 193KB，代价只是「改 UI 时 three 缓存失效」——而 three 是
              //     package.json 里版本号锁定的，本来就不常变，这个代价可以忽略。
              //
              // 缓存收益 vs 首屏体积：首屏是每个用户每次访问都要付的钱，缓存只影响回访；
              // 而且把 669KB 的 three-core 提前下载，等于让「只想看排版和法则」的用户
              // 也为 3D 付费。所以这里选择不拆。
              manualChunks(id) {
                if (id.includes('node_modules/react')) return 'react-vendor'
                return undefined
              },
            },
          },
        },
  }
})
