// 色彩实验室纯函数层的断言。
// 这张测试网要守住四件事：
//   1. 色空间换算与命名不能漂（用户看到的主色名、对比度都从这里来）；
//   2. 取色器在「色块清晰的图」上不造伪色（中位切分的老问题）；
//   3. 配色诊断的族数/三色原则/呼应关系必须能从颜色本身推导出来；
//   4. 生成器给出的每一套都能被 3D 试衣间直接消费：id 存在、无硬冲突、确定性。
import assert from 'node:assert/strict'
import {
  CLOSE_DELTA_E,
  MAX_PALETTE_SIZE,
  MATCH_LIMIT,
  PALETTE_SIZE,
  analyzePalette,
  buildPaletteOutfits,
  colorName,
  contrastRatio,
  deltaE,
  hexToLab,
  hexToRgb,
  matchPalette,
  normalizeHex,
  outfitPalette,
  quantizeColors,
  rgbToHex,
  rgbToHsl,
  rgbToLab,
} from '../src/data/colorLab.js'
import { ITEMS, byId } from '../src/data/catalog.js'
import { detectConflicts } from '../src/data/conflicts.js'

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log('  ok ' + label)
}

const near = (a, b, tolerance, message) => {
  assert.ok(Math.abs(a - b) <= tolerance, `${message || ''} 期望 ${b}±${tolerance}，实际 ${a}`)
}

// 生成 RGBA 像素：add(r,g,b,count)
const pixelsOf = (specs) => {
  const data = []
  for (const [r, g, b, count] of specs) {
    for (let i = 0; i < count; i += 1) data.push(r, g, b, 255)
  }
  return new Uint8ClampedArray(data)
}

console.log('colorlab:')

ok('常量与契约一致', () => {
  assert.equal(PALETTE_SIZE, 5)
  assert.equal(MAX_PALETTE_SIZE, 8)
  assert.equal(MATCH_LIMIT, 4)
  assert.equal(CLOSE_DELTA_E, 10)
})

ok('normalizeHex：3 位补全、大小写归一、支持 8 位', () => {
  assert.equal(normalizeHex('#abc'), '#aabbcc')
  assert.equal(normalizeHex('ABC'), '#aabbcc')
  assert.equal(normalizeHex('#AABBCC'), '#aabbcc')
  assert.equal(normalizeHex(' #fff '), '#ffffff')
  assert.equal(normalizeHex('#112233ff'), '#112233')
  assert.equal(normalizeHex('#11223300'), null, '全透明应视为无效色')
  assert.equal(normalizeHex('#12345'), null)
  assert.equal(normalizeHex('rgb(0,0,0)'), null)
  assert.equal(normalizeHex(null), null)
  assert.equal(normalizeHex(123), null)
})

ok('hexToRgb / rgbToHex 往返，并做边界钳制', () => {
  assert.deepEqual(hexToRgb('#f1efe8'), { r: 241, g: 239, b: 232 })
  assert.deepEqual(hexToRgb('#abc'), { r: 170, g: 187, b: 204 })
  assert.equal(hexToRgb('nope'), null)
  assert.equal(rgbToHex({ r: 241, g: 239, b: 232 }), '#f1efe8')
  assert.equal(rgbToHex({ r: 300, g: -20, b: 12.6 }), '#ff000d')
  assert.equal(rgbToHex({ r: NaN, g: 0, b: 0 }), null)
  assert.equal(rgbToHex(null), null)
})

ok('rgbToHsl：红/绿/灰/黑的已知值', () => {
  const red = rgbToHsl({ r: 255, g: 0, b: 0 })
  near(red.h, 0, 1e-9, '红')
  near(red.s, 1, 1e-9, '红')
  near(red.l, 0.5, 1e-9, '红')
  near(rgbToHsl({ r: 0, g: 255, b: 0 }).h, 120, 1e-9, '绿')
  near(rgbToHsl({ r: 0, g: 0, b: 255 }).h, 240, 1e-9, '蓝')
  const gray = rgbToHsl({ r: 128, g: 128, b: 128 })
  assert.equal(gray.s, 0)
  near(gray.l, 0.502, 0.002, '灰')
  assert.equal(rgbToHsl(null), null)
})

