import assert from 'node:assert/strict'
import { getAdvice } from '../src/data/advice.js'
import { recommendOutfits } from '../src/data/recommendations.js'

const state = (overrides = {}) => ({
  top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [], ...overrides,
})

const derbyShorts = getAdvice(state({ bottom: 'b-shorts-b', shoes: 's-derby' }))
assert(derbyShorts.warnings.some((item) => item.includes('皮鞋配短裤')), '皮鞋×短裤应触发明确雷区')

const runnerSuit = getAdvice(state({ top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-g', shoes: 's-runner' }))
assert(runnerSuit.warnings.some((item) => item.includes('跑鞋与正装')), '跑鞋×正装应触发雷区')

const tooManyAccs = getAdvice(state({ accs: ['a-watch', 'a-cap', 'a-bag'] }))
assert(tooManyAccs.warnings.some((item) => item.includes('3 件配饰')), '三件及以上配饰应给出克制提醒')

const shirt = getAdvice(state({ top: 't-shirt-b' }))
assert(shirt.tips.some((item) => item.includes('塞衣角')), '衬衫应包含塞衣角提示')

const sameFamily = getAdvice(state({ bottom: 'b-jeans-b', shoes: 's-derby' }))
assert(sameFamily.tips.some((item) => item.includes('鞋裤同色系')), '同色系鞋裤应识别显高加成')

for (const profile of [
  { height: 165, body: 'plump', season: 'summer', occasion: 'work' },
  { height: 175, body: 'standard', season: 'autumn', occasion: 'casual' },
  { height: 185, body: 'slim', season: 'winter', occasion: 'date' },
]) {
  const results = recommendOutfits(profile)
  assert.equal(results.length, 3, '推荐必须稳定返回三套')
  assert(results.every((item, index) => index === 0 || results[index - 1].score >= item.score), '推荐应按评分降序')
  assert(results.every((item) => item.reasons.length >= 4), '推荐理由必须覆盖季节、场景、体型和身高')
  assert(results.every((item) => item.sourceIds.length >= 2), '每套推荐必须有多个来源')
}

console.log('✓ 建议引擎语义断言全部通过')
