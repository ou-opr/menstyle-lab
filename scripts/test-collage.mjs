// 多套对比 + 二维拼贴 的断言（PHASE3-CONTRACT §2）。
// 这一层的价值全在「数字对不对」：六项指标怎么定义最优、拼贴几何公式、
// 缺件与已有占比在「没有衣橱」时是否诚实——这些都能在这里钉死，
// 渲染则由浏览器验收负责。
import assert from 'node:assert/strict'
import {
  COLLAGE_PRESETS,
  MAX_COMPARE,
  MIN_COMPARE,
  SLOT_LABELS,
  SLOT_ORDER,
  collageLayout,
  compareOutfits,
  flatLay,
} from '../src/data/collage.js'

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log('  ok ' + label)
}

// 三套可预期的造型：正式、街头、居家。
const FORMAL = { top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-n', shoes: 's-derby-b', accs: ['a-watch'] }
const STREET = { top: 't-hoodie-b', outer: 'o-bomber-b', bottom: 'b-cargo-o', shoes: 's-runner', accs: ['a-cap', 'a-bag'] }
const HOME = { top: 't-white', outer: 'o-none', bottom: 'b-joggers-g', shoes: 's-slipper', accs: [] }

const WARDROBE = {
  items: [
    { id: 't-white', status: 'owned' },
    { id: 't-hoodie-b', status: 'owned' },
    { id: 'b-joggers-g', status: 'wishlist' },
    { id: 'a-watch', status: 'owned' },
  ],
}

const fixedScore = (map) => (outfit) => map[outfit.top] ?? null

console.log('collage:')

ok('常量与契约一致', () => {
  assert.equal(MAX_COMPARE, 4)
  assert.equal(MIN_COMPARE, 2)
  assert.deepEqual(COLLAGE_PRESETS, ['auto', 'single', 'duo', 'trio', 'quad'])
  assert.deepEqual(SLOT_ORDER, ['outer', 'top', 'bottom', 'shoes', 'accs'])
  assert.equal(SLOT_LABELS.top, '上装')
  assert.equal(SLOT_LABELS.accs, '配饰')
})

ok('非数组输入返回 ok:false 而不抛异常', () => {
  for (const input of [null, undefined, 'x', 7, {}, true]) {
    const result = compareOutfits(input)
    assert.equal(result.ok, false)
    assert.equal(typeof result.error, 'string')
    assert.deepEqual(result.looks, [])
  }
})

ok('少于两套时返回 ok:false（不是异常）', () => {
  assert.equal(compareOutfits([]).ok, false)
  assert.equal(compareOutfits([FORMAL]).ok, false)
  assert.ok(compareOutfits([FORMAL]).error.includes('2'))
})

ok('超过四套截断并记 warning', () => {
  const five = [FORMAL, STREET, HOME, FORMAL, STREET]
  const result = compareOutfits(five, { scoreOf: () => 80 })
  assert.equal(result.ok, true)
  assert.equal(result.looks.length, MAX_COMPARE)
  assert.equal(result.warnings.length, 1)
  assert.ok(result.warnings[0].includes('4'))
})

ok('六项指标的键与顺序固定', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 80 })
  assert.deepEqual(result.metrics.map((m) => m.key), ['score', 'warmth', 'formality', 'ownedRatio', 'missingCount', 'colorCount'])
  assert.deepEqual(result.metrics.map((m) => m.label), ['综合评分', '保暖总和', '正式度', '衣橱已有', '缺件', '配色数'])
})

ok('六项指标的方向正确（配色与缺件越少越好）', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 80 })
  const directions = Object.fromEntries(result.metrics.map((m) => [m.key, m.direction]))
  assert.equal(directions.score, 'higher')
  assert.equal(directions.warmth, 'higher')
  assert.equal(directions.ownedRatio, 'higher')
  assert.equal(directions.missingCount, 'lower')
  assert.equal(directions.colorCount, 'lower')
})

ok('每项指标的值个数等于套数，且有 display 文案', () => {
  const result = compareOutfits([FORMAL, STREET, HOME], { scoreOf: () => 80 })
  result.metrics.forEach((metric) => {
    assert.equal(metric.values.length, 3)
    metric.values.forEach((value, index) => {
      assert.equal(value.lookIndex, index)
      assert.equal(typeof value.display, 'string')
      assert.ok(value.display.length > 0)
    })
  })
})

ok('评分最优被标记，其余不是', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: fixedScore({ 't-shirt-w': 92, 't-hoodie-b': 71 }) })
  assert.equal(result.looks[0].score, 92)
  assert.equal(result.looks[1].score, 71)
  assert.equal(result.metrics[0].values[0].best, true)
  assert.equal(result.metrics[0].values[1].best, false)
  assert.equal(result.best.score, 0)
  assert.equal(result.bestOverall, 0)
  assert.equal(result.metrics[0].values[0].display, '92 分')
})

