// 今日天气与推荐 v1 断言：node scripts/test-daily.mjs
//
// 这个模块有两处最容易出错，测试重点就压在它们身上：
//   1) 归一化必须是**逐字段修复 + 记录 warnings**，不能因为一个坏字段整份丢弃，
//      也不能悄悄接受越界值（-999℃ 这种脏数据要夹到契约边界）；
//   2) 天气适配分必须真的随天气变化（雨天的帆布鞋该被罚、冷天的厚外套该被奖励），
//      而不是把温度读完就丢掉。所以断言里拿同一天气不同装备做对照。
//
// 联网部分只测 URL 构造与响应解析，测试进程不发起任何网络请求。
import assert from 'node:assert/strict'
import {
  DAILY_KEY,
  DAILY_VERSION,
  DEFAULT_TEMP,
  TEMP_MAX,
  TEMP_MIN,
  WEATHER_PARTS,
  buildForecastUrl,
  buildGeocodingUrl,
  conditionFromWeatherCode,
  createDaily,
  decodeDaily,
  describeDaily,
  encodeDaily,
  mergeWeatherIntoDaily,
  normalizeDaily,
  parseForecastResponse,
  parseGeocodingResponse,
  planToday,
  profileForDaily,
  readDaily,
  seasonFromTemp,
  touchDaily,
  warmthTarget,
  weatherFit,
  writeDaily,
} from '../src/data/daily.js'

let failed = 0
const ok = (m) => console.log('✓ ' + m)
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _dump: () => Object.fromEntries(map),
  }
}

/** 测试自带的装备表：只关心 warmth / mesh / name，避免依赖真实目录。 */
const GEAR = {
  'g-thick-top': { id: 'g-thick-top', name: '厚羽绒内搭', warmth: 4, mesh: 'hoodie' },
  'g-thin-top': { id: 'g-thin-top', name: '薄短袖', warmth: 1, mesh: 'tee' },
  'g-thick-outer': { id: 'g-thick-outer', name: '厚大衣', warmth: 4, mesh: 'coat' },
  'g-thin-outer': { id: 'g-thin-outer', name: '薄衬衫外层', warmth: 1, mesh: 'shirt' },
  'g-mid-outer': { id: 'g-mid-outer', name: '中间层外套', warmth: 2, mesh: 'overshirt' },
  'g-pants': { id: 'g-pants', name: '长裤', warmth: 2, mesh: 'pants' },
  'g-boot': { id: 'g-boot', name: '防水靴', warmth: 3, mesh: 'boot' },
  'g-canvas': { id: 'g-canvas', name: '帆布鞋', warmth: 1, mesh: 'canvas' },
}
const resolve = (id) => GEAR[id] || null

const THICK = { top: 'g-thick-top', outer: 'g-thick-outer', bottom: 'g-pants', shoes: 'g-boot' }
const THIN = { top: 'g-thin-top', outer: 'o-none', bottom: 'g-pants', shoes: 'g-canvas' }

// ------------------------------------------------------------------ 默认值与归一化

check('createDaily 给出契约默认值', () => {
  const d = createDaily()
  assert.equal(d.version, DAILY_VERSION)
  assert.equal(d.city, '')
  assert.equal(d.temp, DEFAULT_TEMP)
  assert.equal(d.condition, 'clear')
  assert.equal(d.wind, 'light')
  assert.equal(d.indoor, 'normal')
  assert.equal(d.commute, 'walk')
  assert.equal(d.occasion, 'casual')
  assert.equal(d.updatedAt, '')
})

check('normalizeDaily(undefined/null) 返回默认值且无告警', () => {
  for (const raw of [undefined, null]) {
    const out = normalizeDaily(raw)
    assert.equal(out.ok, true)
    assert.deepEqual(out.warnings, [])
    assert.deepEqual(out.state, createDaily())
  }
})

check('normalizeDaily 对非对象输入降级为默认值并告警', () => {
  const out = normalizeDaily('rain')
  assert.equal(out.ok, false)
  assert.equal(out.warnings.length, 1)
  assert.deepEqual(out.state, createDaily())
})

