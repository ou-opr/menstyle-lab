import { PRESETS } from './catalog.js'

export const PROFILE_OPTIONS = {
  bodies: [
    { value: 'slim', label: '偏瘦' },
    { value: 'standard', label: '匀称' },
    { value: 'athletic', label: '健壮 / 肩宽' },
    { value: 'plump', label: '微胖' },
  ],
  seasons: [
    { value: 'spring', label: '春季' },
    { value: 'summer', label: '夏季' },
    { value: 'autumn', label: '秋季' },
    { value: 'winter', label: '冬季' },
  ],
  occasions: [
    { value: 'casual', label: '日常休闲' },
    { value: 'campus', label: '校园 / 上课' },
    { value: 'work', label: '通勤 / 面试' },
    { value: 'date', label: '约会 / 聚会' },
  ],
}

const LABELS = Object.fromEntries(
  Object.values(PROFILE_OPTIONS).flat().map((item) => [item.value, item.label]),
)

// 仍然复用衣柜中的真实单品。这里描述的是造型适用条件，而不是另建一套无法试穿的推荐数据。
export const RECOMMENDATION_LOOKS = [
  {
    presetId: 'p-safe',
    seasons: ['spring', 'summer', 'autumn'], occasions: ['casual', 'campus', 'date'],
    traits: ['balanced', 'straight', 'clean', 'compact'],
    sources: ['kin-pants', 'six-rules', 'chongs-converse'],
  },
  {
    presetId: 'p-street',
    seasons: ['spring', 'autumn', 'winter'], occasions: ['casual', 'campus'],
    traits: ['oversized', 'layered', 'straight'],
    sources: ['kin-pants', 'cat-styles', 'bear-formula'],
  },
  {
    presetId: 'p-date',
    seasons: ['spring', 'autumn', 'winter'], occasions: ['date', 'casual'],
    traits: ['balanced', 'warm', 'clean', 'straight'],
    sources: ['cake-styles', 'xhs-soete-autumn', 'curator-advanced'],
  },
  {
    presetId: 'p-work',
    seasons: ['spring', 'autumn', 'winter'], occasions: ['work', 'date'],
    traits: ['structured', 'fitted', 'clean', 'straight'],
    sources: ['shirts-tuck', 'stone-intern', 'stone-suit'],
  },
  {
    presetId: 'p-layer',
    seasons: ['autumn', 'winter'], occasions: ['casual', 'date', 'work'],
    traits: ['layered', 'structured', 'warm'],
    sources: ['stone-coat', 'xhs-soete-autumn', 'curator-winter'],
  },
  {
    presetId: 'p-mono',
    seasons: ['spring', 'autumn', 'winter'], occasions: ['casual', 'work', 'date'],
    traits: ['dark', 'clean', 'straight', 'compact'],
    sources: ['victor-mono', 'stone-black', 'madeng-short'],
  },
  {
    presetId: 'p-campus',
    seasons: ['spring', 'summer', 'autumn'], occasions: ['campus', 'casual', 'date'],
    traits: ['fitted', 'clean', 'compact'],
    sources: ['stone-casual', 'shu-look', 'hallo-175'],
  },
  {
    presetId: 'p-summer',
    seasons: ['summer'], occasions: ['casual', 'campus', 'date'],
    traits: ['compact', 'clean', 'straight'],
    sources: ['shu-week', 'xiao-summer', 'bvr-dapei-date'],
  },
  {
    presetId: 'p-weekend',
    seasons: ['spring', 'autumn'], occasions: ['casual', 'campus', 'date'],
    traits: ['clean', 'straight', 'compact'],
    sources: ['sspai-autumn', 'mfa-basic', 'shu-week'],
  },
  {
    presetId: 'p-camp',
    seasons: ['autumn', 'winter'], occasions: ['casual'],
    traits: ['oversized', 'layered', 'warm', 'straight'],
    sources: ['dy-jiang-skills', 'kin-pants', 'rmrs-rules'],
  },
  {
    presetId: 'p-festival',
    seasons: ['spring', 'summer'], occasions: ['casual', 'date'],
    traits: ['oversized', 'layered', 'compact'],
    sources: ['cat-styles', 'shu-paris', 'hallo-tricks'],
  },
  {
    presetId: 'p-gala',
    seasons: ['autumn', 'winter'], occasions: ['work', 'date'],
    traits: ['structured', 'fitted', 'clean', 'dark'],
    sources: ['stone-suit', 'yt2-tomford-rules', 'dandy-fit'],
  },
  {
    presetId: 'p-rainy',
    seasons: ['spring', 'autumn'], occasions: ['work', 'casual'],
    traits: ['layered', 'structured', 'straight'],
    sources: ['rain-coats', 'sspai-fabric', 'stone-coat'],
  },
  {
    presetId: 'p-heat',
    seasons: ['summer'], occasions: ['casual', 'campus'],
    traits: ['compact', 'clean', 'straight'],
    sources: ['stone-summer', 'xiao-summer', 'hupu-summer'],
  },
  {
    presetId: 'p-winter',
    seasons: ['winter', 'autumn'], occasions: ['casual', 'work', 'date'],
    traits: ['layered', 'warm', 'structured', 'dark'],
    sources: ['curator-winter', 'luoluo-coat', 'bvr-chammy-1000'],
  },
  {
    presetId: 'p-gym',
    seasons: ['spring', 'summer', 'autumn'], occasions: ['casual', 'campus'],
    traits: ['fitted', 'compact', 'clean'],
    sources: ['chongs-converse', 'tmf-sneakers', 'rmrs-rules'],
  },
  {
    presetId: 'p-wedding',
    seasons: ['spring', 'autumn', 'winter'], occasions: ['work', 'date'],
    traits: ['structured', 'fitted', 'clean'],
    sources: ['yt2-doctormike-suit', 'stone-suit', 'dandy-fit'],
  },
  {
    presetId: 'p-gallery',
    seasons: ['autumn', 'winter'], occasions: ['date', 'casual', 'work'],
    traits: ['structured', 'clean', 'layered', 'dark'],
    sources: ['douban-style', 'curator-advanced', 'douban-capsule'],
  },
  {
    presetId: 'p-home',
    seasons: ['spring', 'summer', 'autumn', 'winter'], occasions: ['casual'],
    traits: ['compact', 'clean', 'straight'],
    sources: ['sspai-basic', 'mfa-fit', 'xhs-haha-han'],
  },
]