ok('rgbToLab：白 L≈100、黑 L≈0、中性色 a/b≈0', () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255 })
  near(white.l, 100, 0.01, '白')
  near(white.a, 0, 0.05, '白')
  near(white.b, 0, 0.05, '白')
  const black = rgbToLab({ r: 0, g: 0, b: 0 })
  near(black.l, 0, 1e-6, '黑')
  const gray = rgbToLab({ r: 128, g: 128, b: 128 })
  near(gray.a, 0, 0.01, '灰')
  near(gray.b, 0, 0.01, '灰')
  assert.equal(hexToLab('nope'), null)
})

ok('deltaE：同色为 0、黑白为 100、对称', () => {
  assert.equal(deltaE('#3d4d66', '#3d4d66'), 0)
  near(deltaE('#000000', '#ffffff'), 100, 0.05, '黑白')
  near(deltaE('#f1efe8', '#3d4d66'), deltaE('#3d4d66', '#f1efe8'), 1e-9, '对称')
  assert.equal(deltaE('#zzz', '#fff'), null)
})

ok('contrastRatio：黑白 21:1、同色 1:1、参数非法返回 null', () => {
  near(contrastRatio('#000000', '#ffffff'), 21, 0.01, '黑白')
  near(contrastRatio('#3d4d66', '#3d4d66'), 1, 1e-9, '同色')
  near(contrastRatio('#ffffff', '#000000'), 21, 0.01, '交换顺序')
  assert.equal(contrastRatio('not-a-color', '#fff'), null)
})

ok('colorName：常见颜色用中文名对上', () => {
  assert.equal(colorName('#000000'), '黑')
  assert.equal(colorName('#ffffff'), '白')
  assert.equal(colorName('#f1efe8'), '米白')
  assert.equal(colorName('#3d4d66'), '深蓝')
  assert.equal(colorName('#5d6647'), '军绿')
  assert.equal(colorName('#c9ccd1'), '浅灰')
  assert.equal(colorName('#7a3b40'), '红')
  assert.equal(colorName('nope'), '未知色')
})

ok('quantizeColors：三色块图稳定返回三色，份额正确', () => {
  const pixels = pixelsOf([
    [255, 0, 0, 4],
    [0, 128, 0, 4],
    [0, 0, 255, 2],
  ])
  const result = quantizeColors(pixels, 5)
  assert.equal(result.length, 3, '不应造出红绿混合的伪色')
  assert.deepEqual(result.map((c) => c.hex), ['#008000', '#ff0000', '#0000ff'])
  near(result[0].share, 0.4, 1e-9, '绿')
  near(result[1].share, 0.4, 1e-9, '红')
  near(result[2].share, 0.2, 1e-9, '蓝')
  near(result.reduce((sum, c) => sum + c.share, 0), 1, 1e-9, '份额合计')
})

ok('quantizeColors：忽略透明像素，并按 count 截断', () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 10,
    9, 9, 9, 0,
  ])
  const result = quantizeColors(data, 2)
  assert.equal(result.length, 2)
  assert.deepEqual(result.map((c) => c.hex).sort(), ['#00ff00', '#ff0000'])
  assert.ok(result.every((c) => c.hex !== '#0000ff'), '全透明像素不参与取色')
})

ok('quantizeColors：相近色合并，不把同一色拆成多份', () => {
  const pixels = pixelsOf([
    [200, 30, 30, 6],
    [201, 31, 31, 4],
  ])
  const result = quantizeColors(pixels, 5)
  assert.equal(result.length, 1)
  assert.equal(result[0].share, 1)
  assert.equal(quantizeColors([], 5).length, 0)
  assert.equal(quantizeColors(null, 5).length, 0)
  assert.equal(quantizeColors(new Uint8ClampedArray(3), 5).length, 0)
})