check('normalizeDaily 逐字段修复：坏字段不影响好字段', () => {
  const out = normalizeDaily({ temp: 'oops', condition: 'typhoon', wind: 'strong', city: '上海' })
  assert.equal(out.state.temp, DEFAULT_TEMP)
  assert.equal(out.state.condition, 'clear')
  assert.equal(out.state.wind, 'strong')
  assert.equal(out.state.city, '上海')
  assert.equal(out.warnings.length, 2)
})

check('normalizeDaily 把越界气温夹到契约边界并告警', () => {
  const low = normalizeDaily({ temp: -999 })
  assert.equal(low.state.temp, TEMP_MIN)
  assert.ok(low.warnings[0].includes(String(TEMP_MIN)))
  const high = normalizeDaily({ temp: 999 })
  assert.equal(high.state.temp, TEMP_MAX)
  assert.ok(high.warnings[0].includes(String(TEMP_MAX)))
})

check('normalizeDaily 气温四舍五入为整数', () => {
  assert.equal(normalizeDaily({ temp: 22.6 }).state.temp, 23)
  assert.equal(normalizeDaily({ temp: 22.4 }).state.temp, 22)
})

check('normalizeDaily 修剪城市名并限制长度', () => {
  assert.equal(normalizeDaily({ city: '  上海  ' }).state.city, '上海')
  const long = normalizeDaily({ city: 'x'.repeat(120) })
  assert.equal(long.state.city.length, 40)
})

check('normalizeDaily 忽略非文本城市并告警', () => {
  const out = normalizeDaily({ city: 123 })
  assert.equal(out.state.city, '')
  assert.equal(out.warnings.length, 1)
})

check('normalizeDaily 把空白 updatedAt 当作未填写、非文本则告警', () => {
  const blank = normalizeDaily({ updatedAt: '   ' })
  assert.equal(blank.state.updatedAt, '')
  assert.deepEqual(blank.warnings, [])
  const bad = normalizeDaily({ updatedAt: 123 })
  assert.equal(bad.state.updatedAt, '')
  assert.equal(bad.warnings.length, 1)
  const good = normalizeDaily({ updatedAt: '2026-10-15T02:00:00.000Z' })
  assert.equal(good.state.updatedAt, '2026-10-15T02:00:00.000Z')
  assert.deepEqual(good.warnings, [])
})

check('createDaily → encode → decode 不应产生任何告警', () => {
  const back = decodeDaily(encodeDaily(createDaily()))
  assert.equal(back.ok, true)
  assert.deepEqual(back.warnings, [])
  assert.deepEqual(back.state, createDaily())
})

check('normalizeDaily 不修改调用方传入的对象', () => {
  const raw = { temp: 999, condition: 'typhoon', city: 5 }
  const snapshot = JSON.stringify(raw)
  normalizeDaily(raw)
  assert.equal(JSON.stringify(raw), snapshot)
})

check('touchDaily 打时间戳；非法 Date 退化为空串', () => {
  const at = touchDaily(createDaily(), new Date('2026-10-15T02:00:00.000Z'))
  assert.equal(at.updatedAt, '2026-10-15T02:00:00.000Z')
  const broken = touchDaily({ temp: 999 }, new Date('nonsense'))
  assert.equal(broken.updatedAt, '')
  assert.equal(broken.temp, TEMP_MAX)
})

// ------------------------------------------------------------------ 存储读写

check('encode/decode 往返等价', () => {
  const state = { ...createDaily(), city: '杭州', temp: 12, condition: 'rain', occasion: 'work' }
  const back = decodeDaily(encodeDaily(state))
  assert.equal(back.ok, true)
  assert.deepEqual(back.state, normalizeDaily(state).state)
})

check('decodeDaily 对空串与损坏 JSON 安全降级', () => {
  const empty = decodeDaily('   ')
  assert.equal(empty.ok, true)
  assert.deepEqual(empty.state, createDaily())
  const broken = decodeDaily('{"temp":12,')
  assert.equal(broken.ok, false)
  assert.deepEqual(broken.state, createDaily())
  assert.ok(broken.warnings.length >= 1)
})