ok('评分并列时两套都算最优', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 88 })
  assert.equal(result.metrics[0].values[0].best, true)
  assert.equal(result.metrics[0].values[1].best, true)
})

ok('全部评分为 null 时 best 里没有 score，也不抛', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => null })
  assert.equal(result.ok, true)
  assert.equal(result.looks[0].score, null)
  assert.equal(result.best.score, undefined)
  assert.equal(result.bestOverall, null)
  assert.equal(result.metrics[0].values[0].display, '—')
  assert.equal(result.metrics[0].values[0].best, false)
})

ok('多维评分对象与纯数字都能吃进 scoreOf', () => {
  const byObject = compareOutfits([FORMAL, STREET], { scoreOf: () => ({ total: 77 }) })
  assert.equal(byObject.looks[0].score, 77)
  const byNumber = compareOutfits([FORMAL, STREET], { scoreOf: () => 66 })
  assert.equal(byNumber.looks[1].score, 66)
})

ok('综合最好在评分并列时偏向衣橱已有占比更高的那套', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 90, wardrobe: WARDROBE })
  // FORMAL 里有 t-shirt-w 与 a-watch 两件已有；STREET 有 t-hoodie-b 一件。
  assert.ok(result.looks[0].ownedRatio > result.looks[1].ownedRatio)
  assert.equal(result.bestOverall, 0)
})

ok('没有衣橱数据时 ownedRatio 为 null、缺件无从比较', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 80 })
  assert.equal(result.looks[0].ownedRatio, null)
  assert.equal(result.looks[0].ownedCount, 0)
  assert.equal(result.best.missingCount, undefined)
  assert.equal(result.metrics[3].values[0].display, '—')
})

ok('有衣橱数据时已有占比与缺件数正确', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  // FORMAL 五件：t-shirt-w(不在衣橱) o-blazer-n(不在) b-trousers-n(不在) s-derby-b(不在) a-watch(已有) → 1/5
  assert.equal(result.looks[0].ownedRatio, 1 / 5)
  assert.equal(result.looks[0].ownedCount, 1)
  assert.equal(result.looks[0].missingCount, 4)
  assert.equal(result.metrics[3].values[0].display, '20%')
  assert.equal(result.metrics[4].values[0].display, '4 件')
})