ok('quantizeColors：接受 ImageData 形状，纯单色只返回一色', () => {
  const result = quantizeColors({ data: pixelsOf([[18, 52, 86, 20]]) }, 8)
  assert.deepEqual(result, [{ hex: '#123456', share: 1 }])
})

ok('quantizeColors：同一输入两次结果完全一致', () => {
  const pixels = pixelsOf([
    [12, 34, 56, 20],
    [200, 10, 30, 15],
    [240, 240, 230, 30],
    [30, 90, 60, 12],
  ])
  assert.deepEqual(quantizeColors(pixels, 4), quantizeColors(pixels, 4))
})

ok('outfitPalette：解析单品颜色、跳过 o-none、按面积给出份额', () => {
  const palette = outfitPalette({
    top: 't-white',
    outer: 'o-none',
    bottom: 'b-jeans-d',
    shoes: 's-white',
    accs: ['a-watch'],
  })
  assert.equal(palette.length, 4)
  assert.ok(!palette.some((row) => row.hex === '#000000'))
  const top = palette.find((row) => row.slot === 'top')
  assert.deepEqual(top.slots, ['top'])
  assert.equal(top.labels[0], '白色短袖T恤')
  near(top.share, 0.32 / 0.78, 1e-9, '上装份额')
  const bottom = palette.find((row) => row.slot === 'bottom')
  assert.equal(bottom.hex, '#3d4d66')
  assert.deepEqual(palette.map((row) => row.slot).sort(), ['accs', 'bottom', 'shoes', 'top'])
  assert.equal(outfitPalette({}).length, 0)
  assert.equal(outfitPalette(null).length, 0)
})

ok('outfitPalette：完全同色的两件合并成一行并保留两个槽位', () => {
  const palette = outfitPalette({ top: 't-white', accs: ['t-white'] })
  assert.equal(palette.length, 1)
  assert.deepEqual(palette[0].slots, ['top', 'accs'])
  assert.deepEqual(palette[0].labels, ['白色短袖T恤'], '同名单品只保留一个标签')
  near(palette[0].share, 1, 1e-9)
})

ok('outfitPalette：无效 id 与空配饰不产生空行', () => {
  const palette = outfitPalette({ top: 'not-exist', bottom: 'b-jeans-d', accs: ['nope', null, 7] })
  assert.equal(palette.length, 1)
  near(palette[0].share, 1, 1e-9, '仅剩下装时应归一为 1')
})

ok('analyzePalette：空输入返回 ok:false 而不是抛异常', () => {
  for (const input of [null, undefined, [], 'x', 7, {}, [{ hex: 'not-a-color' }]]) {
    const result = analyzePalette(input)
    assert.equal(result.ok, false)
    assert.equal(result.colors.length, 0)
    assert.equal(result.families, 0)
  }
})

ok('analyzePalette：无彩色→中性色，1 族且符合三色原则', () => {
  const result = analyzePalette([
    { hex: '#f1efe8', share: 0.6 },
    { hex: '#20211f', share: 0.25 },
    { hex: '#c9ccd1', share: 0.15 },
  ])
  assert.equal(result.harmony.key, 'neutral')
  assert.equal(result.families, 1)
  assert.equal(result.threeColorOk, true)
  assert.equal(result.dominant.hex, '#f1efe8')
  near(result.neutralShare, 1, 1e-9)
  assert.ok(result.laws.includes('01'))
})

ok('analyzePalette：白/蓝/银=中性打底，不误判成多色', () => {
  const palette = outfitPalette({
    top: 't-white',
    outer: 'o-none',
    bottom: 'b-jeans-d',
    shoes: 's-white',
    accs: ['a-watch'],
  })
  const result = analyzePalette(palette)
  assert.equal(result.ok, true)
  assert.equal(result.families, 2, '中性色 + 藏青，共两族')
  assert.equal(result.harmony.key, 'accent')
  assert.equal(result.threeColorOk, true)
  assert.equal(result.echo, true, '白 T 与小白鞋应判定为呼应')
  assert.ok(result.laws.includes('16'))
  assert.ok(result.contrast.ratio > 4.5)
})