check('decodeDaily 修复合法 JSON 里的非法字段', () => {
  const out = decodeDaily('{"temp":"x","condition":"nope","occasion":"work"}')
  assert.equal(out.state.temp, DEFAULT_TEMP)
  assert.equal(out.state.condition, 'clear')
  assert.equal(out.state.occasion, 'work')
  assert.equal(out.warnings.length, 2)
})

check('writeDaily/readDaily 走注入的存储往返', () => {
  const storage = fakeStorage()
  const state = { ...createDaily(), city: '成都', temp: 8 }
  const written = writeDaily(storage, state)
  assert.equal(written.ok, true)
  assert.equal(written.error, null)
  const back = readDaily(storage)
  assert.equal(back.state.city, '成都')
  assert.equal(back.state.temp, 8)
  assert.equal(back.missing, false)
  assert.ok(back.warnings.length === 0)
})

check('writeDaily/readDaily 在存储不可用时不抛异常', () => {
  const written = writeDaily(null, createDaily())
  assert.equal(written.ok, false)
  const out = readDaily(null)
  assert.deepEqual(out.state, createDaily())
  assert.equal(out.missing, true)
})

check('readDaily 修复被外部写坏的存储值', () => {
  const storage = fakeStorage({ [DAILY_KEY]: '{not json' })
  const out = readDaily(storage)
  assert.deepEqual(out.state, createDaily())
  assert.ok(out.warnings.length >= 1)
})

// ------------------------------------------------------------------ 温度推导

check('seasonFromTemp 边界正确', () => {
  assert.equal(seasonFromTemp(24), 'summer')
  assert.equal(seasonFromTemp(23.9), 'spring')
  assert.equal(seasonFromTemp(15), 'spring')
  assert.equal(seasonFromTemp(14.9), 'autumn')
  assert.equal(seasonFromTemp(5), 'autumn')
  assert.equal(seasonFromTemp(4.9), 'winter')
  assert.equal(seasonFromTemp('x'), seasonFromTemp(DEFAULT_TEMP))
})

check('warmthTarget 随温度升高单调下移', () => {
  const mids = [0, 7, 20, 30].map((t) => {
    const [lo, hi] = warmthTarget(t)
    assert.ok(lo < hi, `${t}℃ 的区间应非空`)
    return (lo + hi) / 2
  })
  for (let i = 1; i < mids.length; i += 1) assert.ok(mids[i] < mids[i - 1], '保暖目标应随温度升高而下降')
  assert.deepEqual(warmthTarget('x'), warmthTarget(DEFAULT_TEMP))
})

// ------------------------------------------------------------------ 天气适配分

check('weatherFit 结构与各分项上限一致', () => {
  const fit = weatherFit(THICK, { temp: 5, condition: 'rain', wind: 'strong' }, resolve)
  assert.equal(fit.parts.length, WEATHER_PARTS.length)
  fit.parts.forEach((part, i) => {
    assert.equal(part.key, WEATHER_PARTS[i].key)
    assert.equal(part.max, WEATHER_PARTS[i].max)
    assert.ok(part.value >= 0 && part.value <= part.max, `${part.key} 越界`)
    assert.equal(typeof part.note, 'string')
  })
  assert.ok(fit.value >= 0 && fit.value <= 100)
  assert.equal(fit.value, fit.parts.reduce((s, p) => s + p.value, 0))
  assert.equal(fit.reasons.length, WEATHER_PARTS.length)
  assert.equal(fit.totalWarmth, 4 + 4 + 2 + 3)
})

check('weatherFit 是纯函数：同输入同输出', () => {
  const conditions = { temp: 3, condition: 'snow', wind: 'strong', indoor: 'strong', commute: 'transit' }
  const a = weatherFit(THICK, conditions, resolve)
  const b = weatherFit(THICK, conditions, resolve)
  assert.deepEqual(a, b)
})

