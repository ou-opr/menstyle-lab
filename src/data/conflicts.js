// 硬冲突规则单一事实来源。
// 三处调用方共享同一套判定与措辞：
//   - src/data/advice.js getAdvice 的冲突警告
//   - src/data/capsule.js hardConflict 的两两判定（取第一条）
//   - src/data/personalRecommendations.js detectHardConflicts 的成套判定
// 判定基于「语义槽位 + mesh/formality 特征」，同时兼容系统目录单品与个人衣橱单品。
// 规则顺序即输出顺序：更具体的规则排在前面。

const formalityOf = (item) => (Number.isFinite(item?.formality) ? item.formality : null)

const isDerby = (shoes) => shoes?.mesh === 'derby'
const isShorts = (bottom) => bottom?.mesh === 'shorts'
const isPantsDenim = (bottom) => bottom?.mesh === 'pants-denim' || bottom?.id === 'b-jeans-d'
const isRunner = (shoes) => shoes?.mesh === 'runner' || shoes?.id === 's-runner'
const isBlazer = (outer) => outer?.mesh === 'blazer' || outer?.id === 'o-blazer-n'

/**
 * 检测一套穿搭的硬冲突，返回中文原因数组（可能多条，空数组代表无冲突）。
 * ctx: { top, outer, bottom, shoes }，均为已解析单品（可缺省）。
 */
export function detectConflicts(ctx = {}) {
  const { top, outer, bottom, shoes } = ctx
  const reasons = []

  if (shoes && bottom && isDerby(shoes) && isShorts(bottom)) {
    reasons.push('皮鞋配短裤是经典雷区：正装鞋需要长裤压阵，短裤请换帆布鞋或小白鞋。')
  }
  if (shoes && bottom && formalityOf(shoes) >= 3 && formalityOf(bottom) <= 1 && !isPantsDenim(bottom)) {
    reasons.push('皮鞋与休闲下装的正式度差距过大，容易头重脚轻，建议换成小白鞋或切尔西靴。')
  }
  if (shoes && isRunner(shoes) && (isBlazer(outer) || formalityOf(top) >= 3)) {
    reasons.push('跑鞋与正装混搭对功力要求极高，新手建议把跑鞋留给卫衣/工装场景。')
  }
  if (bottom && shoes && isShorts(bottom) && formalityOf(shoes) >= 2 && !isDerby(shoes)) {
    reasons.push('短裤配皮鞋/切尔西会显腿"断"一截，短裤场景请交给帆布鞋与小白鞋。')
  }

  return reasons
}
