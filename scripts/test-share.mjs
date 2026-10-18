// test-share：share.js 编解码正式测试。
// 覆盖 docs/CONTRACT.md 2.5 冻结契约：全 PRESETS 往返、URL-safe 短码、
// 非法输入一律返回 null 且零抛出、语义非法返回 null、SHARE_VERSION===1、
// outfitToText 未知单品降级。纯 Node ESM，不引入任何新依赖。
// 运行：node scripts/test-share.mjs（workdir 为 style-lab 根目录）

import {
  SHARE_VERSION,
  encodeOutfit,
  decodeOutfit,
  outfitToText,
  canEncodeOutfit,
} from '../src/data/share.js'
import { PRESETS, ACCS } from '../src/data/catalog.js'

let pass = 0
let fail = 0
const failures = []

function ok(cond, label) {
  if (cond) {
    pass += 1
  } else {
    fail += 1
    failures.push(label)
    console.error(`FAIL ${label}`)
  }
}

// 断言 decodeOutfit 不抛出且返回 null；任何抛出都会单独记为失败。
function expectNull(value, label) {
  try {
    ok(decodeOutfit(value) === null, `${label} -> null（零抛出）`)
  } catch (e) {
    fail += 1
    failures.push(`${label} 抛出异常`)
    console.error(`FAIL ${label} 抛出异常: ${e && e.message ? e.message : e}`)
  }
}

// 1. 契约版本
ok(SHARE_VERSION === 1, `SHARE_VERSION === 1（实际 ${SHARE_VERSION}）`)

// 2. 全部 PRESETS 逐套 encode→decode 往返深比较 + URL-safe + 长度 < 120
ok(PRESETS.length === 19, `PRESETS 共 19 套（实际 ${PRESETS.length}）`)
for (const preset of PRESETS) {
  const outfit = preset.outfit
  const code = encodeOutfit(outfit)
  ok(typeof code === 'string' && code.length > 0, `encode(${preset.id}) 返回非空字符串`)
  ok(/^[A-Za-z0-9_-]+$/.test(code), `encode(${preset.id}) 仅含 URL-safe 字符: ${code}`)
  ok(!/[#&=]/.test(code), `encode(${preset.id}) 不含 # & =`)
  ok(code.length < 120, `encode(${preset.id}) 长度 < 120（实际 ${code.length}）`)

  let decoded = null
  let threw = false
  try {
    decoded = decodeOutfit(code)
  } catch (e) {
    threw = true
  }
  ok(!threw, `decode(${preset.id}) 零抛出`)
  ok(JSON.stringify(decoded) === JSON.stringify(outfit), `decode(encode(${preset.id})) 深比较相等`)
}

// 3. 边界往返：0 配饰与 12 配饰（当前 ACCS 全量）
const baseOutfit = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] }
const baseCode = encodeOutfit(baseOutfit)
ok(baseCode === 'v1AQZmA', `0 配饰编码为 v1AQZmA（实际 ${baseCode}）`)
ok(JSON.stringify(decodeOutfit(baseCode)) === JSON.stringify(baseOutfit), '0 配饰往返深比较相等')
ok(decodeOutfit(`  ${baseCode}  `) !== null && JSON.stringify(decodeOutfit(`  ${baseCode}  `)) === JSON.stringify(baseOutfit), 'decode 对首尾空白做 trim')

const fullAccs = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ACCS.map((a) => a.id) }
const fullAccsCode = encodeOutfit(fullAccs)
ok(fullAccsCode.length < 120, `12 配饰编码长度 < 120（实际 ${fullAccsCode.length}）`)
ok(JSON.stringify(decodeOutfit(fullAccsCode)) === JSON.stringify(fullAccs), '12 配饰往返深比较相等')