check('weatherFit 对退化输入不抛异常', () => {
  for (const input of [null, undefined, 'x', [], {}]) {
    const fit = weatherFit(input, null, resolve)
    assert.ok(Number.isFinite(fit.value))
    assert.equal(fit.parts.length, WEATHER_PARTS.length)
  }
})

// ---- 分布形状断言：天气分必须真的能区分不同搭配 ----
//
// 背景：这个分值被 TodayPlanner 用来给「今日三套」排序。它曾经只有 5 个离散值、
// 且 70.8% 的组合拿满分——全部满分等于没有排序，推荐顺序形同虚设。
// 下面几条把分布钉住：谁把它改回「命中即满分」，这里立刻变红。
//
// 组合集用本文件自带的 GEAR（2 上装 × 3 外套 × 1 下装 × 2 鞋 = 12 套），
// 不依赖真实目录——这一层的契约是「分项逻辑会分档」，不是「目录里有多少件」。
const OUTFIT_GRID = []
for (const top of ['g-thin-top', 'g-thick-top']) {
  for (const outer of ['o-none', 'g-thin-outer', 'g-mid-outer', 'g-thick-outer']) {
    for (const bottom of ['g-pants']) {
      for (const shoes of ['g-boot', 'g-canvas']) {
        OUTFIT_GRID.push({ top, outer, bottom, shoes, accs: [] })
      }
    }
  }
}
const CLEAR_DAY = { temp: 20, condition: 'clear', wind: 'light', indoor: 'mild', commute: 'walk' }
const RAINY_DAY = { temp: 8, condition: 'rain', wind: 'strong', indoor: 'strong', commute: 'transit' }
const scoreAll = (cond) => OUTFIT_GRID.map((o) => weatherFit(o, cond, resolve).value)

check('weatherFit 分布：晴天场景至少 8 个不同分值', () => {
  const values = new Set(scoreAll(CLEAR_DAY))
  assert.ok(values.size >= 8, `晴天场景只有 ${values.size} 个不同分值（要求 ≥8）—— 天气分又退化成「命中即满分」`)
})

check('weatherFit 分布：晴天满分率不超过 30%（满分不该白送）', () => {
  const values = scoreAll(CLEAR_DAY)
  const perfect = values.filter((v) => v === 100).length
  const pct = (perfect / values.length) * 100
  assert.ok(pct <= 30, `晴天满分率 ${pct.toFixed(1)}%（要求 ≤30%）—— 满分太廉价会拖垮今日排序的区分度`)
})

check('weatherFit 分布：雨天场景至少 8 个不同分值', () => {
  const values = new Set(scoreAll(RAINY_DAY))
  assert.ok(values.size >= 8, `雨天场景只有 ${values.size} 个不同分值（要求 ≥8）`)
})

check('weatherFit 分项：外套保暖度越高，雨天挡雨分越高（连续而非二值）', () => {
  // 用防水靴：帆布鞋会扣 8 分，把外套那几档的差异压到 0 以下，看不出梯度。
  const rainOf = (outerId) => weatherFit(
    { top: 'g-thin-top', outer: outerId, bottom: 'g-pants', shoes: 'g-boot', accs: [] }, RAINY_DAY, resolve,
  ).parts.find((p) => p.key === 'rain').value
  const thin = rainOf('g-thin-outer')
  const mid = rainOf('g-mid-outer')
  const thick = rainOf('g-thick-outer')
  assert.ok(thin < mid, `薄外套挡雨 ${thin} 应低于中间层 ${mid}`)
  assert.ok(mid < thick, `中间层挡雨 ${mid} 应低于厚外套 ${thick}`)
})