const adjacentSeason = {
  spring: ['summer', 'autumn'], summer: ['spring'], autumn: ['spring', 'winter'], winter: ['autumn'],
}

const adjacentOccasion = {
  casual: ['campus', 'date'], campus: ['casual'], work: ['date'], date: ['casual', 'work'],
}

function bodyFit(body, traits) {
  if (body === 'slim') {
    if (traits.includes('layered') || traits.includes('structured')) return [9, '层次或挺括轮廓能增加上身量感，更适合偏瘦体型。']
    return [3, '保持合身并避免过度紧身，能让偏瘦身形更舒展。']
  }
  if (body === 'athletic') {
    if (traits.includes('fitted') || traits.includes('clean')) return [8, '利落肩线能保留身材优势，同时避免上身显得过于膨胀。']
    return [3, '版型留有余量，不会把肩胸位置勒得太满。']
  }
  if (body === 'plump') {
    if (traits.includes('dark') || traits.includes('straight')) return [9, '深色或直线型轮廓能减少横向分割，对微胖体型更友好。']
    if (traits.includes('oversized')) return [-5, '宽松单品需要控制长度，否则容易把视觉重心压低。']
    return [2, '整体色块较完整，注意选择垂顺而非紧绷的尺码。']
  }
  return [6, '均衡轮廓适合匀称体型，重点放在场景与色彩完成度。']
}

