# 历史记录（随临时目录删除而消失的事实）

> 本文件记录已随 `_t3-verify/`、`.t2-tmp/` 等临时目录一起被删除、但 `reports/` 中没有等价记录的历史事实。

## 1. repo-wide `vite build` 曾因 Mannequin.jsx 失败

`.t3-verify/build-check.mjs` 头部注释记录：repo 级 `vite build` 曾因队友在途文件
`src/three/Mannequin.jsx` import 了当时尚未编写的 `./garments`（t6-garments）而失败，
与 T3 自己的五个文件无关，因此 T3 用「绝对路径 import repo 内 vite / plugin-react」做隔离验证。

## 2. `scripts/.validate.mjs.*.tmpdir` 导致 vite watcher EBUSY

`.t3-verify/vite.config.mjs` 记录：队友并行跑 `npm test` 会产生
`scripts/.validate.mjs.*.tmpdir` 锁定目录，使默认 watcher 崩溃并报 EBUSY，
把 dev server 拖垮；规避方式是在该临时配置里加
`server.watch.ignored: ['**/scripts/**', '**/*.tmpdir/**', '**/dist/**']`。

## 3. `.t2-tmp/*.txt` 日志中的演进结论

`baseline-test.txt` → `build-final.txt` → `build2.txt` 的 validate 输出记录了演进：
预设 8→19、组合遍历 2000→16848、建议引擎上装 10→16（单品最终为 59 件：16/9/13/9/12）。

## 清理执行记录（2026-10-16）

- 已删除 5 项：`D:\穿搭\_t3-verify.mjs`（旧 A1）、`D:\穿搭\.t3-verify\`（旧 A2，整树）、`D:\穿搭\style-lab\.t2-tmp\`（旧 A3，整树）、`D:\穿搭\style-lab\dist\`（旧 A4，整树）、`D:\穿搭\style-lab\dist-single\`（旧 A5，整树）。
- 新增两个正式测试脚本并接入 `npm test`：
  - `style-lab/scripts/test-share.mjs`：159 项断言，覆盖 share.js 编解码往返 + 26 项非法输入零抛出 + SHARE_VERSION + outfitToText 降级。
  - `style-lab/scripts/test-sources.mjs`：45 项断言，esbuild 打包 Sources.jsx 后断言 filterSources/searchSources/paginate/buildFacets/排序/分页/SSR 无障碍。
- 教训：A1–A3 名为临时，实为 `share.js` 与 `Sources.jsx` 唯一存在的自动化测试覆盖（原 `scripts/` 14 个脚本对这两模块零覆盖），故先收割成上述两个正式测试再删除。