// 配饰去重：重复 id 只保留一个
const dupAccs = encodeOutfit({ top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch', 'a-watch'] })
ok(JSON.stringify(decodeOutfit(dupAccs).accs) === JSON.stringify(['a-watch']), 'encode 对重复配饰去重')

// encode 对未知/非法 outfit 不抛异常，输出全哨兵死链
let nullEncodeThrew = false
let nullEncode = ''
try {
  nullEncode = encodeOutfit(null)
} catch (e) {
  nullEncodeThrew = true
}
ok(!nullEncodeThrew && nullEncode === 'v1____A', `encodeOutfit(null) === v1____A（实际 ${nullEncode}）`)

// 4. 非法输入：全部返回 null 且零抛出（docs/CONTRACT.md 冻结硬契约）
const base1 = encodeOutfit({ top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] })
// 基础结构非法
expectNull(null, 'null')
expectNull(undefined, 'undefined')
expectNull(123, '数字 123')
expectNull({ top: 't-white' }, '普通对象')
expectNull(['v1AQZmA'], '数组')
expectNull('', '空串')
expectNull('   ', '纯空白串')
expectNull('乱码字符串', '中文乱码串')
expectNull('v1', '仅前缀 v1')
expectNull('v1ABC', '前缀后长度不足 5')
// 版本号不符
expectNull('v2AQZmA', '版本号 v2 不符')
expectNull('v0AQZmA', '版本号 v0 不符')
expectNull('V1AQZmA', '前缀大小写不符')
// 结构损坏 / 截断 / 插入
expectNull(baseCode.slice(0, baseCode.length - 1), '截断串（去掉末位）')
expectNull(`${baseCode}A`, '末尾多一位')
expectNull(`${baseCode.slice(0, 3)}!${baseCode.slice(3)}`, '中间插入非法字符 !')
expectNull(`${baseCode} ${baseCode}`, '两条编码拼接')
// 超长
expectNull('x'.repeat(500), '超长 500 字符串')
expectNull(`v1${'A'.repeat(300)}`, '超长 v1+300A')
// 全哨兵 / 非法索引
expectNull('v1____A', '全哨兵 v1____A')
expectNull(`${baseCode.slice(0, 2)}7${baseCode.slice(3)}`, '不存在的序号（索引 59）')
expectNull(`${baseCode.slice(0, 2)}_${baseCode.slice(3)}`, '哨兵字符 _ 占位槽位')
expectNull(`${baseCode.slice(0, 6)}_`, '配饰数字符为哨兵 _')
// 5. 语义非法（结构合法但槽位分类错位）
expectNull(`${baseCode.slice(0, 3)}A${baseCode.slice(4)}`, '外套槽放上装 id（t-white）')
expectNull(`${baseCode.slice(0, 4)}B${baseCode.slice(5)}`, '下装槽放上装 id（t-black）')
expectNull(`${baseCode.slice(0, 5)}C${baseCode.slice(6)}`, '鞋履槽放上装 id（t-gray）')
expectNull(`${base1.slice(0, base1.length - 1)}A`, '配饰槽放上装 id（t-white）')

// 6. outfitToText：未知单品降级
const textUnknown = outfitToText({ top: 'u-foo' })
ok(textUnknown.includes('未知单品'), 'outfitToText 未知 top 显示「未知单品」')
ok(textUnknown.includes('上装：未知单品'), 'outfitToText 未知 top 行精确降级')
const textKnown = outfitToText({ top: 't-white' })
ok(textKnown.includes('上装：白色短袖T恤'), 'outfitToText 已知 top 显示单品名')
const textAccMix = outfitToText({ top: 't-white', accs: ['a-watch', 'u-x'] })
ok(textAccMix.includes('银色腕表') && textAccMix.includes('未知单品'), 'outfitToText 配饰混合已知/未知均正确')
ok(textAccMix.includes('配饰：银色腕表 / 未知单品'), 'outfitToText 配饰行格式正确')
const textEmpty = outfitToText(null)
ok(textEmpty.includes('上装：未知单品') && textEmpty.includes('配饰：无'), 'outfitToText(null) 槽位降级且配饰为无')

// 7. canEncodeOutfit：死链判定
ok(canEncodeOutfit(baseOutfit) === true, 'canEncodeOutfit(合法造型) === true')
ok(canEncodeOutfit({ top: 'u-x' }) === false, 'canEncodeOutfit(衣橱单品) === false')
ok(canEncodeOutfit({}) === false, 'canEncodeOutfit(空对象) === false')

// 统计与退出码
if (fail === 0) {
  console.log(`OK test-share: ${pass} 项断言通过`)
} else {
  console.error(`FAIL test-share: ${pass} 项通过 / ${fail} 项失败`)
  for (const f of failures) console.error(`  - ${f}`)
}
process.exitCode = fail === 0 ? 0 : 1
