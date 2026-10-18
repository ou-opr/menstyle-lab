// 体型参数 → 3D 模特比例 的断言（PHASE3-CONTRACT §1B）。
// 这一层能被自动化测的只有「算出来的倍数对不对」，渲染效果只能靠浏览器看，
// 所以这里把边界、夹取、回落、确定性和相机注视点全部钉死。
import assert from 'node:assert/strict'
import {
  BODY_BASELINE_HEIGHT,
  BODY_KEYS,
  BODY_SHAPES,
  DEFAULT_BODY,
  DEFAULT_HEIGHT,
  HEIGHT_MAX,
  HEIGHT_MIN,
  bodyTransform,
  cameraTargetFor,
  describeBodyProfile,
  normalizeProfile,
} from '../src/three/bodyProfile.js'

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log('  ok ' + label)
}

console.log('bodyProfile:')

ok('基准身材是 1:1', () => {
  const t = bodyTransform({ height: BODY_BASELINE_HEIGHT, body: 'standard' })
  assert.deepEqual(t.scale, [1, 1, 1])
  assert.equal(t.y, 1)
  assert.equal(t.defaulted, true)
  assert.equal(t.height, 175)
  assert.equal(t.label, '匀称')
})

ok('四个体型键与 recommendations 的 bodies 一致', () => {
  assert.deepEqual(BODY_KEYS, ['slim', 'standard', 'athletic', 'plump'])
  assert.equal(DEFAULT_BODY, 'standard')
  assert.equal(DEFAULT_HEIGHT, BODY_BASELINE_HEIGHT)
})

ok('每个体型都有中文标签与正的宽深倍数', () => {
  for (const key of BODY_KEYS) {
    const shape = BODY_SHAPES[key]
    assert.equal(typeof shape.label, 'string')
    assert.ok(shape.label.length > 0)
    assert.ok(shape.width > 0 && shape.depth > 0)
  }
})

ok('身高只改 y，不改宽深', () => {
  const t = bodyTransform({ height: 190, body: 'standard' })
  assert.equal(t.width, 1)
  assert.equal(t.depth, 1)
  assert.equal(t.scale[0], 1)
  assert.equal(t.scale[2], 1)
  assert.ok(Math.abs(t.scale[1] - 190 / 175) < 1e-12)
})

ok('体型只改宽深，不改 y', () => {
  const t = bodyTransform({ height: 175, body: 'plump' })
  assert.equal(t.scale[1], 1)
  assert.ok(t.width > 1 && t.depth > 1)
})

ok('偏瘦更窄更薄，微胖更宽更厚', () => {
  const slim = bodyTransform({ height: 175, body: 'slim' })
  const plump = bodyTransform({ height: 175, body: 'plump' })
  assert.ok(slim.width < 1 && slim.depth < 1)
  assert.ok(plump.width > 1 && plump.depth > 1)
  assert.ok(plump.width > slim.width && plump.depth > slim.depth)
})

ok('健壮是「宽大于厚」，微胖是「厚大于宽」', () => {
  const athletic = bodyTransform({ height: 175, body: 'athletic' })
  const plump = bodyTransform({ height: 175, body: 'plump' })
  assert.ok(athletic.width > athletic.depth)
  assert.ok(plump.depth > plump.width)
})

ok('身高单调：越高 y 越大', () => {
  const heights = [150, 160, 175, 190, 205]
  const ys = heights.map((height) => bodyTransform({ height, body: 'standard' }).y)
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] > ys[i - 1])
})

ok('身高超范围被夹取并记 warning', () => {
  const low = bodyTransform({ height: 120, body: 'standard' })
  const high = bodyTransform({ height: 260, body: 'standard' })
  assert.equal(low.height, HEIGHT_MIN)
  assert.equal(high.height, HEIGHT_MAX)
  assert.ok(low.warnings.length > 0 && high.warnings.length > 0)
  assert.ok(low.warnings[0].includes('150'))
})

ok('边界值本身不算越界', () => {
  assert.equal(bodyTransform({ height: HEIGHT_MIN, body: 'standard' }).warnings.length, 0)
  assert.equal(bodyTransform({ height: HEIGHT_MAX, body: 'standard' }).warnings.length, 0)
})

