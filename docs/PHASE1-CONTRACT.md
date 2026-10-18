# 阶段一接口契约：个人衣橱闭环

状态：冻结（2026-10-15）

## 1. 原则

- 离线优先，不新增 npm 依赖。
- 结构化小数据存 `localStorage`；压缩照片 Blob 存 IndexedDB。
- 所有读取、迁移、图片处理失败必须安全降级，不得阻断 App 渲染。
- 系统目录 id 保持原样；个人单品 id 使用 `u-<uuid>`。
- 个人衣橱优先，缺项才使用系统单品，并明确标记为建议补充。

## 2. `PersonalItem` v1

```js
{
  id: 'u-...',
  name: string,
  category: 'tops' | 'outers' | 'bottoms' | 'shoes' | 'accs',
  status: 'owned' | 'wishlist' | 'disliked',
  hex: '#rrggbb',
  family: 'light' | 'dark' | 'neutral' | 'warm' | 'cool',
  formality: 1 | 2 | 3,
  warmth: 1 | 2 | 3,
  fit: 'slim' | 'regular' | 'relaxed',
  mesh: string,
  notes: string,
  tags: string[],
  photoId: string | null,
  createdAt: string,
  updatedAt: string,
  wearCount: number,
  lastWornAt: string | null
}
```

localStorage：`stylelab:wardrobe:v1`，值为 `{ version: 1, items: PersonalItem[] }`。

## 3. 照片仓库

模块：`src/data/imageStore.js`

```js
saveCompressedImage(file, { maxEdge = 1200, quality = 0.82 }): Promise<{ id, width, height, type, size }>
getImageBlob(id): Promise<Blob|null>
deleteImage(id): Promise<void>
exportImages(ids?): Promise<Array<{ id, type, dataUrl }>>
importImages(records): Promise<{ imported, skipped }>
```

IndexedDB：`stylelab-media` / version 1 / objectStore `images`。图片统一转为 JPEG（透明图可保留 WebP/PNG）；最长边不超过 1200，单图目标不超过约 900 KB。

## 4. 偏好 v1

localStorage：`stylelab:preferences:v1`。

```js
{
  version: 1,
  feedback: Array<{
    id: string,
    at: string,
    kind: 'like' | 'dislike' | 'worn',
    outfit: { top, outer, bottom, shoes, accs },
    reasons: Array<'too-formal'|'too-casual'|'too-warm'|'too-cold'|'color'|'fit'|'other'>
  }>,
  weights: {
    itemIds: Record<string, number>,
    colors: Record<string, number>,
    formalities: Record<string, number>
  }
}
```

单次反馈增量限制在 ±3；累计权重夹在 [-12, 12]；最终排序修正夹在 [-10, 10]，不得覆盖硬性冲突规则。必须支持查看与重置。

## 5. 个人衣橱推荐与智能替换

模块：`src/data/personalRecommendations.js`

```js
rankWithPersonalWardrobe(outfits, wardrobeState, preferences): Array<{
  ...outfit,
  personalScore: number,
  ownedRatio: number,
  missing: Array<{ category, itemId, name }>,
  preferenceDelta: number
}>

findSmartReplacements({ outfit, slot, intent, wardrobeState, preferences, limit = 5 }): Array<{
  item,
  source: 'personal' | 'system',
  owned: boolean,
  scoreDelta: number,
  reasons: string[]
}>
```

`intent`：`more-formal | more-casual | warmer | cooler | taller | subtle | owned-only`。

## 6. 备份包 v1

下载文件：`style-lab-backup-YYYY-MM-DD.json`。

```js
{
  schema: 'style-lab-backup',
  version: 1,
  exportedAt: string,
  app: { version: string },
  data: {
    wardrobe,
    preferences,
    looks,
    theme,
    images: Array<{ id, type, dataUrl }>
  }
}
```

导入先完整校验再写入；支持“合并”和“覆盖”；导入失败不得留下半写状态；未知高版本拒绝导入并显示原因。

## 7. UI 集成边界

- 新增导航与 `#wardrobe` 区域，放在个人方案之后、3D 之前。
- 个人衣橱管理器负责增删改查、状态、照片、筛选；不直接改 App 的 outfit。
- 推荐卡新增“已有占比 / 缺少单品”信息与喜欢/不喜欢/穿过反馈。
- 3D 区域新增智能替换入口，替换成功仍通过 App 的 `setOutfit`。
- 数据管理器放在页脚之前，负责备份、恢复、重置；高风险操作需二次确认。

## 8. 验收

- `npm.cmd test` 和 `npm.cmd run build:single` 全绿。
- 无 IndexedDB/localStorage 时页面仍可使用系统衣柜。
- 个人单品增删改查、照片压缩、刷新恢复、备份往返、损坏备份拒绝均有测试。
- 单文件 `file://` 桌面和 500px 移动端无横向溢出。
