// 阶段一装配层（PHASE1-CONTRACT §3 / §7）。
//
// 本文件只做「装配」：把已完成的四个模块（衣橱管理器 / 偏好面板 / 智能替换 / 数据管理）
// 接到 App 提升出来的那一份 store 上，并把契约 §3 的照片仓库接口对象注入数据管理器。
// 它不持有任何状态，也不复制任何业务规则——所有状态归 App，所有纯函数归 src/data/*。
//
// 为什么需要它：App 里若直接 import 四个模块并各自拼参数，注入细节（契约对象 vs 后端、
// appVersion、共享 preferences）会散落在 JSX 中，任何一处写错都会静默降级。

import { WardrobeManager } from './WardrobeManager'
import { PreferencePanel } from './PreferencePanel'
import { SmartReplace } from './SmartReplace'
import { DataManager } from './DataManager'
import {
  clearImages,
  countImages,
  deleteImage,
  exportImages,
  getDefaultStore,
  getImageBlob,
  importImages,
} from '../data/imageStore.js'
import '../styles/phase-one.css'

/** 与 package.json 的 version 对齐（备份包 app.version 用；本文件不读 package.json 以免引入构建期依赖）。 */
export const APP_VERSION = '0.1.0'

/**
 * 契约 §3 的照片仓库接口对象：把模块级函数绑定到**同一个**后端实例。
 *
 * 为什么必须绑定同一个后端：useWardrobe 存照片、DataManager 导出照片，若各自
 * 走一次 getDefaultStore() 之外的路径，备份就会导出一批找不到的孤儿照片。
 * 返回的 `backend` 供 useWardrobe 等需要「后端」而非「契约对象」的调用方复用。
 *
 * @param {object} [store] imageStore.js 的后端（createMemoryBackend / createIndexedDBBackend）
 */
export function createImageStore(store = getDefaultStore()) {
  return {
    backend: store,
    exportImages: (ids) => exportImages(ids, { store }),
    importImages: (records) => importImages(records, { store }),
    getImageBlob: (id) => getImageBlob(id, { store }),
    deleteImage: (id) => deleteImage(id, { store }),
    countImages: () => countImages({ store }),
    // 重置时必须连带清空照片仓库：照片在 IndexedDB 里，清 localStorage 清不到它，
    // 否则用户点了「重置」之后几十 MB 照片还占着配额，再导入备份容易撞配额上限。
    clearImages: () => clearImages({ store }),
  }
}

/**
 * 「我的衣橱」区块：衣橱管理器 + 偏好学习面板（契约 §4 要求偏好可查看可重置）。
 * @param {{wardrobe:object, preferences:object, outfit:object, onTry:(item:object)=>void}} props
 */
export function WardrobeSection({ wardrobe, preferences, outfit, onTry }) {
  return (
    <div className="po-wardrobe">
      <WardrobeManager wardrobe={wardrobe} onTry={onTry} />
      <PreferencePanel
        outfit={outfit}
        summary={preferences.summary}
        isEmpty={preferences.isEmpty}
        delta={preferences.deltaOf(outfit)}
        recordFeedback={preferences.recordFeedback}
        onReset={preferences.reset}
      />
    </div>
  )
}

/** 3D 区域的智能替换入口（契约 §7）：结果经 onApply 交回 App 的 setOutfit。 */
export function SmartReplaceBlock({ outfit, wardrobe, preferences, onApply }) {
  return (
    <SmartReplace
      outfit={outfit}
      wardrobeState={wardrobe.state}
      preferences={preferences.preferences}
      onApply={onApply}
    />
  )
}

/** 页脚之前的数据管理区块（契约 §7）。 */
export function DataSection({ imageStore, appVersion = APP_VERSION, onAfterImport = null }) {
  return <DataManager imageStore={imageStore} appVersion={appVersion} onAfterImport={onAfterImport} />
}