check('weatherFit 分项：大风天挡风分按外套保暖度分档（不是「有外套就满分」）', () => {
  const windDay = { temp: 10, condition: 'clear', wind: 'strong' }
  const windOf = (outerId) => weatherFit(
    { top: 'g-thin-top', outer: outerId, bottom: 'g-pants', shoes: 'g-boot', accs: [] }, windDay, resolve,
  ).parts.find((p) => p.key === 'wind').value
  const none = windOf('o-none')
  const thin = windOf('g-thin-outer')
  const thick = windOf('g-thick-outer')
  assert.ok(thin > none, `薄外套挡风 ${thin} 应高于无外套 ${none}`)
  assert.ok(thick > thin, `厚外套挡风 ${thick} 应高于薄外套 ${thin}`)
})

check('weatherFit 分项：室内温差大时，外套越厚室内分越低', () => {
  const indoorDay = { temp: 2, condition: 'clear', wind: 'light', indoor: 'strong' }
  const indoorOf = (outerId) => weatherFit(
    { top: 'g-thin-top', outer: outerId, bottom: 'g-pants', shoes: 'g-boot', accs: [] }, indoorDay, resolve,
  ).parts.find((p) => p.key === 'indoor').value
  assert.ok(indoorOf('g-thick-outer') < indoorOf('g-mid-outer'), '厚外套在温差大的室内更难受')
})

check('炎热天气里厚装被罚、薄装被奖励', () => {
  const hot = { temp: 32, condition: 'clear', wind: 'light' }
  const thick = weatherFit(THICK, hot, resolve)
  const thin = weatherFit(THIN, hot, resolve)
  assert.ok(thin.value > thick.value, `薄装 ${thin.value} 应高于厚装 ${thick.value}`)
  assert.equal(thick.parts[0].key, 'warmth')
  assert.ok(thick.parts[0].value < thin.parts[0].value)
})

check('寒冷天气里厚装被奖励、薄装被罚', () => {
  const cold = { temp: -5, condition: 'snow', wind: 'strong' }
  const thick = weatherFit(THICK, cold, resolve)
  const thin = weatherFit(THIN, cold, resolve)
  assert.ok(thick.value > thin.value, `厚装 ${thick.value} 应高于薄装 ${thin.value}`)
})

check('雨天防水靴优于帆布鞋', () => {
  const rainy = { temp: 10, condition: 'rain', wind: 'light' }
  const boot = weatherFit({ ...THIN, shoes: 'g-boot' }, rainy, resolve)
  const canvas = weatherFit({ ...THIN, shoes: 'g-canvas' }, rainy, resolve)
  assert.ok(boot.parts[1].value > canvas.parts[1].value, '降水应对分应有差异')
})

check('o-none 视为没有外套：大风天防风项不得高分', () => {
  const windy = { temp: 12, condition: 'clear', wind: 'strong' }
  const none = weatherFit(THIN, windy, resolve)
  const coated = weatherFit(THICK, windy, resolve)
  assert.ok(none.parts[2].value < coated.parts[2].value)
  assert.ok(none.totalWarmth < coated.totalWarmth)
})

// ------------------------------------------------------------------ 联网部分（只解析，不发请求）

check('buildGeocodingUrl 正确编码且空输入返回空串', () => {
  const url = buildGeocodingUrl('上海')
  assert.ok(url.startsWith('https://geocoding-api.open-meteo.com/v1/search?'))
  assert.ok(url.includes('count=1'))
  assert.ok(url.includes(encodeURIComponent('上海')))
  assert.equal(buildGeocodingUrl('   '), '')
  assert.equal(buildGeocodingUrl(42), '')
})

check('buildForecastUrl 校验经纬度范围', () => {
  const url = buildForecastUrl(31.23, 121.47)
  assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'))
  assert.ok(url.includes('latitude=31.23'))
  assert.ok(url.includes('timezone=auto'))
  assert.equal(buildForecastUrl(999, 0), '')
  assert.equal(buildForecastUrl(0, 999), '')
  assert.equal(buildForecastUrl('x', 0), '')
})