ok('useWardrobe() 的返回值与 .state 两种形状都接受', () => {
  const direct = compareOutfits([FORMAL, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  const nested = compareOutfits([FORMAL, STREET], { scoreOf: () => 80, wardrobe: { state: WARDROBE } })
  assert.deepEqual(direct.looks.map((l) => l.ownedRatio), nested.looks.map((l) => l.ownedRatio))
})

ok('wishlist 不算已有', () => {
  const result = compareOutfits([HOME, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  // HOME 三件：t-white(owned) o-none(不算) b-joggers-g(wishlist 不算) s-slipper(未知) → 1/3
  assert.equal(result.looks[0].ownedCount, 1)
  assert.ok(Math.abs(result.looks[0].ownedRatio - 1 / 3) < 1e-12)
})

ok('o-none 不计入缺件，也不出现在色带里', () => {
  const result = compareOutfits([HOME, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  assert.equal(result.looks[0].missing.some((entry) => entry.slot === 'outer'), false)
  assert.equal(result.looks[0].palette.some((entry) => entry.slot === 'outer'), false)
})

ok('未知 id 记为缺件而不是抛异常', () => {
  const result = compareOutfits([HOME, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  assert.ok(result.looks[0].missing.some((entry) => entry.id === 's-slipper'))
})

ok('保暖与正式度按目录真实字段求和 / 取均值', () => {
  const result = compareOutfits([FORMAL, STREET], { scoreOf: () => 80 })
  result.looks.forEach((look) => {
    assert.ok(Number.isFinite(look.warmth) && look.warmth > 0)
    assert.ok(look.formality > 0 && look.formality <= 3)
  })
  const [formal, street] = result.looks
  assert.ok(formal.formality > street.formality)
})

ok('色带去重且记录首个来源槽位', () => {
  const result = compareOutfits([STREET, FORMAL], { scoreOf: () => 80 })
  const hexes = result.looks[0].palette.map((entry) => entry.hex)
  assert.equal(new Set(hexes).size, hexes.length)
  assert.ok(result.looks[0].palette.every((entry) => SLOT_ORDER.includes(entry.slot)))
  assert.equal(result.looks[0].colorCount, hexes.length)
})

ok('标题优先用造型自带名称，否则回落到序号', () => {
  const named = compareOutfits([{ name: '通勤日', outfit: FORMAL }, STREET], { scoreOf: () => 80 })
  assert.equal(named.looks[0].title, '通勤日')
  assert.equal(named.looks[1].title, '造型 2')
})

ok('收藏条的 {name, ts, outfit} 形状能直接喂进来', () => {
  const saved = [{ id: 'l1', name: '年会', ts: 1, outfit: FORMAL }, { id: 'l2', name: '周末', ts: 2, outfit: STREET }]
  const result = compareOutfits(saved, { scoreOf: () => 80 })
  assert.equal(result.ok, true)
  assert.equal(result.looks[0].outfit.top, FORMAL.top)
  assert.equal(result.looks[1].title, '周末')
})

ok('坏套数（null 元素）不抛异常', () => {
  const result = compareOutfits([null, FORMAL], { scoreOf: () => 80 })
  assert.equal(result.ok, true)
  assert.equal(result.looks[0].score, 80 === null ? null : result.looks[0].score)
  assert.ok(Array.isArray(result.looks[0].palette))
})

ok('不修改入参', () => {
  const input = [JSON.parse(JSON.stringify(FORMAL)), JSON.parse(JSON.stringify(STREET))]
  const snapshot = JSON.stringify(input)
  compareOutfits(input, { scoreOf: () => 80, wardrobe: WARDROBE })
  assert.equal(JSON.stringify(input), snapshot)
})

ok('确定性：同样输入两次深相等', () => {
  const a = compareOutfits([FORMAL, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  const b = compareOutfits([FORMAL, STREET], { scoreOf: () => 80, wardrobe: WARDROBE })
  assert.deepEqual(a, b)
})

ok('flatLay 的格子按 SLOT_ORDER 排列', () => {
  const result = flatLay(STREET)
  assert.equal(result.ok, true)
  assert.deepEqual(result.cells.map((cell) => cell.slot), ['outer', 'top', 'bottom', 'shoes', 'accs', 'accs'])
  assert.deepEqual(result.cells.map((cell) => cell.order), [0, 1, 2, 3, 4, 5])
})

ok('flatLay 每个配饰各占一格', () => {
  assert.equal(flatLay(STREET).cells.filter((cell) => cell.slot === 'accs').length, 2)
  assert.equal(flatLay(FORMAL).cells.filter((cell) => cell.slot === 'accs').length, 1)
})

ok('flatLay 缺项占位而不是消失', () => {
  const result = flatLay(HOME)
  const outer = result.cells.find((cell) => cell.slot === 'outer')
  assert.equal(outer.item, null)
  assert.equal(outer.placeholder, true)
  const accs = result.cells.find((cell) => cell.slot === 'accs')
  assert.equal(accs.placeholder, true)
  assert.equal(result.cells.length, 5)
})

ok('flatLay 的 shape 由槽位推导', () => {
  const shapes = Object.fromEntries(flatLay(STREET).cells.map((cell) => [cell.slot, cell.shape]))
  assert.equal(shapes.top, 'torso')
  assert.equal(shapes.outer, 'outer')
  assert.equal(shapes.bottom, 'legs')
  assert.equal(shapes.shoes, 'shoe')
  assert.equal(shapes.accs, 'accessory')
})

ok('flatLay 单品字段齐备', () => {
  const top = flatLay(STREET).cells.find((cell) => cell.slot === 'top').item
  assert.equal(top.id, 't-hoodie-b')
  assert.equal(typeof top.name, 'string')
  assert.equal(typeof top.hex, 'string')
  assert.equal(typeof top.family, 'string')
  assert.equal(typeof top.mesh, 'string')
})

ok('flatLay 未知 id 画空位并记 warning，o-none 不记', () => {
  const unknown = flatLay(HOME)
  assert.ok(unknown.warnings.some((w) => w.includes('s-slipper')))
  assert.equal(unknown.warnings.some((w) => w.includes('o-none')), false)
})

ok('flatLay 配色份额之和为 1，且按出现次数降序', () => {
  const result = flatLay(STREET)
  const sum = result.palette.reduce((total, entry) => total + entry.share, 0)
  assert.ok(Math.abs(sum - 1) < 1e-12)
  for (let i = 1; i < result.palette.length; i += 1) {
    assert.ok(result.palette[i - 1].count >= result.palette[i].count)
  }
  assert.equal(result.colorCount, result.palette.length)
})

ok('flatLay 非对象输入返回 ok:false', () => {
  for (const input of [null, undefined, 'x', 3, []]) {
    const result = flatLay(input)
    assert.equal(result.ok, false)
    assert.deepEqual(result.cells, [])
    assert.equal(result.colorCount, 0)
  }
})

ok('collageLayout 两种预设的行列与宽高公式', () => {
  const two = collageLayout({ looks: [FORMAL, STREET] })
  assert.equal(two.ok, true)
  assert.equal(two.cols, 2)
  assert.equal(two.rows, 1)
  assert.equal(two.width, 24 * 2 + 2 * 260 + 1 * 16)
  assert.equal(two.height, 24 * 2 + 1 * 320)

  const three = collageLayout({ looks: [FORMAL, STREET, HOME] })
  assert.equal(three.cols, 3)
  assert.equal(three.rows, 1)
  assert.equal(three.width, 24 * 2 + 3 * 260 + 2 * 16)

  const four = collageLayout({ looks: [FORMAL, STREET, HOME, FORMAL] })
  assert.equal(four.cols, 2)
  assert.equal(four.rows, 2)
  assert.equal(four.height, 24 * 2 + 2 * 320 + 1 * 16)
})

ok('collageLayout 强制预设能覆盖自动布局', () => {
  const single = collageLayout({ looks: [FORMAL], preset: 'single' })
  assert.equal(single.cols, 1)
  assert.equal(single.rows, 1)
  const quad = collageLayout({ looks: [FORMAL, STREET, HOME, FORMAL], preset: 'quad' })
  assert.equal(quad.cols, 2)
  const unknown = collageLayout({ looks: [FORMAL, STREET], preset: 'nope' })
  assert.equal(unknown.cols, 2)
})

ok('collageLayout 每格坐标落在画布内且左上角从内边距开始', () => {
  const layout = collageLayout({ looks: [FORMAL, STREET, HOME, FORMAL] })
  assert.equal(layout.cells[0].x, 24)
  assert.equal(layout.cells[0].y, 24)
  layout.cells.forEach((cell) => {
    assert.ok(cell.x >= layout.padding)
    assert.ok(cell.y >= layout.padding)
    assert.ok(cell.x + cell.width <= layout.width)
    assert.ok(cell.y + cell.height <= layout.height)
    assert.equal(cell.flatLay.ok, true)
  })
  assert.equal(layout.cells[3].x, 24 + 260 + 16)
  assert.equal(layout.cells[3].y, 24 + 320 + 16)
})

ok('collageLayout 单元格尺寸与间距可定制', () => {
  const layout = collageLayout({ looks: [FORMAL, STREET], cell: { width: 100, height: 120 }, gap: 0, padding: 4 })
  assert.deepEqual(layout.cell, { width: 100, height: 120 })
  assert.equal(layout.width, 4 * 2 + 2 * 100)
  assert.equal(layout.height, 4 * 2 + 120)
  assert.equal(layout.cells[1].x, 104)
})

ok('collageLayout 坏参数回落默认值而不是 NaN', () => {
  const layout = collageLayout({ looks: [FORMAL, STREET], cell: { width: -5, height: 'x' }, gap: -3, padding: NaN })
  assert.equal(layout.cell.width, 260)
  assert.equal(layout.cell.height, 320)
  assert.equal(layout.gap, 16)
  assert.equal(layout.padding, 24)
  assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height))
})

ok('collageLayout 空造型列表返回 ok:false', () => {
  for (const input of [undefined, null, {}, { looks: [] }, { looks: 'x' }]) {
    const result = collageLayout(input)
    assert.equal(result.ok, false)
    assert.equal(result.cells, undefined || result.cells)
    assert.equal(result.width, 0)
  }
})

ok('collageLayout 超过四套截断并记 warning', () => {
  const result = collageLayout({ looks: [FORMAL, STREET, HOME, FORMAL, STREET] })
  assert.equal(result.cells.length, MAX_COMPARE)
  assert.equal(result.warnings.length, 1)
})

ok('collageLayout 标题与评分来自入参', () => {
  const result = collageLayout({ looks: [{ name: '年会', outfit: FORMAL, score: 93 }, STREET] })
  assert.equal(result.cells[0].title, '年会')
  assert.equal(result.cells[0].score, 93)
  assert.equal(result.cells[1].title, '造型 2')
  assert.equal(result.cells[1].score, null)
})

ok('collageLayout 确定性且不修改入参', () => {
  const looks = [{ name: 'A', outfit: JSON.parse(JSON.stringify(FORMAL)) }, { name: 'B', outfit: JSON.parse(JSON.stringify(STREET)) }]
  const snapshot = JSON.stringify(looks)
  const first = collageLayout({ looks })
  const second = collageLayout({ looks })
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(looks), snapshot)
})

console.log('\ncollage: 全部通过（' + passed + ' 项）')
