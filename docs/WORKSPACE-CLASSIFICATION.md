# 工作区文件分类归纳报告（D:\穿搭）

- 生成时间：2026-10-16（Asia/Shanghai）
- 范围：`D:\穿搭` 全工作区（`style-lab/node_modules` 仅统计大小，不展开）
- 底稿：`style-lab/docs/INVENTORY-BEFORE-CLEANUP.csv`（136 行，已排除 node_modules 与 .mimosa）
- 方法：只读侦察（目录列表、文件头部、export/import 语句、脚本源码、README/契约文档），未运行 build、未安装依赖、未修改任何文件
- 本报告为「清理前分类 + 清理后状态」双时点文档：§2 分类总表保留清理前建议的原始行，处置列已就地更新为清理后的实际结果；清理执行详情见 §9

## 目录

1. [总览](#1-总览)
2. [分类总表](#2-分类总表)
3. [src 64 个源文件逐文件职责](#3-src-64-个源文件逐文件职责)
4. [依赖与数据流关系](#4-依赖与数据流关系)
5. [生成物与源的对应关系](#5-生成物与源的对应关系)
6. [孤岛文件](#6-孤岛文件)
7. [style-lab 目录结构合理性判断](#7-style-lab-目录结构合理性判断)
8. [不确定项](#8-不确定项)

---

## 1. 总览

### 1.1 工作区根（`D:\穿搭`）

> 清理后 `_t3-verify.mjs`、`.t3-verify/` 已删除；下表保留清理前快照行作对照。

| 路径 | 类型 | 说明 |
|---|---|---|
| `style-lab/` | 目录 | 项目本体：React 18 + Vite 5 + Three.js 0.169 男士穿搭网站 |
| `型格穿搭实验室-双击打开.html` | 文件 | 产品入口：单文件构建成品（与 `style-lab/dist-single/index.html` SHA256 相同），必须保留 |
| `_t3-verify.mjs` | 文件 | 分享编解码（share.js）的临时验证脚本，自称「放在仓库外」 |
| `.t3-verify/` | 目录 | 独立的小型 vite 验证工程（ShareBar/ExportCard/share.js 的浏览器端往返验证） |
| `.mimosa/` | 目录 | 第三方代码审查工具（mimosa）状态目录，非项目内容 |
| `.v2c/` | 目录 | 内含 78 字节指针文件 `plugin_root`，指向 video2code 插件缓存路径，非项目内容 |

### 1.2 项目本体（`D:\穿搭\style-lab`）

> 清理后 `dist/`、`dist-single/`、`.t2-tmp/` 已删除；下表保留清理前快照行作对照。

| 路径 | 类型 | 说明 |
|---|---|---|
| `src/` | 目录 | 全部源码（64 个文件：组件/数据/钩子/样式/3D/纹理/入口） |
| `scripts/` | 目录 | 16 个 Node 脚本（验证、单元测试、文档生成、链接检查、发布复制）+ 1 个 Python 构建辅助脚本（字体子集） |
| `docs/` | 目录 | 4 份接口契约 + 1 份清理底稿 CSV（+ 本报告） |
| `reports/` | 目录 | 3 份交付报告 + 11 张交付截图 |
| `research/` | 目录 | 4 份调研原始材料 + 1 份自动生成汇总 |
| `dist/` | 目录 | 常规构建产物（多文件，`npm run build` 生成） |
| `dist-single/` | 目录 | 单文件构建产物（`npm run build:single` 生成，release 脚本的复制源） |
| `node_modules/` | 目录 | npm 依赖：9247 文件 / 892 目录 / 273,765,266 字节（约 261 MB） |
| `.t2-tmp/` | 目录 | 构建/探针临时目录（Sources 组件验证残留） |
| `.mimosa/` | 目录 | mimosa 审查工具状态目录，非项目内容 |
| `index.html` | 文件 | Vite 开发入口 HTML（含主题防闪烁与 file:// 白屏诊断） |
| `package.json` | 文件 | 项目清单与 npm 脚本（dev/validate/test:*/docs/check:links/build 系列） |
| `package-lock.json` | 文件 | 依赖锁定 |
| `README.md` | 文件 | 项目说明（含 AUTO_STATS 自动生成段） |
| `vite.config.js` | 文件 | Vite 配置（常规构建 + single 单文件模式） |

### 1.3 规模统计（清理前，已核实）

- 工作区整体：9448 文件 / 929 目录 / 268.78 MB（背景事实，直接采信）
- `style-lab/node_modules`：9247 文件 / 892 目录 / 约 261 MB，占工作区文件数与体积的绝大部分
- 非 node_modules、非 .mimosa 文件：135 个（本报告分类总表逐条覆盖）
- `src/` 源文件：64 个（注：任务书写 `data/(15)`，实际 `src/data/` 有 16 个文件，总数 64 = 21 components + 16 data + 5 hooks + 13 styles + 4 three + 3 根级 + 2 纹理资产）
- 本工作区不是 git 仓库，无版本控制兜底（`D:\穿搭\.git` 与 `D:\穿搭\style-lab\.git` 均不存在）

---

## 2. 分类总表

> 处置列取值（清理后实际结果）：保留 / 已删除 / 归档 / 待定（0 项）。本表为双时点表格：保留清理前建议的原始行，处置列就地标注实际结果。路径均为工作区相对路径（`style-lab/...` 指 `D:\穿搭\style-lab\...`，根级文件直接写文件名或 `.xxx\...`）。

### 2.1 工作区根级文件与验证工程

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `型格穿搭实验室-双击打开.html` | 交付成品 | 单文件版网站成品，产品入口，双击即可打开 | 脚本生成（`npm run build:release` 由 `style-lab/scripts/release.mjs` 从 `style-lab/dist-single/index.html` 复制） | 保留 | 产品入口，SHA256 与 dist-single 相同，README 与交付报告均记为交付成品 |
| `_t3-verify.mjs` | 验证脚本 | 分享编解码（encodeOutfit/decodeOutfit）往返与非法输入测试 | 手写 | 已删除（能力已升格为 style-lab/scripts/test-share.mjs） | 临时验证脚本，自称「放在仓库外」；无任何脚本/文档引用它，验证目标已交付 |
| `.t3-verify/build-check.mjs` | 验证脚本 | 校验 .t3-verify 构建产物是否可加载 | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 独立验证工程内部脚本，无外部引用 |
| `.t3-verify/entry.jsx` | 验证源码 | ShareBar/ExportCard 的浏览器端验证入口 | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 同属临时验证工程 |
| `.t3-verify/harness.html` | 验证源码 | 验证工程的 HTML 挂载页 | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 同属临时验证工程 |
| `.t3-verify/recheck.mjs` | 验证脚本 | 复查验证结果 | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 同属临时验证工程 |
| `.t3-verify/roundtrip.mjs` | 验证脚本 | 编解码往返验证（import `style-lab/src/data/share.js` 与 `catalog.js`） | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 同属临时验证工程 |
| `.t3-verify/vite.config.mjs` | 配置 | 验证工程自身的 Vite 配置 | 手写 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 同属临时验证工程 |
| `.t3-verify/exported-card.png` | 验证产物 | 验证工程导出的造型卡图片 | 验证工程导出 | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 验证证据，无运行期引用 |
| `.t3-verify/dist-t3/assets/entry-CKPlsAEl.css` | 验证产物 | 验证工程构建出的 CSS | `vite build`（.t3-verify 内） | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 可重建 |
| `.t3-verify/dist-t3/assets/entry-Dro5HFl9.js` | 验证产物 | 验证工程构建出的 JS | `vite build`（.t3-verify 内） | 已删除（.t3-verify/ 整树已删除，能力已升格为 style-lab/scripts/test-share.mjs） | 可重建 |
| `.v2c/plugin_root` | 工具指针 | 78 字节文件，内容为 `C:\Users\OMEN\.zcode\cli\plugins\cache\zcode-plugins-official\video2code\0.6.0` | 插件写入 | 保留（用户裁决） | video2code 插件指向自身根路径的指针，删除可能影响插件；用户已裁决保留 |
| `.mimosa/`（根级） | 工具状态目录 | mimosa 审查工具状态：hook-state（基线/续跑 JSON）、hook-status | 工具写入 | 保留（用户裁决） | 第三方工具状态，非项目内容；用户已裁决保留 |
| `style-lab/.mimosa/` | 工具状态目录 | mimosa 审查工具状态：finding-ledger/history/hook-state/hook-status/reports（约 40 个 JSON） | 工具写入 | 保留（用户裁决） | 同上，体积更大、历史更久（2026-09-27/28）；用户已裁决保留 |

### 2.2 style-lab 根级文件

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `style-lab/index.html` | 项目源码 | Vite 开发入口 HTML：挂载 #root、主题防闪烁脚本、file:// 白屏诊断、`<script type="module" src="/src/main.jsx">` | 手写 | 保留 | 开发服务器入口，`npm run dev` 必需 |
| `style-lab/package.json` | 项目配置 | 项目清单：name=menstyle-lab，type=module，scripts=dev/validate/test:*/docs/check:links/build/build:single/build:release/preview，依赖 react/react-dom/three/@react-three/*、dev 依赖 vite/@vitejs/plugin-react/vite-plugin-singlefile | 手写 | 保留 | 项目定义与全部 npm 脚本，prebuild 钩子先跑 `npm test && npm run docs` |
| `style-lab/package-lock.json` | 依赖锁定 | npm 依赖版本锁定（94305 字节） | `npm install` 生成 | 保留 | 保证依赖可复现 |
| `style-lab/README.md` | 文档 | 项目说明：快速开始、功能说明、AUTO_STATS 自动统计段、调研来源表、技术栈、目录结构、免责声明 | 手写 + `npm run docs` 更新 AUTO_STATS 段 | 保留 | 项目主文档，自动段由 generate-docs.mjs 维护 |
| `style-lab/vite.config.js` | 项目配置 | Vite 配置：常规构建（manualChunks 拆 react-vendor）与 `--mode single` 单文件构建（viteSingleFile 插件、outDir=dist-single） | 手写 | 保留 | 构建配置，`npm run build` / `build:single` 必需 |

### 2.3 style-lab/docs 与 style-lab/reports 与 style-lab/research

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `style-lab/docs/CONTRACT.md` | 文档 | 共享接口契约 v1（冻结）：全局硬约束、文件所有权表、数据形状、单品 ID 清单 | 手写（调度者维护） | 保留 | 开发期唯一权威契约，源码注释多处引用 |
| `style-lab/docs/PHASE1-CONTRACT.md` | 文档 | 阶段一接口契约：个人衣橱闭环（PersonalItem v1、照片仓库、备份包 v1） | 手写 | 保留 | `src/data/wardrobe.js`、`imageStore.js`、`backup.js` 的实现依据 |
| `style-lab/docs/PHASE2-CONTRACT.md` | 文档 | 阶段二契约：每日使用闭环（今日条件 v1、穿搭日历 v1） | 手写 | 保留 | `src/data/daily.js`、`calendar.js` 的实现依据 |
| `style-lab/docs/PHASE3-CONTRACT.md` | 文档 | 阶段三契约：多套对比+二维拼贴、3D 体型参数、性能优化、版本迁移与浏览器测试矩阵 | 手写 | 保留 | `src/data/collage.js`、`src/three/bodyProfile.js` 的实现依据 |
| `style-lab/docs/INVENTORY-BEFORE-CLEANUP.csv` | 清单底稿 | 135 个非 node_modules/非 .mimosa 文件的 RelPath/Bytes/SHA256/Modified 清单 | 上游生成 | 归档 | 本次清理任务的输入底稿，本报告完成后可归档 |
| `style-lab/reports/DELIVERY-2026-10-15.md` | 交付报告 | 完善优化交付报告（建议引擎扩容、单文件发布说明） | 手写 | 归档 | 历史交付记录，非运行期依赖 |
| `style-lab/reports/DELIVERY-PHASE2-2026-10-15.md` | 交付报告 | 阶段二交付报告 | 手写 | 归档 | 历史交付记录 |
| `style-lab/reports/DELIVERY-PHASE3-2026-10-15.md` | 交付报告 | 阶段三交付报告（A/B 完成、C/D 完成度说明） | 手写 | 归档 | 历史交付记录 |
| `style-lab/reports/final-desktop.png` | 交付截图 | 最终桌面端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/final-mobile.png` | 交付截图 | 最终移动端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase2-capsule-desktop.png` | 交付截图 | 阶段二胶囊衣橱桌面截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase2-nav-mobile.png` | 交付截图 | 阶段二导航移动端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase2-today-desktop.png` | 交付截图 | 阶段二今日穿搭桌面截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase2-today-mobile.png` | 交付截图 | 阶段二今日穿搭移动端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase3-collage-desktop.png` | 交付截图 | 阶段三拼贴桌面截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase3-collage-mobile.png` | 交付截图 | 阶段三拼贴移动端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase3-compare-desktop.png` | 交付截图 | 阶段三对比桌面截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase3-compare-desktop-light.png` | 交付截图 | 阶段三对比桌面浅色截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/phase3-compare-mobile.png` | 交付截图 | 阶段三对比移动端截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/reports/sample-outfit-card.png` | 交付截图 | 造型卡样例截图 | 浏览器截图 | 归档 | 交付证据 |
| `style-lab/research/bilibili.md` | 调研材料 | B 站男士穿搭调研：34 个高播放视频 + 18 位头部 UP 主（README 记载） | 手写 | 保留 | 数据来源原始材料，`src/data/sources.js` 的取材依据 |
| `style-lab/research/cn-platforms.md` | 调研材料 | 知乎/少数派/虎扑/豆瓣/抖音等中文图文平台调研 | 手写 | 保留 | 数据来源原始材料 |
| `style-lab/research/xhs-douyin.md` | 调研材料 | 小红书/抖音调研 | 手写 | 保留 | 数据来源原始材料 |
| `style-lab/research/youtube-reddit.md` | 调研材料 | YouTube 14 视频 + Reddit 7 帖子调研 | 手写 | 保留 | 数据来源原始材料 |
| `style-lab/research/SUMMARY.md` | 调研汇总 | 调研数据汇总（总量/平台分布/链接状态） | `npm run docs` 生成 | 保留 | 生成物但属项目文档，可由命令重建 |

### 2.4 style-lab/scripts（17 个脚本：16 个 Node 脚本 + 1 个 Python 构建辅助脚本）

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `style-lab/scripts/validate.mjs` | 验证脚本 | 全量数据校验：catalog/advice/sources/recommendations 的完整性、ID 唯一、引用有效 | 手写 | 保留 | `npm run validate`，npm test 第一道 |
| `style-lab/scripts/test-engine.mjs` | 测试脚本 | 建议引擎与推荐排序的单元测试 | 手写 | 保留 | `npm run test:engine` |
| `style-lab/scripts/test-wardrobe.mjs` | 测试脚本 | 个人衣橱 + 照片仓库 + sanitizePersonalItem 测试 | 手写 | 保留 | `npm run test:wardrobe` |
| `style-lab/scripts/test-preferences.mjs` | 测试脚本 | 偏好学习 + 个人推荐排序测试 | 手写 | 保留 | `npm run test:preferences` |
| `style-lab/scripts/test-backup.mjs` | 测试脚本 | 备份包 v1 测试（23609 字节） | 手写 | 保留 | `npm run test:backup`；与 test-backup-v2 关系见 §7 |
| `style-lab/scripts/test-backup-v2.mjs` | 测试脚本 | 备份包 v2 测试（12934 字节） | 手写 | 保留 | `npm run test:backup2`；两套并存，见 §7 建议 |
| `style-lab/scripts/test-daily.mjs` | 测试脚本 | 今日穿搭（daily.js）测试 | 手写 | 保留 | `npm run test:daily` |
| `style-lab/scripts/test-calendar.mjs` | 测试脚本 | 穿搭日历（calendar.js）测试 | 手写 | 保留 | `npm run test:calendar` |
| `style-lab/scripts/test-capsule.mjs` | 测试脚本 | 胶囊衣橱（capsule.js）测试 | 手写 | 保留 | `npm run test:capsule` |
| `style-lab/scripts/test-bodyprofile.mjs` | 测试脚本 | 3D 体型参数（bodyProfile.js）测试 | 手写 | 保留 | `npm run test:bodyprofile` |
| `style-lab/scripts/test-collage.mjs` | 测试脚本 | 对比与拼贴（collage.js）测试 | 手写 | 保留 | `npm run test:collage` |
| `style-lab/scripts/generate-docs.mjs` | 生成脚本 | 读取 PROJECT_STATS/SOURCES，重写 README 的 AUTO_STATS 段与 research/SUMMARY.md | 手写 | 保留 | `npm run docs`；prebuild 钩子依赖 |
| `style-lab/scripts/check-links.mjs` | 检查脚本 | 抓取 SOURCES 链接状态并写回 `src/data/link-status.generated.js` | 手写 | 保留 | `npm run check:links` |
| `style-lab/scripts/release.mjs` | 发布脚本 | 把 `dist-single/index.html` 复制到 `../型格穿搭实验室-双击打开.html` | 手写 | 保留 | `npm run build:release` 最后一环 |
| `style-lab/scripts/test-share.mjs` | 测试脚本 | 分享编解码往返（encodeOutfit/decodeOutfit）+ 非法输入零抛出 + SHARE_VERSION + outfitToText 降级；159 项断言（2026-10-17 实测） | 手写 | 保留 | `npm run test:share`，已插入 `npm test` 链；由 `_t3-verify.mjs` / `.t3-verify/` 升格（§9） |
| `style-lab/scripts/test-sources.mjs` | 测试脚本 | esbuild 打包 Sources.jsx 后断言检索/筛选/分页/排序/SSR 无障碍，并**同时承载「链接新鲜度」校验**；49 项断言（2026-10-17 实测） | 手写 | 保留 | `npm run test:sources`（普通模式：过期只 `WARN`）；`npm run test:freshness` 走本文件 `--freshness-only`（严格模式：过期 exit 1） |
| `style-lab/scripts/build-font-subset.py` | 构建辅助脚本 | 用 fontTools 从 `C:\Windows\Fonts\NotoSerifSC-VF.ttf` 生成 `src/assets/fonts/noto-serif-sc-subset.woff2`（617,248 B）：覆盖 `src/**`、`index.html`、`README.md`、`docs/**` 的全部字符 + ASCII，保留 `wght` 200–900 可变轴 | 手写（Python，非 npm 脚本） | 保留 | 手工运行 `python scripts/build-font-subset.py`；依赖 **fontTools + brotli**；**改动中文文案后必须重跑**（否则子集不再覆盖新字符）；`--check-only` 只校验覆盖不写文件 |

> **npm 脚本与文件不是一一对应**：`test:freshness` **没有独立脚本文件**，它是
> `node scripts/test-sources.mjs --freshness-only` 的别名（见 `package.json`）。普通 `npm test`
> 里链接数据过期只打印 `WARN`、不计入失败；`--freshness-only` 是同一份数据的严格模式，
> 过期即 exit 1，供发布前 / CI 卡点使用。`scripts/build-font-subset.py` 是目录内唯一的非 Node
> 脚本，不被 `package.json` 引用，必须手工运行。

### 2.5 style-lab 构建产物与临时目录（清理后 dist/、dist-single/、.t2-tmp/ 已删除；下表保留清理前原始行作对照）

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `style-lab/dist/index.html`（已删除） | 构建产物 | 常规多文件构建入口 | `npm run build`（vite build） | 已删除（可 `npm run build` 重建） | 可随时重建；dist/ 整体非交付入口 |
| `style-lab/dist/assets/cotton-B3LDI6ds.jpg`（已删除） | 构建产物 | 纹理资源打包副本 | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist/assets/denim-e4H2-f8P.webp`（已删除） | 构建产物 | 纹理资源打包副本 | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist/assets/index-BG3f7lbx.js`（已删除） | 构建产物 | 主包 JS | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist/assets/index-Cgr0X1NQ.css`（已删除） | 构建产物 | 主包 CSS | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist/assets/Mannequin-DRO9iuFO.js`（已删除） | 构建产物 | 3D 场景分包 JS | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist/assets/react-vendor-Xe-lIyC2.js`（已删除） | 构建产物 | React 依赖分包 | `npm run build` | 已删除（可 `npm run build` 重建） | 可重建 |
| `style-lab/dist-single/index.html`（已删除） | 构建产物/发布源 | 单文件版成品（1,596,967 字节），所有 JS/CSS 内联 | `npm run build:single`（vite build --mode single + viteSingleFile） | 已删除（与根 html 字节级重复） | 与根 html SHA256 相同，属双份同步；可由 `npm run build:single` 重建，根 html 由 `npm run build:release` 重建 |
| `style-lab/.t2-tmp/baseline-test.txt`（已删除） | 临时残留 | 基线测试输出快照 | 测试运行写入 | 已删除 | 临时目录，无引用 |
| `style-lab/.t2-tmp/build2.txt`（已删除） | 临时残留 | 构建输出快照 | 构建运行写入 | 已删除 | 临时目录，无引用 |
| `style-lab/.t2-tmp/build-final.txt`（已删除） | 临时残留 | 构建输出快照 | 构建运行写入 | 已删除 | 临时目录，无引用 |
| `style-lab/.t2-tmp/out/render.html`（已删除） | 临时残留 | Sources.jsx SSR 渲染结果（25928 字节） | `.t2-tmp/verify.mjs` 生成 | 已删除 | 临时产物 |
| `style-lab/.t2-tmp/out/sources.mjs`（已删除） | 临时残留 | Sources.jsx 的 esbuild 打包结果（106286 字节） | `.t2-tmp/verify.mjs` 生成 | 已删除 | 临时产物 |
| `style-lab/.t2-tmp/probe.mjs`（已删除） | 临时脚本 | 探针：统计 sources.js 的平台/状态/标签分布 | 手写 | 已删除 | 一次性探针 |
| `style-lab/.t2-tmp/probe2.mjs`（已删除） | 临时脚本 | 第二个探针脚本 | 手写 | 已删除 | 一次性探针 |
| `style-lab/.t2-tmp/test-final.txt`（已删除） | 临时残留 | 测试输出快照 | 测试运行写入 | 已删除 | 临时目录，无引用 |
| `style-lab/.t2-tmp/verify.mjs`（已删除） | 临时脚本 | T2 验证：esbuild 打包 Sources.jsx 后断言检索逻辑与 SSR | 手写 | 已删除（能力已升格为 style-lab/scripts/test-sources.mjs） | 验证已完成，未接入 npm scripts；删除前已升格为 test-sources.mjs（45 项断言） |
| `style-lab/node_modules/` | 依赖目录 | npm 依赖（9247 文件 / 约 261 MB）：react、react-dom、three、@react-three/fiber、@react-three/drei、vite 等 | `npm install`（依据 package-lock.json） | 保留 | 开发/构建/测试必需；可 `npm ci` 重建，本任务不遍历其内部 |

### 2.6 style-lab/src（64 个文件，逐文件列出；职责详见 §3）

| 路径 | 类别 | 是什么 | 生成方式 | 处置结果 | 理由 |
|---|---|---|---|---|---|
| `style-lab/src/App.jsx` | 项目源码 | 应用主组件（职责见 §3.6） | 手写 | 保留 | 集成面，被 `src/main.jsx` import |
| `style-lab/src/main.jsx` | 项目源码 | 应用入口（职责见 §3.6） | 手写 | 保留 | 集成面，被 `index.html` 引用 |
| `style-lab/src/styles.css` | 项目源码 | 全局样式与设计令牌（职责见 §3.6） | 手写 | 保留 | 被 `src/main.jsx` import |
| `style-lab/src/assets/textures/cotton.jpg` | 静态资源 | 棉布纹理源图 | 素材 | 保留 | 被 `src/three/textures.js` import |
| `style-lab/src/assets/textures/denim.webp` | 静态资源 | 牛仔纹理源图 | 素材 | 保留 | 被 `src/three/textures.js` import |
| `style-lab/src/components/AdvicePanel.jsx` | 项目源码 | 穿搭建议面板（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/CapsulePlanner.jsx` | 项目源码 | 胶囊衣橱规划 UI（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/ComparePanel.jsx` | 项目源码 | 多套造型对比面板（§3.1） | 手写 | 保留 | 被 `src/components/ShareBar.jsx` import |
| `style-lab/src/components/DataManager.jsx` | 项目源码 | 备份/恢复/重置 UI（§3.1） | 手写 | 保留 | 被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/components/ErrorBoundary.jsx` | 项目源码 | React 错误边界（§3.1） | 手写 | 保留 | 被 `src/main.jsx` import |
| `style-lab/src/components/ExportCard.jsx` | 项目源码 | Canvas 造型卡绘制导出（§3.1） | 手写 | 保留 | 被 `src/components/ShareBar.jsx`、`.t3-verify` 使用 |
| `style-lab/src/components/Laws.jsx` | 项目源码 | 穿搭法则列表（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/LazyStudio.jsx` | 项目源码 | 3D 试衣间懒加载壳（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/OutfitCalendar.jsx` | 项目源码 | 穿搭日历 UI（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/OutfitCollage.jsx` | 项目源码 | 造型拼贴画布（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/Panel.jsx` | 项目源码 | 3D 衣柜换装面板（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/PhaseOneWorkspace.jsx` | 项目源码 | 阶段一装配层（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/PreferencePanel.jsx` | 项目源码 | 偏好反馈面板（§3.1） | 手写 | 保留 | 被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/components/ProfileRecommender.jsx` | 项目源码 | 个人造型方案（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/ScoreCard.jsx` | 项目源码 | 四维评分卡（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/ShareBar.jsx` | 项目源码 | 分享/收藏/导出栏（§3.1） | 手写 | 保留 | 被 `src/App.jsx`、`.t3-verify` 使用 |
| `style-lab/src/components/SmartReplace.jsx` | 项目源码 | 智能替换 UI（§3.1） | 手写 | 保留 | 被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/components/Sources.jsx` | 项目源码 | 博主资源库（§3.1） | 手写 | 保留 | 被 `src/App.jsx`、`style-lab/.t2-tmp/verify.mjs` 使用 |
| `style-lab/src/components/ThemeToggle.jsx` | 项目源码 | 主题切换与防 FOUC（§3.1） | 手写 | 保留 | 被 `src/App.jsx`、`src/main.jsx` import |
| `style-lab/src/components/TodayPlanner.jsx` | 项目源码 | 今日穿搭（§3.1） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/components/WardrobeManager.jsx` | 项目源码 | 我的衣橱管理 UI（§3.1） | 手写 | 保留 | 被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/data/advice.js` | 项目源码 | 建议引擎 + LAWS（§3.2） | 手写 | 保留 | 被 AdvicePanel/Laws/collage/stats/validate/test-engine 使用 |
| `style-lab/src/data/backup.js` | 项目源码 | 备份包 v2（§3.2） | 手写 | 保留 | 被 App/DataManager/test-backup/test-backup-v2/test-wardrobe 使用 |
| `style-lab/src/data/calendar.js` | 项目源码 | 穿搭日历 v1 纯逻辑（§3.2） | 手写 | 保留 | 被 useCalendar/OutfitCalendar/test-calendar 使用 |
| `style-lab/src/data/capsule.js` | 项目源码 | 胶囊衣橱算法（§3.2） | 手写 | 保留 | 被 CapsulePlanner/test-capsule 使用 |
| `style-lab/src/data/catalog.js` | 项目源码 | 服装目录 + PRESETS（§3.2） | 手写 | 保留 | 全站数据基座，被 15+ 处 import |
| `style-lab/src/data/collage.js` | 项目源码 | 对比与拼贴布局（§3.2） | 手写 | 保留 | 被 ComparePanel/OutfitCollage/test-collage 使用 |
| `style-lab/src/data/daily.js` | 项目源码 | 今日穿搭 + Open-Meteo（§3.2） | 手写 | 保留 | 被 useDaily/TodayPlanner/test-daily 使用 |
| `style-lab/src/data/imageStore.js` | 项目源码 | 照片仓库（IndexedDB）（§3.2） | 手写 | 保留 | 被 useWardrobe/PhaseOneWorkspace/test-wardrobe 使用 |
| `style-lab/src/data/link-status.generated.js` | 项目源码 | 链接检测结果（§3.2） | `npm run check:links` 生成 | 保留 | 被 `src/data/sources.js` import；生成命令在文件头注明 |
| `style-lab/src/data/personalRecommendations.js` | 项目源码 | 个人衣橱排序与智能替换（§3.2） | 手写 | 保留 | 被 daily/ProfileRecommender/SmartReplace/test-preferences 使用 |
| `style-lab/src/data/preferences.js` | 项目源码 | 偏好学习 v1（§3.2） | 手写 | 保留 | 被 usePreferences/PreferencePanel/test-preferences 使用 |
| `style-lab/src/data/recommendations.js` | 项目源码 | 个人方案推荐（§3.2） | 手写 | 保留 | 被 daily/ProfileRecommender/test-engine/validate 使用 |
| `style-lab/src/data/share.js` | 项目源码 | 分享编解码（§3.2） | 手写 | 保留 | 被 App/ShareBar/_t3-verify.mjs/.t3-verify 使用 |
| `style-lab/src/data/sources.js` | 项目源码 | 博主资源库数据（§3.2） | 手写 | 保留 | 被 Sources/AdvicePanel/Laws/ProfileRecommender/stats/check-links/generate-docs/validate 使用 |
| `style-lab/src/data/stats.js` | 项目源码 | 项目统计聚合（§3.2） | 手写 | 保留 | 被 App/generate-docs 使用 |
| `style-lab/src/data/wardrobe.js` | 项目源码 | 个人衣橱 v1 纯逻辑（§3.2） | 手写 | 保留 | 被 useWardrobe/useDaily/useCalendar/CapsulePlanner/test-wardrobe 使用 |
| `style-lab/src/hooks/useCalendar.js` | 项目源码 | 日历 React hook（§3.3） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/hooks/useDaily.js` | 项目源码 | 今日穿搭 React hook（§3.3） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/hooks/usePersistentState.js` | 项目源码 | 通用持久化 state（§3.3） | 手写 | 保留 | 被 usePreferences/ShareBar/.t3-verify 使用 |
| `style-lab/src/hooks/usePreferences.js` | 项目源码 | 偏好 React hook（§3.3） | 手写 | 保留 | 被 `src/App.jsx`、PreferencePanel import |
| `style-lab/src/hooks/useWardrobe.js` | 项目源码 | 衣橱 React hook（§3.3） | 手写 | 保留 | 被 `src/App.jsx`、WardrobeManager import |
| `style-lab/src/styles/calendar.css` | 项目源码 | 日历样式（§3.4） | 手写 | 保留 | 被 `src/components/OutfitCalendar.jsx` import |
| `style-lab/src/styles/capsule.css` | 项目源码 | 胶囊衣橱样式（§3.4） | 手写 | 保留 | 被 `src/components/CapsulePlanner.jsx` import |
| `style-lab/src/styles/collage.css` | 项目源码 | 对比/拼贴样式（§3.4） | 手写 | 保留 | 被 `src/components/ComparePanel.jsx`、`OutfitCollage.jsx` import |
| `style-lab/src/styles/data-manager.css` | 项目源码 | 数据管理样式（§3.4） | 手写 | 保留 | 被 `src/components/DataManager.jsx` import |
| `style-lab/src/styles/phase-one.css` | 项目源码 | 阶段一装配区样式（§3.4） | 手写 | 保留 | 被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/styles/preferences.css` | 项目源码 | 偏好/替换样式（§3.4） | 手写 | 保留 | 被 `src/components/PreferencePanel.jsx`、`SmartReplace.jsx` import |
| `style-lab/src/styles/score.css` | 项目源码 | 评分卡样式（§3.4） | 手写 | 保留 | 被 `src/components/ScoreCard.jsx` import |
| `style-lab/src/styles/share.css` | 项目源码 | 分享/导出卡样式（§3.4） | 手写 | 保留 | 被 `src/components/ShareBar.jsx`、`ExportCard.jsx` import |
| `style-lab/src/styles/sources.css` | 项目源码 | 资源库样式（§3.4） | 手写 | 保留 | 被 `src/components/Sources.jsx` import |
| `style-lab/src/styles/stage.css` | 项目源码 | 3D 舞台布局样式（§3.4） | 手写 | 保留 | 被 `src/App.jsx` import |
| `style-lab/src/styles/theme.css` | 项目源码 | 主题切换样式（§3.4） | 手写 | 保留 | 被 `src/components/ThemeToggle.jsx` import |
| `style-lab/src/styles/today.css` | 项目源码 | 今日穿搭样式（§3.4） | 手写 | 保留 | 被 `src/components/TodayPlanner.jsx` import |
| `style-lab/src/styles/wardrobe.css` | 项目源码 | 衣橱样式（§3.4） | 手写 | 保留 | 被 `src/components/WardrobeManager.jsx` import |
| `style-lab/src/three/bodyProfile.js` | 项目源码 | 体型参数纯逻辑（§3.5） | 手写 | 保留 | 被 Mannequin/App/test-bodyprofile 使用 |
| `style-lab/src/three/garments.jsx` | 项目源码 | 程序化 3D 网格（§3.5） | 手写 | 保留 | 被 `src/three/Mannequin.jsx` import |
| `style-lab/src/three/Mannequin.jsx` | 项目源码 | 3D 场景组件（§3.5） | 手写 | 保留 | 被 `src/components/LazyStudio.jsx` 动态 import |
| `style-lab/src/three/textures.js` | 项目源码 | 程序化纹理（§3.5） | 手写 | 保留 | 被 `src/three/garments.jsx` import |

> 处置统计：清理前建议（本分类总表共 140 行）——保留 95、删除 16、归档 26、待定 3；清理后实际——保留 97、已删除 27、归档 16、待定 0。

---

## 3. src 64 个源文件逐文件职责

> 职责依据：每个文件的 export 函数名/常量、顶部注释、import 关系（实际读过文件头部与 export 行）。任务书写 `data/(15)`，实际为 16 个文件，此处按实际列出。

### 3.1 components/（21）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/components/AdvicePanel.jsx` | 穿搭建议面板：调用 `getAdvice(outfit)` 渲染实时建议与冲突，每条带「试试这件」一键上身与出处；导出 `AdvicePanel({ outfit, setOutfit })` |
| `style-lab/src/components/CapsulePlanner.jsx` | 胶囊衣橱规划 UI：调用 `planCapsule` 按季节/场合挑选 12–20 件并展示覆盖度；导出 `CapsulePlanner({ wardrobe, onTry, onAddWishlist })` |
| `style-lab/src/components/ComparePanel.jsx` | 多套造型并排对比面板：调用 `compareOutfits` 展示两套对比结果；导出 `ComparePanel({ looks, wardrobe, activeIndex = -1, onPick, onRemove, onTry })` + default |
| `style-lab/src/components/DataManager.jsx` | 数据管理 UI：备份导出/导入/重置，调用 backup.js；导出 `DataManager({ imageStore = null, appVersion = '', onAfterImport = null })` + default |
| `style-lab/src/components/ErrorBoundary.jsx` | React 错误边界：捕获子树渲染异常并降级提示；导出 `class ErrorBoundary`；被 `src/main.jsx` 包裹 App |
| `style-lab/src/components/ExportCard.jsx` | Canvas 2D 造型卡绘制与 PNG 导出：导出 `drawCard(ctx, outfit, ts)`、`ExportCard({ outfit, filename = 'style-lab-造型.png' })`、`CARD_SIZE`；被 ShareBar 与 .t3-verify 复用 |
| `style-lab/src/components/Laws.jsx` | 穿搭法则列表：渲染 `LAWS`（16 条）并关联 `SOURCES` 出处；导出 `Laws()` |
| `style-lab/src/components/LazyStudio.jsx` | 3D 试衣间懒加载壳：WebGL 探测 + IntersectionObserver 进入视野才动态 import `three/Mannequin.jsx` 的 `Studio`，提供无 WebGL/加载中/出错三种降级占位；导出 `LazyStudio({ outfit, autoRotate, profile })` |
| `style-lab/src/components/OutfitCalendar.jsx` | 穿搭日历 UI：月视图、记录/删除、统计摘要；导出 `OutfitCalendar({ calendar, wardrobe, outfit, onTry, onRecord })`、`personalItemsOf(outfit)`、`localDateKey` |
| `style-lab/src/components/OutfitCollage.jsx` | 造型二维拼贴画布与 PNG 导出：调用 `collageLayout`；导出 `OutfitCollage({ outfits, preset = 'auto', onExport, fileName = 'style-lab-collage.png' })` + default |
| `style-lab/src/components/Panel.jsx` | 3D 试衣间右侧衣柜面板：5 个分类页签换装、一键造型；导出 `Panel({ outfit, setOutfit })` |
| `style-lab/src/components/PhaseOneWorkspace.jsx` | 阶段一装配层（无状态）：把 WardrobeManager/PreferencePanel/SmartReplace/DataManager 接到 App 提升的同一份 store，封装照片仓库契约对象；导出 `APP_VERSION='0.1.0'`、`createImageStore`、`WardrobeSection`、`SmartReplaceBlock`、`DataSection` |
| `style-lab/src/components/PreferencePanel.jsx` | 偏好反馈面板：喜欢/不喜欢/穿过 + 理由 + 权重总结；导出 `PreferencePanel`、`PreferencePanelStandalone` + default |
| `style-lab/src/components/ProfileRecommender.jsx` | 个人造型方案：身高/体型/季节/场景表单 + 三套推荐（`recommendOutfits` + `rankWithPersonalWardrobe`）+ 评分与理由；导出 `DEFAULT_PROFILE`、`ProfileRecommender` + default |
| `style-lab/src/components/ScoreCard.jsx` | 全身四维评分卡（配色/正式度/轮廓/完成度）；导出 `ScoreCard({ score })` default |
| `style-lab/src/components/ShareBar.jsx` | 分享栏：URL hash 编解码、中文文案复制、收藏造型（`LOOKS_KEY='stylelab:looks'`）、导出卡与对比入口；导出 `LOOKS_KEY`、`ShareBar({ outfit, onApply, wardrobe })` |
| `style-lab/src/components/SmartReplace.jsx` | 智能替换 UI：意图选择（更正式/更休闲/更暖等）+ 逐槽替换；导出 `SmartReplace` + default |
| `style-lab/src/components/Sources.jsx` | 博主资源库：搜索/过滤/排序/分页（187 条来源卡片）；导出 `PAGE_SIZE=24`、`filterSources`、`sortSources`、`paginate`、`searchSources`、`buildFacets`、`Sources({ sources = SOURCES } = {})` + default |
| `style-lab/src/components/ThemeToggle.jsx` | 主题切换（auto/light/dark）+ `initTheme()` 首帧防 FOUC；导出 `THEME_STORAGE_KEY='stylelab:theme'`、`THEME_MODES`、`initTheme`、`ThemeToggle` + default；被 `src/main.jsx` 与 `src/App.jsx` 使用 |
| `style-lab/src/components/TodayPlanner.jsx` | 今日穿搭：天气/场合手动输入 + 联网天气按钮 + 推荐结果（`planToday`）；导出 `TodayPlanner({ daily, wardrobe, preferences, outfit, onTry, onRecord })` |
| `style-lab/src/components/WardrobeManager.jsx` | 我的衣橱管理 UI：单品增删改查、状态（已有/想买/不要）、照片、试穿；导出 `WardrobeManager({ wardrobe, onTry } = {})` + default |

### 3.2 data/（16）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/data/advice.js` | 建议引擎：按当前上装给下装/鞋/配饰建议 + 冲突检测 + 16 条穿搭法则 `LAWS`；导出 `LAWS`、`getAdvice(state)` |
| `style-lab/src/data/backup.js` | 备份包 v2：`BACKUP_SCHEMA='style-lab-backup'`、`BACKUP_VERSION=2`、`STORAGE_KEYS`、各域 sanitize/merge/validate、`planImport`/`applyPlan`、`collectBackup`/`exportBackup`/`importBackup` |
| `style-lab/src/data/calendar.js` | 穿搭日历 v1 纯逻辑：`localDateKey`/`normalizeOutfit`/`createCalendar`/encode-decode/read-write/`addEntry`/`monthStats`/`itemFrequency`/`idleItems`/`repeatStreak`/`listReminders`；存储键 `stylelab:calendar:v1` |
| `style-lab/src/data/capsule.js` | 胶囊衣橱算法：`normalizeCandidates`/`hardConflict`/`pairScore`/`quotaFor`/`countCombinations`/`computeCoverage`/`planCapsule`；常量 `CAPSULE_MIN=12`、`CAPSULE_MAX=20` |
| `style-lab/src/data/catalog.js` | 服装目录：`TOPS`/`OUTERS`/`BOTTOMS`/`SHOES`/`ACCS` 单品数据（59 件）、`ITEMS`/`CATEGORIES`/`findItem`/`byId`、`PRESETS` 一键造型（19 套）、`setWardrobeItems` 登记个人单品 |
| `style-lab/src/data/collage.js` | 多套对比与拼贴布局：`compareOutfits`/`flatLay`/`collageLayout`；常量 `MAX_COMPARE=4`、`MIN_COMPARE=2`、`COLLAGE_PRESETS`、`SLOT_ORDER` |
| `style-lab/src/data/daily.js` | 今日穿搭 v1：天气适配打分 `weatherFit`、`planToday`，Open-Meteo 地理编码与预报 URL/解析（`buildGeocodingUrl`/`buildForecastUrl`/`parseForecastResponse`），存储键 `stylelab:daily:v1` |
| `style-lab/src/data/imageStore.js` | 照片仓库：IndexedDB `stylelab-media` v1，压缩管线（`compressBlob`/`saveCompressedImage`，最长边 1200/质量 0.82/目标 ≤900KB），内存/null 后端可测，`getImageBlob`/`importImages`/`exportImages` |
| `style-lab/src/data/link-status.generated.js` | 链接检测结果：`LINK_STATUS`（当前 2 条小红书 restricted 记录）；由 `scripts/check-links.mjs` 自动生成，头部注释声明「不要手工维护」 |
| `style-lab/src/data/personalRecommendations.js` | 个人衣橱排序与智能替换：`rankWithPersonalWardrobe`/`detectHardConflicts`/`findSmartReplacements`/`applyReplacement`/`INTENTS`（7 种替换意图） |
| `style-lab/src/data/preferences.js` | 偏好学习 v1：`FEEDBACK_KINDS`（like/dislike/worn）、`applyFeedback`/`preferenceDeltaOf`/`itemWeight`/`summarizePreferences`；存储键 `stylelab:preferences:v1` |
| `style-lab/src/data/recommendations.js` | 个人方案推荐：`PROFILE_OPTIONS`（体型/季节/场合选项）、`RECOMMENDATION_LOOKS`（19 条造型适用条件，引用 catalog 的 PRESETS）、`recommendOutfits(rawProfile)` |
| `style-lab/src/data/share.js` | 分享编解码：`SHARE_VERSION=1`、`encodeOutfit`/`canEncodeOutfit`/`decodeOutfit`（base64url 短码、URL-safe、无 #&=）、`outfitToText` 中文文案 |
| `style-lab/src/data/sources.js` | 博主资源库数据：`PLATFORMS`（10 平台）、`RAW_SOURCES`→`SOURCES`（187 条）、`SOURCE_STATUS`、`PERSPECTIVE_TYPES`；import `link-status.generated.js` |
| `style-lab/src/data/stats.js` | 项目统计聚合：`PROJECT_STATS`（来源 187/法则 16/单品 59/预设 19 + 平台/状态分布），供 App hero 区与 generate-docs 使用 |
| `style-lab/src/data/wardrobe.js` | 个人衣橱 v1 纯逻辑：`PersonalItem` 校验/增删改查/穿着记录/照片关联/统计/存储读写，`SLOT_TO_CATEGORY`/`CATEGORY_TO_SLOT`/`defaultStorage`/`isStorageAvailable`；存储键 `stylelab:wardrobe:v1` |

### 3.3 hooks/（5）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/hooks/useCalendar.js` | 把 calendar.js 接成 React hook：state + localStorage 读写 + add/update/remove 操作集；导出 `useCalendar(options = {})` |
| `style-lab/src/hooks/useDaily.js` | 把 daily.js 接成 React hook：daily state、localStorage 持久化、天气抓取与合并；导出 `useDaily(options = {})` |
| `style-lab/src/hooks/usePersistentState.js` | 通用 localStorage 持久化 useState（版本迁移、写失败降级）；导出 `usePersistentState(key, initialValue, options)`；被 usePreferences 与 ShareBar 使用 |
| `style-lab/src/hooks/usePreferences.js` | 把 preferences.js 接成 React hook：recordFeedback/reset/summary/deltaOf 操作集；导出 `usePreferences(personalItems)` |
| `style-lab/src/hooks/useWardrobe.js` | 把 wardrobe.js + imageStore.js 接成 React hook：衣橱 CRUD、照片压缩存储、穿着次数；导出 `useWardrobe(options = {})` |

### 3.4 styles/（13，均为组件级样式，由对应组件 import）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/styles/calendar.css` | 穿搭日历样式；被 `src/components/OutfitCalendar.jsx` import |
| `style-lab/src/styles/capsule.css` | 胶囊衣橱样式；被 `src/components/CapsulePlanner.jsx` import |
| `style-lab/src/styles/collage.css` | 对比面板与拼贴样式；被 `src/components/ComparePanel.jsx` 与 `src/components/OutfitCollage.jsx` import |
| `style-lab/src/styles/data-manager.css` | 数据管理样式；被 `src/components/DataManager.jsx` import |
| `style-lab/src/styles/phase-one.css` | 阶段一装配区样式；被 `src/components/PhaseOneWorkspace.jsx` import |
| `style-lab/src/styles/preferences.css` | 偏好面板与智能替换样式；被 `src/components/PreferencePanel.jsx` 与 `src/components/SmartReplace.jsx` import |
| `style-lab/src/styles/score.css` | 评分卡样式；被 `src/components/ScoreCard.jsx` import |
| `style-lab/src/styles/share.css` | 分享栏与导出卡样式；被 `src/components/ShareBar.jsx` 与 `src/components/ExportCard.jsx` import |
| `style-lab/src/styles/sources.css` | 博主资源库样式；被 `src/components/Sources.jsx` import |
| `style-lab/src/styles/stage.css` | 3D 试衣间舞台布局样式；被 `src/App.jsx` import |
| `style-lab/src/styles/theme.css` | 主题切换样式；被 `src/components/ThemeToggle.jsx` import |
| `style-lab/src/styles/today.css` | 今日穿搭样式；被 `src/components/TodayPlanner.jsx` import |
| `style-lab/src/styles/wardrobe.css` | 衣橱管理样式；被 `src/components/WardrobeManager.jsx` import |

### 3.5 three/（4）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/three/bodyProfile.js` | 体型参数纯逻辑：`BODY_SHAPES`/`BODY_KEYS`/`normalizeProfile`/`bodyTransform`/`cameraTargetFor`/`describeBodyProfile`；被 Mannequin.jsx、App.jsx、test-bodyprofile.mjs 使用 |
| `style-lab/src/three/garments.jsx` | 程序化 3D 网格：人模部件 `Skin`/`HairM`/`ARM`/`LEG`/`BODY_TORSO`/`ArmGroup`/`LegGroup`，服装网格 `MESH_KEYS`/`GarmentMesh`；被 Mannequin.jsx import |
| `style-lab/src/three/Mannequin.jsx` | 3D 场景组件：`Canvas`+`OrbitControls`+`ContactShadows`，`Mannequin({ outfit, transform })` 与 `Studio({ outfit, autoRotate, profile })`；被 LazyStudio.jsx 动态 import |
| `style-lab/src/three/textures.js` | 程序化纹理：`getTexture(name, repeatX = 4, repeatY = 4)` 生成牛仔/棉布 canvas 纹理；import `src/assets/textures/cotton.jpg` 与 `denim.webp` |

### 3.6 根级（3）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/App.jsx` | 应用主组件：装配 9 大区块（个人方案/衣橱/今日/日历/胶囊/3D 试衣间/建议/法则/资源库/数据管理），持有 outfit/profile/wardrobe/preferences/daily/calendar 状态，分享 hash 解析，`recordLook` 保证「日历落盘 + 穿着次数」一致性；导出 `default function App()` |
| `style-lab/src/main.jsx` | 应用入口：`initTheme()` 防 FOUC，`createRoot` 渲染 `<ErrorBoundary><App /></ErrorBoundary>`，导入全局 `./styles.css` |
| `style-lab/src/styles.css` | 全局样式与设计令牌：`:root`/`[data-theme='dark']` 令牌块、`--bg/--ink/--accent/--th-*` 等、WCAG 对比度注释；被 `src/main.jsx` import |

### 3.7 静态纹理（2）

| 文件 | 一句话职责 |
|---|---|
| `style-lab/src/assets/textures/cotton.jpg` | 棉布纹理源图（119092 字节）；被 `src/three/textures.js` import |
| `style-lab/src/assets/textures/denim.webp` | 牛仔纹理源图（10132 字节）；被 `src/three/textures.js` import |

---

## 4. 依赖与数据流关系

> 以下依赖链为清理前快照；其中 `_t3-verify.mjs`、`.t3-verify/*`、`.t2-tmp/*` 已在清理中删除（见 §9），其测试能力已升格到 `style-lab/scripts/test-share.mjs` 与 `style-lab/scripts/test-sources.mjs`。

### 4.1 核心联动链

1. **博主资源链（生成-展示-回写闭环）**
   `style-lab/scripts/check-links.mjs` → 写 `style-lab/src/data/link-status.generated.js` → 被 `style-lab/src/data/sources.js` import（`SOURCES` 合并链接状态）→ 被 `style-lab/src/components/Sources.jsx`（资源库 UI）、`style-lab/src/components/AdvicePanel.jsx`、`style-lab/src/components/Laws.jsx`、`style-lab/src/components/ProfileRecommender.jsx`、`style-lab/src/data/stats.js` 消费 → `style-lab/scripts/generate-docs.mjs` 读 `sources.js`+`stats.js` 写 `style-lab/README.md`（AUTO_STATS 段）与 `style-lab/research/SUMMARY.md`。
   命令：`npm run check:links` 回写链接状态；`npm run docs` 刷新统计文档。

2. **服装目录链（catalog 是全站数据基座）**
   `style-lab/src/data/catalog.js` 被 15 处消费：`App.jsx`、`components/Panel.jsx`、`components/LazyStudio.jsx`、`components/AdvicePanel.jsx`、`components/ExportCard.jsx`、`components/ShareBar.jsx`、`components/SmartReplace.jsx`、`components/ProfileRecommender.jsx`、`three/Mannequin.jsx`、`data/advice.js`、`data/capsule.js`、`data/collage.js`、`data/daily.js`、`data/calendar.js`、`data/preferences.js`、`data/personalRecommendations.js`、`data/recommendations.js`、`data/share.js`、`data/stats.js`，以及 `scripts/validate.mjs` 与 `.t3-verify/roundtrip.mjs`、`_t3-verify.mjs`。
   - `catalog.js` 的 `PRESETS` 消费方：`App.jsx`（默认造型 `PRESETS[0].outfit`）、`components/Panel.jsx`（一键造型按钮）、`components/ShareBar.jsx`（收藏/分享）、`data/recommendations.js`（`RECOMMENDATION_LOOKS` 按 `presetId` 引用）、`data/stats.js`（presets 计数）、`scripts/validate.mjs`、`_t3-verify.mjs`、`.t3-verify/roundtrip.mjs`。
   - `catalog.js` 的 `setWardrobeItems(items)`：在 `App.jsx` 用 `useMemo` 把个人单品登记进全局目录查找层（`byId`/`findItem` 才能按 id 取到个人单品）。

3. **3D 试衣间链（懒加载）**
   `style-lab/src/App.jsx` → `style-lab/src/components/LazyStudio.jsx`（动态 `import('../three/Mannequin.jsx')`）→ `style-lab/src/three/Mannequin.jsx` → `style-lab/src/three/garments.jsx` → `style-lab/src/three/textures.js` → `style-lab/src/assets/textures/cotton.jpg`+`denim.webp`。
   旁路：`style-lab/src/three/bodyProfile.js` 被 `Mannequin.jsx`（体型缩放）与 `App.jsx`（舞台描述文案）与 `scripts/test-bodyprofile.mjs` 使用。

4. **分享编解码链**
   `style-lab/src/data/share.js` ← `style-lab/src/App.jsx`（解析 `#o=` hash）、`style-lab/src/components/ShareBar.jsx`（生成分享码）、`_t3-verify.mjs`、`.t3-verify/roundtrip.mjs`、`.t3-verify/entry.jsx`、`.t3-verify/harness.html`（浏览器端往返验证）。

5. **备份链**
   `style-lab/src/data/backup.js` ← `style-lab/src/App.jsx`（`syncFromStorage` 导入后重读各 store）、`style-lab/src/components/DataManager.jsx`（导出/导入/重置 UI）、`style-lab/scripts/test-backup.mjs`、`style-lab/scripts/test-backup-v2.mjs`、`style-lab/scripts/test-wardrobe.mjs`（`sanitizePersonalItem`）。
   `backup.js` 的 `STORAGE_KEYS` 写死六个键（wardrobe/preferences/looks/theme/daily/calendar），与各 data 模块与 ShareBar/ThemeToggle 的键一致。

6. **阶段一装配链**
   `style-lab/src/App.jsx` → `style-lab/src/components/PhaseOneWorkspace.jsx` → `WardrobeManager.jsx`（+`useWardrobe.js`→`wardrobe.js`+`imageStore.js`）、`PreferencePanel.jsx`（+`usePreferences.js`→`preferences.js`）、`SmartReplace.jsx`（→`personalRecommendations.js`）、`DataManager.jsx`（→`backup.js`）；`PhaseOneWorkspace.jsx` 的 `createImageStore()` 把 `imageStore.js` 函数绑定到同一个后端实例，供 `useWardrobe` 与 `DataManager` 共享（避免备份导出孤儿照片）。

### 4.2 hooks 与 data 的对应关系

| Hook | 底层 data 模块 | 补充依赖 |
|---|---|---|
| `style-lab/src/hooks/useWardrobe.js` | `style-lab/src/data/wardrobe.js` | `style-lab/src/data/imageStore.js`（照片压缩/读写） |
| `style-lab/src/hooks/usePreferences.js` | `style-lab/src/data/preferences.js` | `style-lab/src/hooks/usePersistentState.js` |
| `style-lab/src/hooks/useDaily.js` | `style-lab/src/data/daily.js` | `style-lab/src/data/wardrobe.js`（`isStorageAvailable`） |
| `style-lab/src/hooks/useCalendar.js` | `style-lab/src/data/calendar.js` | `style-lab/src/data/wardrobe.js`（`isStorageAvailable`） |
| `style-lab/src/hooks/usePersistentState.js` | 无（通用基础 hook） | — |

### 4.3 组件与 data 的对应关系（摘要）

- `AdvicePanel.jsx`/`Laws.jsx` → `advice.js`（+`sources.js`）
- `ProfileRecommender.jsx` → `recommendations.js` + `personalRecommendations.js` + `sources.js` + `catalog.js`
- `TodayPlanner.jsx` → `daily.js`；`OutfitCalendar.jsx` → `calendar.js`（+`daily.js` 的常量）；`CapsulePlanner.jsx` → `capsule.js` + `wardrobe.js`
- `ComparePanel.jsx`/`OutfitCollage.jsx` → `collage.js`；`SmartReplace.jsx` → `personalRecommendations.js`
- `ShareBar.jsx` → `share.js` + `catalog.js` + `usePersistentState.js` + `ExportCard.jsx` + `ComparePanel.jsx`
- `DataManager.jsx` → `backup.js`；`WardrobeManager.jsx` → `wardrobe.js`（经 `useWardrobe`）；`PreferencePanel.jsx` → `preferences.js`（经 `usePreferences`）

---

## 5. 生成物与源的对应关系

> 清理后 `style-lab/dist/`、`style-lab/dist-single/`、`style-lab/.t2-tmp/`、`.t3-verify/` 已删除，本表保留清理前的生成物对应关系作对照。

| 生成物 | 生成脚本/命令 | 源数据 |
|---|---|---|
| `style-lab/src/data/link-status.generated.js` | `style-lab/scripts/check-links.mjs`（`npm run check:links`） | `style-lab/src/data/sources.js` 的 `SOURCES` + 既有 `LINK_STATUS` |
| `style-lab/README.md` 中 `<!-- AUTO_STATS_START -->`…`<!-- AUTO_STATS_END -->` 段 | `style-lab/scripts/generate-docs.mjs`（`npm run docs`） | `style-lab/src/data/stats.js`（`PROJECT_STATS`）、`style-lab/src/data/sources.js` |
| `style-lab/research/SUMMARY.md` | 同上（`npm run docs`） | 同上 |
| `style-lab/dist/`（index.html + 6 个 assets） | `vite build`（`npm run build`，Vite 常规多文件构建） | `style-lab/src/**`、`style-lab/index.html`、`style-lab/vite.config.js` |
| `style-lab/dist-single/index.html` | `vite build --mode single`（`npm run build:single`，viteSingleFile 插件内联） | 同上 |
| `型格穿搭实验室-双击打开.html`（工作区根） | `style-lab/scripts/release.mjs`（`npm run build:release` 的最后一步，`copyFileSync` 自 `style-lab/dist-single/index.html`） | `style-lab/dist-single/index.html`（SHA256 相同：03FFE6850B061DE8C73612742EEDE008F49F4628AA4BFD79062286FC13BDE36B） |
| `style-lab/.t2-tmp/out/sources.mjs`、`style-lab/.t2-tmp/out/render.html` | `style-lab/.t2-tmp/verify.mjs`（esbuild 打包 Sources.jsx + SSR 渲染） | `style-lab/src/components/Sources.jsx` |
| `.t3-verify/dist-t3/assets/*` | `.t3-verify/vite.config.mjs`（验证工程内 `vite build`） | `.t3-verify/entry.jsx`、`style-lab/src/components/ShareBar.jsx`、`ExportCard.jsx`、`share.js` |
| `.t3-verify/exported-card.png` | `.t3-verify` 验证流程导出 | `style-lab/src/components/ExportCard.jsx` 的 `drawCard` |
| `style-lab/.t2-tmp/baseline-test.txt`、`build2.txt`、`build-final.txt`、`test-final.txt` | 历史构建/测试运行的输出快照 | 构建与测试命令（具体命令已不可考，属残留） |
| `style-lab/docs/INVENTORY-BEFORE-CLEANUP.csv` | 上游生成（本任务输入底稿） | 工作区文件系统快照 |
| `style-lab/package-lock.json` | `npm install` | `style-lab/package.json` 依赖解析 |

重新生成命令汇总：`npm run check:links`（链接状态）、`npm run docs`（README 统计段 + research/SUMMARY.md）、`npm run build`（dist/）、`npm run build:single`（dist-single/）、`npm run build:release`（单文件 + 根目录成品）。注意 prebuild 钩子：`npm run build` 与 `npm run build:single` 之前都会先跑 `npm test && npm run docs`。

---

## 6. 孤岛文件（清理前判定；以下孤岛均已删除，保留判定记录）

判定标准：全工作区（排除 `node_modules`）没有任何文件 import 或引用它，也不在任何 npm script / 文档指令中作为输入出现。以下文件是「没有任何入边引用」的孤岛：

### 6.1 根级验证脚本

- `D:\穿搭\_t3-verify.mjs`（只被人工手动运行，无任何脚本/文档引用）

### 6.2 .t3-verify 独立验证工程（9 个文件，整体自成闭环，style-lab 不引用它）

- `D:\穿搭\.t3-verify\build-check.mjs`
- `D:\穿搭\.t3-verify\entry.jsx`
- `D:\穿搭\.t3-verify\harness.html`
- `D:\穿搭\.t3-verify\recheck.mjs`
- `D:\穿搭\.t3-verify\roundtrip.mjs`
- `D:\穿搭\.t3-verify\vite.config.mjs`
- `D:\穿搭\.t3-verify\exported-card.png`
- `D:\穿搭\.t3-verify\dist-t3\assets\entry-CKPlsAEl.css`
- `D:\穿搭\.t3-verify\dist-t3\assets\entry-Dro5HFl9.js`

### 6.3 style-lab/.t2-tmp 临时验证残留（9 个文件，均无入边引用）

- `D:\穿搭\style-lab\.t2-tmp\baseline-test.txt`
- `D:\穿搭\style-lab\.t2-tmp\build2.txt`
- `D:\穿搭\style-lab\.t2-tmp\build-final.txt`
- `D:\穿搭\style-lab\.t2-tmp\out\render.html`
- `D:\穿搭\style-lab\.t2-tmp\out\sources.mjs`
- `D:\穿搭\style-lab\.t2-tmp\probe.mjs`
- `D:\穿搭\style-lab\.t2-tmp\probe2.mjs`
- `D:\穿搭\style-lab\.t2-tmp\test-final.txt`
- `D:\穿搭\style-lab\.t2-tmp\verify.mjs`

### 6.4 工具状态与指针（非项目内容，按目录列出）

- `D:\穿搭\.mimosa\`（hook-state 3 个 JSON + baseline 下 15 个 .source、hook-status 1 个 JSON）
- `D:\穿搭\style-lab\.mimosa\`（finding-ledger 10 个事件 JSON、history 10 个、hook-state 3 个 + baseline 下 14 个 .source、hook-status 1 个、reports 11 个）
- `D:\穿搭\.v2c\plugin_root`

> 注意：`style-lab/src/` 内 64 个文件**没有孤岛**——每个源文件都能在 §4 的依赖链中找到入边（main.jsx→App→各组件/hooks/data；index.html→main.jsx；各 css 被对应组件 import；两张纹理被 textures.js import）。

---

## 7. style-lab 目录结构合理性判断

### 7.1 总体判断：合理

`style-lab/` 的 `src/components|data|hooks|styles|three` + `docs|reports|research|scripts` 划分清晰，符合 React + Vite 项目惯例：

- `src/data/` 全部是纯 ESM 数据/算法模块（契约明确要求可被 Node 直接 import），与 UI 解耦，测试脚本可直接 import——这是本项目最健康的设计。
- `docs/` 放契约、`reports/` 放交付报告与截图、`research/` 放调研原始材料、`scripts/` 放可执行工具，四者职责不混。
- 组件级样式按组件拆成 13 个 css 并就近 import，没有样式与组件脱节的问题。

### 7.2 放错位置/值得处理的文件（具体到路径与动作）

1. ✅ **已完成**：`style-lab/.t2-tmp/` 整体已删除（9 个文件）。删除前已把其中唯一的自动化测试能力（`verify.mjs` 对 Sources.jsx 的 esbuild 打包 + 检索/SSR 断言）升格为 `style-lab/scripts/test-sources.mjs`（45 项断言）并接入 `npm test`；原目录内 106KB 的打包产物 `style-lab/.t2-tmp/out/sources.mjs` 等一并删除。
2. ✅ **已完成**：根目录 `_t3-verify.mjs` 与 `.t3-verify/` 已先升格为 `style-lab/scripts/test-share.mjs`（159 项断言，覆盖 share.js 编解码往返 + 26 项非法输入零抛出 + SHARE_VERSION + outfitToText 降级）并接入 `npm test`，随后整体删除。
3. **`style-lab/scripts/test-backup.mjs` 与 `style-lab/scripts/test-backup-v2.mjs` 两套并存**，且都挂在 `npm test`（`test:backup` 与 `test:backup2`）。`test-backup.mjs`（23609 字节）与 `test-backup-v2.mjs`（12934 字节）都 import `../src/data/backup.js`；从命名与体积看是 v1 被 v2 迭代的过程残留，建议确认后删除被取代者并让 `npm test` 只跑一个。
4. **`style-lab/.mimosa/` 与根级 `.mimosa/` 不在项目目录结构内**。它们是 mimosa 审查工具状态（约 40+ 个 JSON、baseline 快照、历史 run 记录），与项目无关；**用户已裁决保留**（mimosa 工具状态目录），不再建议删除。
5. **`style-lab/reports/` 里 11 张截图与 3 份交付报告属历史交付证据**，保留在独立 `reports/` 目录是合理的，但建议不要与 `docs/` 的活跃契约混用；无需移动，仅作归档标注即可。
6. **根目录交付成品 `型格穿搭实验室-双击打开.html` 已与 `style-lab/dist-single/index.html` 解除双份同步**：清理后 `dist-single/` 已删除，根 html 成为唯一成品；发布时直接用 `npm run build:release`（内部先跑 `build:single` 再复制），不再存在两份文件不同步的隐患。

### 7.3 无需动作的观察

- `style-lab/src/data/stats.js` 是派生聚合模块（从 catalog/advice/sources 计算 PROJECT_STATS），放在 data/ 可接受，且被 App 与 generate-docs 共用。
- `style-lab/src/data/link-status.generated.js` 只含 2 条记录不是异常：`check-links.mjs` 只对 `SOURCES` 中被选中检查的条目写回状态，历史只跑过小红书平台的复检。
- 清理前 `style-lab/dist/` 与 `style-lab/dist-single/` 并存是设计使然（常规部署 vs 双击打开），不是冗余；清理后两者已删除（见 §9），需要时分别用 `npm run build` / `npm run build:single` 重建。

---

## 8. 不确定项

1. **`.mimosa/`（两处）能否删除**：✅ 已裁决——用户决定保留（mimosa 工具状态目录，`D:\穿搭\.mimosa` 与 `D:\穿搭\style-lab\.mimosa`）。
2. **`.v2c/plugin_root` 能否删除**：✅ 已裁决——用户决定保留（video2code 插件指针，`D:\穿搭\.v2c`）。
3. **`style-lab/scripts/test-backup.mjs` 与 `test-backup-v2.mjs` 哪个是被取代者**：仅凭命名与体积判断 v2 是新版，但未运行两套测试（本任务不要求跑测试，且不改变任何文件），无法确定 v1 是否仍覆盖 v2 未覆盖的边界；处置建议为「确认后删除其一」。
4. **`style-lab/dist/` 是否可删**：✅ 已执行——`style-lab/dist/` 已删除（可 `npm run build` 重建）；注意删除后 `npm run preview` 不可用，需先重建。
5. **任务书与实际的计数差异**：任务书写 `src/data/(15)`，实际为 16 个文件（多出的正是 `style-lab/src/data/stats.js` 应被计入；任务书 21+15+5+13+4+3=61，加 2 纹理=63，与实际 64 差 1，即 data 目录少计 1）。本报告按实际 16 个列出，总数 64 与任务书一致。
6. **`style-lab/.t2-tmp/*.txt` 四份日志的具体来源命令**：只能确认是构建/测试输出快照（内容为文本日志），无法从文件名反推当时执行的完整命令；不影响「删除」建议，但历史价值为零的证据不充分（故标删除而非归档）。

---

## 9. 清理执行记录

> 本节为清理执行后的补记（2026-10-16）。§2 分类总表中相应行的处置列已同步更新为实际结果。

### 9.1 已删除的 5 项

| 绝对路径 | 说明 | 重建/替代 |
|---|---|---|
| `D:\穿搭\_t3-verify.mjs` | 旧 A1：分享编解码临时验证脚本 | 能力已升格为 `style-lab/scripts/test-share.mjs` |
| `D:\穿搭\.t3-verify\` | 旧 A2：独立 vite 验证工程（整树，含 `dist-t3\`、`exported-card.png`） | 能力已升格为 `style-lab/scripts/test-share.mjs` |
| `D:\穿搭\style-lab\.t2-tmp\` | 旧 A3：构建/探针临时目录（整树） | 能力已升格为 `style-lab/scripts/test-sources.mjs` |
| `D:\穿搭\style-lab\dist\` | 旧 A4：常规多文件构建产物（整树） | `npm run build` 重建 |
| `D:\穿搭\style-lab\dist-single\` | 旧 A5：单文件构建产物（整树） | `npm run build:single` 重建；根 html 由 `npm run build:release` 重建 |

### 9.2 用户裁决保留的 4 项

| 绝对路径 | 保留理由 |
|---|---|
| `D:\穿搭\.mimosa\` | mimosa 工具状态（用户明确裁决保留） |
| `D:\穿搭\style-lab\.mimosa\` | mimosa 工具状态（用户明确裁决保留） |
| `D:\穿搭\.v2c\` | video2code 插件指针（用户明确裁决保留） |
| `D:\穿搭\style-lab\node_modules\` | 依赖目录（261MB，可由 `npm ci` 重建，用户明确裁决保留） |

### 9.3 本轮新增的 5 个文件

| 文件 | 大小 | 说明 |
|---|---|---|
| `D:\穿搭\style-lab\scripts\test-share.mjs` | 7041 B | 159 项断言：share.js 编解码往返 + 26 项非法输入零抛出 + SHARE_VERSION + outfitToText 降级 |
| `D:\穿搭\style-lab\scripts\test-sources.mjs` | 20558 B | 45 项断言：esbuild 打包 Sources.jsx 后断言 filterSources/searchSources/paginate/buildFacets/排序/分页/SSR 无障碍 |
| `D:\穿搭\style-lab\docs\HISTORICAL-NOTES.md` | 1216 B | 记录 3 条随临时目录消失但 reports 无等价记录的历史事实 |
| `D:\穿搭\style-lab\docs\WORKSPACE-CLASSIFICATION.md` | 56173 B（初稿） | 本分类报告；清理执行后已就地更新为双时点文档 |
| `D:\穿搭\style-lab\docs\INVENTORY-BEFORE-CLEANUP.csv` | 18350 B | 清理前 136 行 SHA256 快照 |

### 9.4 package.json 改动

- 新增 `"test:share"` 与 `"test:sources"` 两个 script，并插入 `"test"` 链（位于 `test:bodyprofile` 之后、`test:collage` 之前）。
- `npm test` 由清理前 11 步变为 13 步。

### 9.5 清理前后核验

- 清理后 `npm.cmd test`（`D:\穿搭\style-lab` 下）exit code = 0，13 步全绿。
- 清理前基线同为 exit 0（11 步），清理未破坏任何东西。
- 根交付成品 `D:\穿搭\型格穿搭实验室-双击打开.html` SHA256 = `03FFE6850B061DE8C73612742EEDE008F49F4628AA4BFD79062286FC13BDE36B`，清理前后完全一致。
- 重建链路已实测：`npm.cmd run build` exit 0、`npm.cmd run build:single` exit 0，且重建出的 `dist-single\index.html` 与根 html 字节级相同（同 SHA256）。

### 9.6 关键教训

`_t3-verify.mjs`、`.t3-verify/`、`.t2-tmp/` 名字虽叫「临时」，实际却是 `share.js` 与 `Sources.jsx` 唯一存在的自动化测试；`style-lab/scripts/` 下原 14 个脚本对这两个模块零覆盖（已 grep 核实）。因此删除前先把它们升格为 `test-share.mjs` 与 `test-sources.mjs` 两个正式测试并接入 `npm test`，否则删除会让两份核心契约失去回归网。