check('conditionFromWeatherCode 覆盖四类天气', () => {
  assert.equal(conditionFromWeatherCode(0), 'clear')
  assert.equal(conditionFromWeatherCode(1), 'clear')
  assert.equal(conditionFromWeatherCode(3), 'cloudy')
  assert.equal(conditionFromWeatherCode(48), 'cloudy')
  assert.equal(conditionFromWeatherCode(61), 'rain')
  assert.equal(conditionFromWeatherCode(82), 'rain')
  assert.equal(conditionFromWeatherCode(95), 'rain')
  assert.equal(conditionFromWeatherCode(75), 'snow')
  assert.equal(conditionFromWeatherCode(86), 'snow')
  assert.equal(conditionFromWeatherCode('x'), 'cloudy')
  assert.equal(conditionFromWeatherCode(9999), 'cloudy')
})

check('parseGeocodingResponse 提取城市与经纬度', () => {
  const good = parseGeocodingResponse({
    results: [{ name: '上海市', latitude: 31.22, longitude: 121.46, admin1: '上海', country: '中国' }],
  })
  assert.equal(good.ok, true)
  assert.equal(good.city, '上海市')
  assert.equal(good.latitude, 31.22)
  assert.equal(good.region, '上海 · 中国')

  for (const bad of [null, {}, { results: [] }, { results: [{ name: 'x' }] }, 'x']) {
    const out = parseGeocodingResponse(bad)
    assert.equal(out.ok, false)
    assert.equal(out.latitude, null)
    assert.ok(out.error.length > 0)
  }
})

check('parseForecastResponse 解析 current 字段并换算 m/s', () => {
  const good = parseForecastResponse({
    current: { temperature_2m: 7.4, weather_code: 61, wind_speed_10m: 33, time: '2026-10-15T10:00' },
  })
  assert.equal(good.ok, true)
  assert.equal(good.temp, 7.4)
  assert.equal(good.condition, 'rain')
  assert.equal(good.wind, 'strong')
  assert.equal(good.observedAt, '2026-10-15T10:00')

  const ms = parseForecastResponse({ current: { temperature_2m: 7, wind_speed_10m: 5 }, current_units: { wind_speed_10m: 'm/s' } })
  assert.equal(ms.wind, 'light')
  const converted = parseForecastResponse({ current: { temperature_2m: 7, wind_speed_10m: 9 }, current_units: { wind_speed_10m: 'm/s' } })
  assert.equal(converted.wind, 'strong')

  for (const bad of [null, {}, { current: {} }, { current: { weather_code: 1 } }, 'x']) {
    const out = parseForecastResponse(bad)
    assert.equal(out.ok, false)
    assert.equal(out.temp, null)
  }
})

check('mergeWeatherIntoDaily 只覆盖天气，保留用户手填项', () => {
  const base = { ...createDaily(), city: '旧城市', temp: 20, occasion: 'formal', indoor: 'none', commute: 'car' }
  const merged = mergeWeatherIntoDaily(base, { ok: true, temp: 3.6, condition: 'snow', wind: 'strong' }, '哈尔滨')
  assert.equal(merged.city, '哈尔滨')
  assert.equal(merged.temp, 4)
  assert.equal(merged.condition, 'snow')
  assert.equal(merged.wind, 'strong')
  assert.equal(merged.occasion, 'formal')
  assert.equal(merged.indoor, 'none')
  assert.equal(merged.commute, 'car')

  const failed = mergeWeatherIntoDaily(base, { ok: false }, '哈尔滨')
  assert.equal(failed.city, '旧城市')
  assert.equal(failed.temp, 20)
  assert.equal(mergeWeatherIntoDaily(base, null, 'x').city, '旧城市')
})

check('mergeWeatherIntoDaily 夹取异常气温', () => {
  const merged = mergeWeatherIntoDaily(createDaily(), { ok: true, temp: -300, condition: 'snow', wind: 'light' }, '漠河')
  assert.equal(merged.temp, TEMP_MIN)
})

check('describeDaily 输出可读摘要', () => {
  const text = describeDaily({ city: '北京', temp: -2, condition: 'snow', wind: 'strong' })
  assert.ok(text.includes('北京'))
  assert.ok(text.includes('-2℃'))
  assert.ok(text.includes('雪'))
  assert.ok(text.includes('大风'))
  assert.ok(describeDaily(null).includes('未填写城市'))
})