ok('数字字符串能解析，非数字回落默认并告警', () => {
  assert.equal(bodyTransform({ height: '182', body: 'standard' }).height, 182)
  const bad = bodyTransform({ height: 'up there', body: 'standard' })
  assert.equal(bad.height, DEFAULT_HEIGHT)
  assert.ok(bad.warnings.length > 0)
})

ok('未知体型回落匀称并告警', () => {
  const t = bodyTransform({ height: 175, body: 'gigantic' })
  assert.equal(t.body, 'standard')
  assert.ok(t.warnings.some((w) => w.includes('gigantic')))
})

ok('身高四舍五入到整数厘米', () => {
  assert.equal(bodyTransform({ height: 181.6, body: 'standard' }).height, 182)
})

ok('null / undefined / 非对象一律返回基准身材且不抛', () => {
  for (const input of [null, undefined, 0, '', 'x', [], true]) {
    const t = bodyTransform(input)
    assert.deepEqual(t.scale, [1, 1, 1])
    assert.equal(t.defaulted, true)
    assert.equal(t.warnings.length, 0)
  }
})

ok('空对象等同基准身材', () => {
  const t = bodyTransform({})
  assert.deepEqual(t.scale, [1, 1, 1])
  assert.equal(t.warnings.length, 0)
})

ok('normalizeProfile 不因缺字段告警', () => {
  const n = normalizeProfile({})
  assert.equal(n.height, DEFAULT_HEIGHT)
  assert.equal(n.body, DEFAULT_BODY)
  assert.equal(n.adjusted, false)
  assert.deepEqual(n.warnings, [])
})

ok('normalizeProfile 对合法输入标记 adjusted=false', () => {
  const n = normalizeProfile({ height: 180, body: 'athletic' })
  assert.equal(n.adjusted, false)
  assert.deepEqual(n.warnings, [])
})

ok('确定性：同样输入两次深相等', () => {
  const a = bodyTransform({ height: 168, body: 'slim' })
  const b = bodyTransform({ height: 168, body: 'slim' })
  assert.deepEqual(a, b)
})

ok('不修改入参', () => {
  const input = { height: 190, body: 'plump' }
  const snapshot = JSON.stringify(input)
  bodyTransform(input)
  describeBodyProfile(input)
  assert.equal(JSON.stringify(input), snapshot)
})

ok('scale 永远是可用的三元组', () => {
  const cases = [null, {}, { height: 999 }, { body: 'nope' }, { height: 'x', body: 7 }]
  for (const input of cases) {
    const { scale } = bodyTransform(input)
    assert.equal(scale.length, 3)
    for (const value of scale) assert.ok(Number.isFinite(value) && value > 0)
  }
})

ok('describeBodyProfile 输出「身高cm · 体型」', () => {
  assert.equal(describeBodyProfile({ height: 175, body: 'standard' }), '175cm · 匀称')
  assert.equal(describeBodyProfile({ height: 188, body: 'athletic' }), '188cm · 健壮 / 肩宽')
  assert.equal(describeBodyProfile(null), '175cm · 匀称')
})

ok('cameraTargetFor 随身高抬高注视点', () => {
  const base = cameraTargetFor(bodyTransform({ height: 175, body: 'standard' }))
  assert.deepEqual(base, [0, 0.95, 0])
  const tall = cameraTargetFor(bodyTransform({ height: 205, body: 'standard' }))
  assert.ok(tall[1] > base[1])
  assert.equal(tall[0], 0)
  assert.equal(tall[2], 0)
})

ok('cameraTargetFor 对坏输入退回基准高度', () => {
  assert.deepEqual(cameraTargetFor(null), [0, 0.95, 0])
  assert.deepEqual(cameraTargetFor({ y: 'x' }), [0, 0.95, 0])
  assert.deepEqual(cameraTargetFor({ y: 2 }, 1), [0, 2, 0])
})

ok('极限身材的倍数仍在合理区间（不会把模特拉成怪物）', () => {
  const extremes = [
    { height: HEIGHT_MIN, body: 'slim' },
    { height: HEIGHT_MAX, body: 'plump' },
  ]
  for (const input of extremes) {
    const t = bodyTransform(input)
    assert.ok(t.y >= 0.85 && t.y <= 1.18)
    assert.ok(t.width >= 0.9 && t.width <= 1.2)
    assert.ok(t.depth >= 0.9 && t.depth <= 1.2)
  }
})

console.log('\nbodyProfile: 全部通过（' + passed + ' 项）')