ok('analyzePalette：蓝+橙=对比色，两族', () => {
  const result = analyzePalette([
    { hex: '#2f5f9f', share: 0.6 },
    { hex: '#c87137', share: 0.4 },
  ])
  assert.equal(result.harmony.key, 'complementary')
  assert.equal(result.families, 2)
  assert.ok(result.summary.includes('对比色'))
})

ok('analyzePalette：四个彩族触发三色原则告警', () => {
  const result = analyzePalette([
    { hex: '#c43b3b', share: 0.25 },
    { hex: '#3b7dc4', share: 0.25 },
    { hex: '#3ba55c', share: 0.25 },
    { hex: '#c4a33b', share: 0.25 },
  ])
  assert.equal(result.families, 4)
  assert.equal(result.threeColorOk, false)
  assert.equal(result.harmony.key, 'varied')
  assert.ok(result.advice.includes('减色'))
})

ok('analyzePalette：缺省份额时按均分处理，份额归一', () => {
  const result = analyzePalette([{ hex: '#3d4d66' }, { hex: '#f1efe8' }])
  assert.equal(result.ok, true)
  near(result.colors.reduce((sum, row) => sum + row.share, 0), 1, 1e-9)
  near(result.dominant.share, 0.5, 1e-9)
})

ok('matchPalette：按色差升序、数量受限、close 标记一致', () => {
  const matches = matchPalette([{ hex: '#2f3a4d', share: 1 }], { limit: 3 })
  assert.equal(matches.length, 1)
  const row = matches[0]
  assert.equal(row.name, '深蓝')
  assert.equal(row.matches.length, 3)
  assert.ok(row.matches.every((m, i, list) => i === 0 || list[i - 1].deltaE <= m.deltaE))
  assert.equal(row.matches[0].id, 't-knit-n', '藏青针织衫应与输入色完全一致')
  assert.equal(row.matches[0].deltaE, 0)
  assert.ok(row.matches.every((m) => m.close === (m.deltaE <= CLOSE_DELTA_E)))
  assert.ok(row.matches.every((m) => ITEMS.some((item) => item.id === m.id)))
  assert.ok(row.matches.every((m) => m.categoryLabel.length > 0))
  assert.equal(matchPalette([], { limit: 3 }).length, 0)
})

ok('matchPalette：limit 缺省为 MATCH_LIMIT，且不会越过目录大小', () => {
  const defaults = matchPalette([{ hex: '#f1efe8' }])
  assert.equal(defaults[0].matches.length, MATCH_LIMIT)
  const huge = matchPalette([{ hex: '#f1efe8' }], { limit: 9999 })
  assert.ok(huge[0].matches.length <= ITEMS.length)
})

ok('buildPaletteOutfits：空输入返回空数组', () => {
  assert.deepEqual(buildPaletteOutfits([]), [])
  assert.deepEqual(buildPaletteOutfits(null), [])
})

ok('buildPaletteOutfits：每套都是合法、无冲突、可试穿的造型', () => {
  const palette = outfitPalette({
    top: 't-white',
    outer: 'o-none',
    bottom: 'b-jeans-d',
    shoes: 's-white',
    accs: ['a-watch'],
  })
  const outfits = buildPaletteOutfits(palette)
  assert.ok(outfits.length >= 1 && outfits.length <= 3)
  for (const entry of outfits) {
    const { top, outer, bottom, shoes, accs } = entry.outfit
    for (const id of [top, outer, bottom, shoes, ...accs]) {
      assert.ok(byId(ITEMS, id), `造型引用了不存在的 id: ${id}`)
    }
    assert.ok(byId(ITEMS, top).mesh, '上装应带 3D 网格')
    assert.equal(detectConflicts({ ...entry.outfit, shoes }).length, 0, `不应含硬冲突: ${entry.ids}`)
    assert.ok(entry.paletteFit >= 0 && entry.paletteFit <= 100)
    assert.ok(entry.rank >= 0 && entry.rank <= 100)
    assert.ok(entry.colors.length >= 4, '造型至少给出 4 个色块')
    assert.ok(entry.colors.every((c) => normalizeHex(c.hex)))
    assert.ok(entry.dominant && entry.dominantName)
  }
})