// ------------------------------------------------------------------ 今日推荐（端到端纯函数）

check('planToday 返回契约结构且按 dayScore 降序', () => {
  const plan = planToday({ daily: { temp: 18, condition: 'cloudy' }, limit: 3 })
  assert.ok(plan.conditions && plan.profile)
  assert.ok(Array.isArray(plan.outfits) && plan.outfits.length <= 3)
  assert.ok(plan.outfits.length > 0)
  for (const o of plan.outfits) {
    assert.ok(o.dayScore >= 0 && o.dayScore <= 100)
    assert.equal(o.weatherParts.length, WEATHER_PARTS.length)
    assert.equal(typeof o.weatherScore, 'number')
    assert.ok(Array.isArray(o.reasons) && Array.isArray(o.warnings))
  }
  for (let i = 1; i < plan.outfits.length; i += 1) {
    assert.ok(plan.outfits[i - 1].dayScore >= plan.outfits[i].dayScore, 'dayScore 应降序')
  }
})

check('planToday 去掉重复造型', () => {
  const plan = planToday({ daily: { temp: 20 }, limit: 6 })
  const keys = plan.outfits.map((o) => [o.top, o.outer, o.bottom, o.shoes, [...(o.accs || [])].join('-')].join('|'))
  assert.equal(new Set(keys).size, keys.length)
})

check('planToday 的 limit 被夹在 1..6', () => {
  assert.ok(planToday({ limit: 0 }).outfits.length >= 1)
  assert.ok(planToday({ limit: 99 }).outfits.length <= 6)
  assert.ok(planToday({ limit: 'x' }).outfits.length <= 6)
})

check('planToday 对全部退化输入不抛异常', () => {
  for (const input of [undefined, null, 'x', [], {}, { daily: 'bad', limit: -5 }]) {
    const plan = planToday(input)
    assert.ok(Array.isArray(plan.outfits))
    assert.ok(Array.isArray(plan.notices))
    assert.ok(Array.isArray(plan.warnings))
  }
})

check('planToday 把天气读进推荐：冷天的总保暖度高于热天', () => {
  const cold = planToday({ daily: { temp: -5, condition: 'snow', wind: 'strong' }, limit: 5 })
  const hot = planToday({ daily: { temp: 33, condition: 'clear', wind: 'light' }, limit: 5 })
  const avg = (plan) => plan.outfits.reduce((s, o) => s + o.totalWarmth, 0) / plan.outfits.length
  assert.ok(avg(cold) > avg(hot), `冷天均值 ${avg(cold)} 应高于热天均值 ${avg(hot)}`)
})

check('planToday 把非法天气归一化并给出告警', () => {
  const plan = planToday({ daily: { temp: -999, condition: 'typhoon' }, limit: 3 })
  assert.equal(plan.conditions.temp, TEMP_MIN)
  assert.equal(plan.conditions.condition, 'clear')
  assert.ok(plan.warnings.length >= 2)
})

check('profileForDaily 从天气与场合推出 profile', () => {
  assert.equal(profileForDaily({ temp: 30 }).season, 'summer')
  assert.equal(profileForDaily({ temp: 0 }).season, 'winter')
  assert.equal(profileForDaily({ temp: 20, occasion: 'sport' }).occasion, 'casual')
  assert.equal(profileForDaily({ temp: 20, occasion: 'formal' }).occasion, 'work')
  assert.equal(profileForDaily({ temp: 20 }, { season: 'winter' }).season, 'winter')
  assert.equal(profileForDaily({ temp: 30 }, { season: 'summer' }).season, 'summer')
  assert.equal(profileForDaily({ temp: 20 }, { height: 999 }).height, 210)
  assert.equal(profileForDaily({ temp: 20 }, { height: 100 }).height, 150)
})

console.log('')
if (failed > 0) {
  console.error(`test-daily: ${failed} 项失败`)
  process.exit(1)
}
console.log('test-daily: 全部通过')