function heightFit(height, traits) {
  if (height < 170) {
    if (traits.includes('compact') || traits.includes('dark')) return [9, '短而完整的色块能减少身材切割，对小个子更显高。']
    if (traits.includes('oversized') || traits.includes('layered')) return [-5, '层次较多，需提高腰线并控制上装长度。']
    return [3, '建议把上装下摆收短或塞衣角，强化上短下长。']
  }
  if (height >= 183) {
    if (traits.includes('layered') || traits.includes('oversized')) return [8, '身高足以支撑层次和宽松量感，造型会更舒展。']
    return [4, '比例压力较小，可以把重点放在版型和场合匹配。']
  }
  return [6, '你的身高适配大多数常规版型，这套比例不需要额外修正。']
}

function buildWarnings(profile, look) {
  const warnings = []
  if (!look.seasons.includes(profile.season))
    warnings.push(`并非${LABELS[profile.season]}原生方案，需要通过增减外套或更换面料调节温度。`)
  if (!look.occasions.includes(profile.occasion))
    warnings.push(`这套与“${LABELS[profile.occasion]}”的正式度存在差距，鞋和配饰要尽量收敛。`)
  if (profile.height < 170 && (look.traits.includes('oversized') || look.traits.includes('layered')))
    warnings.push('避免上衣盖过胯部；露出腰线，否则多层叠穿会压身高。')
  if (profile.body === 'plump' && look.traits.includes('oversized'))
    warnings.push('不要用大一码代替合身：优先选垂顺直筒，而不是横向膨胀。')
  if (profile.season === 'summer' && look.presetId !== 'p-summer' && look.traits.includes('layered'))
    warnings.push('夏季叠穿只保留视觉思路，实际应换成薄衬衫或取消外套。')
  if (profile.occasion === 'work' && ['p-street', 'p-summer'].includes(look.presetId))
    warnings.push('正式通勤时运动感偏强，不适合保守行业或重要面试。')
  return warnings
}

export function recommendOutfits(rawProfile) {
  const profile = {
    height: Math.max(150, Math.min(210, Number(rawProfile.height) || 175)),
    body: rawProfile.body || 'standard',
    season: rawProfile.season || 'autumn',
    occasion: rawProfile.occasion || 'casual',
  }

  // 先剔除指向不存在预设的 look：数据链断裂时应降级为"少一套结果"（校验脚本会报出具体 presetId），
  // 而不是在 preset.name 上抛 TypeError 让整个调用方崩掉。
  return RECOMMENDATION_LOOKS.filter((look) => PRESETS.some((item) => item.id === look.presetId)).map((look) => {
    const preset = PRESETS.find((item) => item.id === look.presetId)
    let score = 40
    const reasons = []

    if (look.seasons.includes(profile.season)) {
      const seasonRank = look.seasons.indexOf(profile.season)
      score += 15 + Math.max(0, 3 - seasonRank * 1.5)
      reasons.push(`面料层次与${LABELS[profile.season]}温度匹配，不需要大幅调整。`)
    } else if (adjacentSeason[profile.season]?.some((item) => look.seasons.includes(item))) {
      score += 5
      reasons.push(`与${LABELS[profile.season]}相邻季节接近，调整一层厚度即可。`)
    } else {
      score -= 10
    }

    if (look.occasions.includes(profile.occasion)) {
      const occasionRank = look.occasions.indexOf(profile.occasion)
      score += 16 + Math.max(0, 4 - occasionRank * 2)
      reasons.push(`正式度与“${LABELS[profile.occasion]}”吻合，不容易用力过猛。`)
    } else if (adjacentOccasion[profile.occasion]?.some((item) => look.occasions.includes(item))) {
      score += 5
      reasons.push(`稍微调整鞋和配饰后，可以覆盖“${LABELS[profile.occasion]}”。`)
    } else {
      score -= 9
    }

    const [bodyScore, bodyReason] = bodyFit(profile.body, look.traits)
    const [heightScore, heightReason] = heightFit(profile.height, look.traits)
    score += bodyScore + heightScore
    reasons.push(bodyReason, heightReason)

    return {
      id: look.presetId,
      name: preset.name,
      mood: preset.mood,
      desc: preset.desc,
      outfit: preset.outfit,
      score: Math.round(Math.max(55, Math.min(96, score))),
      reasons,
      warnings: buildWarnings(profile, look),
      sourceIds: look.sources,
    }
  })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3)
}