ok('buildPaletteOutfits：确定性——同输入两次完全一致', () => {
  const palette = [{ hex: '#6a452c', share: 0.55 }, { hex: '#f1efe8', share: 0.45 }]
  const first = buildPaletteOutfits(palette, { count: 3 })
  const second = buildPaletteOutfits(palette, { count: 3 })
  assert.deepEqual(first.map((o) => o.ids), second.map((o) => o.ids))
})

ok('buildPaletteOutfits：套与套之间至少换掉两件单品', () => {
  const palette = [{ hex: '#2e3b52', share: 0.5 }, { hex: '#e8e2d6', share: 0.3 }, { hex: '#6a452c', share: 0.2 }]
  const outfits = buildPaletteOutfits(palette, { count: 3 })
  assert.ok(outfits.length >= 2)
  for (let i = 0; i < outfits.length; i += 1) {
    for (let j = i + 1; j < outfits.length; j += 1) {
      const a = new Set(outfits[i].ids.split('|'))
      const b = new Set(outfits[j].ids.split('|'))
      let diff = 0
      for (const id of a) if (!b.has(id)) diff += 1
      for (const id of b) if (!a.has(id)) diff += 1
      // 对称差记数：换一件 = 2，因此两件 = 4。
      assert.ok(diff >= 4, `方案 ${i + 1} 与 ${j + 1} 只换了 ${diff / 2} 件单品`)
    }
  }
})

ok('buildPaletteOutfits：count 被限制在 1..5', () => {
  const palette = [{ hex: '#2f3a4d', share: 1 }]
  assert.equal(buildPaletteOutfits(palette, { count: 99 }).length, 5)
  assert.ok(buildPaletteOutfits(palette, { count: 0 }).length >= 1)
  assert.ok(buildPaletteOutfits(palette, { count: -3 }).length >= 1)
})

ok('buildPaletteOutfits：配色越贴近目录，paletteFit 越高', () => {
  const exact = buildPaletteOutfits([
    { hex: '#f1efe8', share: 0.4 },
    { hex: '#3d4d66', share: 0.3 },
    { hex: '#edeae2', share: 0.3 },
  ])
  const alien = buildPaletteOutfits([
    { hex: '#00ff00', share: 0.4 },
    { hex: '#ff00ff', share: 0.3 },
    { hex: '#ffff00', share: 0.3 },
  ])
  assert.ok(exact[0].paletteFit > alien[0].paletteFit, '目录已有色应比荧光色更贴合')
})

ok('buildPaletteOutfits：scoreOf 注入会被使用（便于上层换评分口径）', () => {
  const calls = []
  const scoreOf = (outfit) => {
    calls.push(outfit)
    return { score: { total: 80 }, warnings: [] }
  }
  const outfits = buildPaletteOutfits([{ hex: '#2f3a4d', share: 1 }], { count: 2, scoreOf })
  assert.ok(calls.length > 0)
  assert.ok(outfits.every((o) => o.score === 80))
})

ok('buildPaletteOutfits：不修改入参', () => {
  const palette = [
    { hex: '#2f3a4d', share: 0.6 },
    { hex: '#e8e2d6', share: 0.4 },
  ]
  const snapshot = JSON.stringify(palette)
  buildPaletteOutfits(palette, { count: 2 })
  assert.equal(JSON.stringify(palette), snapshot)
})

console.log(`\ncolorlab: 全部通过（${passed} 项）`)
