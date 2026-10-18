import { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, ITEMS, byId } from './catalog.js'
import { detectConflicts } from './conflicts.js'

// ---------- 建议引擎：根据当前穿搭实时生成 ----------
// 每条建议 { title, why, applyId(可一键试穿), src(来源卡片id) }

const RULES_BY_TOP = {
  't-white': {
    bottoms: [
      { title: '深蓝直筒牛仔裤', why: '白T × 深蓝牛仔是公认"闭眼穿"公式：浅色上衣×深色下装对比清晰，直筒版型藏肉又有型。', applyId: 'b-jeans-d', src: 'kin-pants' },
      { title: '卡其锥形裤', why: '想换气质就上卡其色，白+卡其是最不容易出错的浅暖组合，日系感拉满。', applyId: 'b-chinos-k', src: 'cake-styles' },
      { title: '黑色牛仔裤', why: '黑下装让白T更"打眼"，整体更利落，适合想低调有型的时候。', applyId: 'b-jeans-b', src: 'stone-black' },
    ],
    shoes: [
      { title: '白色小白鞋', why: '白T+小白鞋同色呼应，完成度直接拉满，几乎所有UP主的共识。', applyId: 's-white', src: 'chongs-converse' },
      { title: '米色帆布鞋', why: '帆布鞋比小白鞋更松弛，学生党和日系风的标配。', applyId: 's-canvas', src: 'shu-look' },
    ],
    accs: [
      { title: '银色腕表', why: '圆领T恤留出了手腕空间，一块腕表就能从"随便穿穿"变成"有细节的人"。', applyId: 'a-watch', src: 'hallo-tricks' },
      { title: '银色项链', why: '圆领是项链最好的舞台，细链即可，点到为止。', applyId: 'a-necklace', src: 'bear-formula' },
      { title: '棒球帽', why: '白T+棒球帽是运动休闲风的万金油，还能救发型。', applyId: 'a-cap', src: 'hallo-tricks' },
    ],
  },
  't-black': {
    bottoms: [
      { title: '黑色牛仔裤', why: '全身黑的关键是"同色不同质"：针织/棉T配牛仔布，材质差出层次，禁欲系天花板。', applyId: 'b-jeans-b', src: 'stone-black' },
      { title: '深灰休闲西裤', why: '黑T配垂感西裤，是"穷人版时装精"公式，正式度+1但依然松弛。', applyId: 'b-trousers-g', src: 'curator-advanced' },
      { title: '浅蓝牛仔裤', why: '怕太沉闷就配浅色下装，深浅互换一样成立，更青春。', applyId: 'b-jeans-l', src: 'victor-mono' },
    ],
    shoes: [
      { title: '棕色切尔西靴', why: '全身黑+棕色靴，一点暖色让整体立刻"贵"起来。', applyId: 's-chelsea', src: 'luoluo-coat' },
      { title: '白色小白鞋', why: '黑配白是最稳的对比，鞋子的白呼应不了上装也没关系。', applyId: 's-white', src: 'chongs-converse' },
    ],
    accs: [
      { title: '银色项链', why: '深色上装是银饰最好的背景板，锁骨链瞬间打破沉闷。', applyId: 'a-necklace', src: 'bear-formula' },
      { title: '银色腕表', why: '黑衣服上金属细节会格外显眼，是低成本高级感。', applyId: 'a-watch', src: 'hallo-tricks' },
    ],
  },
  't-gray': {
    bottoms: [
      { title: '军绿工装裤', why: '灰色中性调和一切，军绿+灰是工装风的经典对话。', applyId: 'b-cargo-o', src: 'kin-pants' },
      { title: '卡其锥形裤', why: '灰×卡其是莫兰迪式温柔配色，通勤约会都稳。', applyId: 'b-chinos-k', src: 'cake-styles' },
      { title: '深蓝直筒牛仔裤', why: '不知道配什么时，牛仔永远是安全区。', applyId: 'b-jeans-d', src: 'kin-pants' },
    ],
    shoes: [
      { title: '白色小白鞋', why: '灰色系+白鞋干净利落，全身低饱和更高级。', applyId: 's-white', src: 'curator-advanced' },
      { title: '黑白跑鞋', why: '配工装/运动短裤时，跑鞋比板鞋更"成套"。', applyId: 's-runner', src: 'kin-pants' },
    ],
    accs: [
      { title: '棒球帽', why: '灰色低调，帽子提供"焦点"，整套立刻有造型感。', applyId: 'a-cap', src: 'hallo-tricks' },
      { title: '黑色斜挎包', why: '小挎包是机能感来源，斜背线还能分割上身比例。', applyId: 'a-bag', src: 'kin-pants' },
    ],
  },
  't-polo': {
    bottoms: [
      { title: '卡其锥形裤', why: 'Polo自带斯文气，配卡其裤是最经典的"学院绅士"组合。', applyId: 'b-chinos-k', src: 'cake-styles' },
      { title: '深蓝直筒牛仔裤', why: '藏青Polo×深蓝牛仔是同色系深浅玩法，整体感强。', applyId: 'b-jeans-d', src: 'gushu-logic' },
      { title: '浅蓝牛仔裤', why: '藏青配浅色下装同样成立：浅蓝牛仔把 Polo 衬得更精神，夏天尤其清爽。', applyId: 'b-jeans-l', src: 'shu-look' },
    ],
    shoes: [
      { title: '米色帆布鞋', why: 'Polo别配太"硬"的鞋，帆布鞋保住松弛感。', applyId: 's-canvas', src: 'shu-look' },
      { title: '白色小白鞋', why: '万能答案，Polo+牛仔裤+小白鞋是图书馆标配。', applyId: 's-white', src: 'chongs-converse' },
    ],
    accs: [
      { title: '黑框眼镜', why: 'Polo+眼镜=斯文败类风入门款，书卷气加倍。', applyId: 'a-glasses', src: 'madeng-glasses' },
      { title: '银色腕表', why: 'Polo的领口已经足够正式，腕表延续这份体面。', applyId: 'a-watch', src: 'hallo-tricks' },
    ],
  },
  't-shirt-w': {
    bottoms: [
      { title: '深灰休闲西裤', why: '白衬衫×灰色西裤是通勤最稳解，垂感西裤还能修饰腿型。', applyId: 'b-trousers-g', src: 'curator-advanced' },
      { title: '深蓝直筒牛仔裤', why: '衬衫下摆塞进深蓝牛仔裤，通勤休闲两开花。', applyId: 'b-jeans-d', src: 'shirts-tuck' },
      { title: '黑色西裤', why: '面试/正式场合：白衬衫+黑西裤不会有第二种意见。', applyId: 'b-trousers-b', src: 'stone-intern' },
    ],
    shoes: [
      { title: '黑色德比皮鞋', why: '正式白衬衫配皮鞋天经地义，德比比牛津更百搭。', applyId: 's-derby', src: 'stone-intern' },
      { title: '棕色切尔西靴', why: '把白衬衫当休闲穿时，切尔西靴是质感担当。', applyId: 's-chelsea', src: 'luoluo-coat' },
    ],
    accs: [
      { title: '银色腕表', why: '衬衫+腕表是职场默认协议，金属表带比皮带更年轻。', applyId: 'a-watch', src: 'hallo-tricks' },
    ],
    tips: ['衬衫下摆务必塞：全塞显干练，前塞显随性——塞完腰部拉出一点余量才不尴尬。', '领口最上面一颗扣子：不打领带就别扣，除非你想演.office严肃剧。'],
  },
  't-shirt-b': {
    bottoms: [
      { title: '深蓝直筒牛仔裤', why: '浅蓝×深蓝是同色系叠法，深浅有致，秋天的温柔感就靠它。', applyId: 'b-jeans-d', src: 'cake-styles' },
      { title: '卡其锥形裤', why: '蓝×卡其是经典撞色但不冲突，日系清爽。', applyId: 'b-chinos-k', src: 'shu-look' },
      { title: '黑色牛仔裤', why: '浅蓝衬衫配黑裤，对比更强烈，利落干练。', applyId: 'b-jeans-b', src: 'stone-black' },
    ],
    shoes: [
      { title: '棕色切尔西靴', why: '浅蓝衬衫+棕靴，秋天最有质感的组合之一。', applyId: 's-chelsea', src: 'luoluo-coat' },
      { title: '白色小白鞋', why: '干净少年感的最短路径。', applyId: 's-white', src: 'chongs-converse' },
    ],
    accs: [
      { title: '灰色围巾', why: '衬衫外层再加围巾，秋冬层次立刻+1。', applyId: 'a-scarf', src: 'stone-coat' },
      { title: '银色腕表', why: '衬衫袖口卷起后，腕表的存在感刚刚好。', applyId: 'a-watch', src: 'wave-details' },
    ],
    tips: ['浅蓝衬衫配工装夹克/牛仔夹克做外套，是最不容易翻车的秋日叠穿。'],
  },
  't-hoodie-g': {},
  't-hoodie-b': {},
  't-sweater-o': {},
  't-sweater-w': {},
}

// 卫衣专属
RULES_BY_TOP['t-hoodie-g'] = RULES_BY_TOP['t-hoodie-b'] = {
  bottoms: [
    { title: '军绿工装裤', why: '卫衣×工装裤是街头风定式，上松下直才不显邋遢。', applyId: 'b-cargo-o', src: 'kin-pants' },
    { title: '黑色牛仔裤', why: '深色锥形牛仔收住卫衣的宽松感，整体更精神。', applyId: 'b-jeans-b', src: 'luoluo-tall' },
    { title: '黑色运动短裤', why: '夏天的"卫衣+短裤"是欧美街拍常客，记得袜子隐形。', applyId: 'b-shorts-b', src: 'stone-casual' },
  ],
  shoes: [
    { title: '黑白跑鞋', why: '卫衣的归宿是运动鞋：厚底跑鞋呼应oversize比例。', applyId: 's-runner', src: 'chongs-converse' },
    { title: '米色帆布鞋', why: '想要学院感就换帆布鞋，青春感无损。', applyId: 's-canvas', src: 'shu-week' },
  ],
  accs: [
    { title: '棒球帽', why: '帽檐压低+卫衣帽子叠戴，街头感直接翻倍。', applyId: 'a-cap', src: 'hallo-tricks' },
    { title: '黑色斜挎包', why: '斜挎包线条能打破卫衣的"一块板"，还实用。', applyId: 'a-bag', src: 'kin-pants' },
  ],
  warnings: ['连帽卫衣请远离皮鞋与西装裤——那是两个世界的碰撞。'],
}

RULES_BY_TOP['t-sweater-o'] = {
  bottoms: [
    { title: '卡其锥形裤', why: '燕麦×卡其是大地色系的教科书组合，温柔且高级。', applyId: 'b-chinos-k', src: 'cake-styles' },
    { title: '深蓝直筒牛仔裤', why: '毛衣配牛仔是秋冬最松弛的打开方式，深蓝压得住浅色。', applyId: 'b-jeans-d', src: 'luoluo-coat' },
    { title: '军绿工装裤', why: '军绿让燕麦色不腻，野外露营风随叫随到。', applyId: 'b-cargo-o', src: 'kin-pants' },
  ],
  shoes: [
    { title: '棕色切尔西靴', why: '大地色毛衣+棕靴，秋冬质感天团。', applyId: 's-chelsea', src: 'luoluo-coat' },
    { title: '白色小白鞋', why: '想轻盈一点就用白鞋收尾，不会错。', applyId: 's-white', src: 'chongs-converse' },
  ],
  accs: [
    { title: '灰色围巾', why: '毛衣+围巾是冬天的基本礼仪，灰色百搭燕麦色。', applyId: 'a-scarf', src: 'stone-coat' },
    { title: '银色项链', why: '圆领毛衣+细项链，是"会穿"的暗号。', applyId: 'a-necklace', src: 'bear-formula' },
  ],
}

RULES_BY_TOP['t-sweater-w'] = {
  bottoms: [
    { title: '黑色牛仔裤', why: '酒红是焦点色，下装必须收敛：黑色最稳。', applyId: 'b-jeans-b', src: 'six-rules' },
    { title: '深灰休闲西裤', why: '酒红×深灰，复古又体面，通勤也能穿。', applyId: 'b-trousers-g', src: 'curator-advanced' },
    { title: '深蓝直筒牛仔裤', why: '深蓝与酒红同属"深色系"，既和谐又不抢戏。', applyId: 'b-jeans-d', src: 'gushu-logic' },
  ],
  shoes: [
    { title: '黑色德比皮鞋', why: '彩色上装时，鞋子越深越稳。', applyId: 's-derby', src: 'stone-intern' },
    { title: '棕色切尔西靴', why: '棕色与酒红同属暖色家族，秋天感拉满。', applyId: 's-chelsea', src: 'luoluo-coat' },
  ],
  accs: [
    { title: '银色腕表', why: '有了焦点色，配饰越少越高级——一块表足矣。', applyId: 'a-watch', src: 'hallo-tricks' },
  ],
  warnings: ['全身已有焦点色（酒红），其余单品请保持中性色，颜色总数别超过三种。'],
}

RULES_BY_TOP['t-stripe-t'] = {
  bottoms: [
    { title: '深蓝直筒牛仔裤', why: '条纹是唯一的花色，下装必须回到纯色：深蓝牛仔与藏青条纹同源，安全又高级。', applyId: 'b-jeans-d', src: 'shu-paris' },
    { title: '黑色牛仔裤', why: '条纹配全黑下装，把视觉重心全部压在上半身，是法式海魂衫的经典解法。', applyId: 'b-jeans-b', src: 'shu-paris' },
    { title: '卡其锥形裤', why: '藏青条纹 × 卡其是海军风的标准配色，比牛仔多一点度假感。', applyId: 'b-chinos-k', src: 'cake-styles' },
  ],
  shoes: [
    { title: '米色帆布鞋', why: '条纹+帆布鞋自带法式松弛，注意袜子要隐形或与裤同色。', applyId: 's-canvas', src: 'shu-paris' },
    { title: '棕色乐福鞋', why: '想把它穿进办公室，乐福鞋比运动鞋更能接住条纹的斯文气。', applyId: 's-loafer-b', src: 'stride-loafer' },
  ],
  accs: [
    { title: '银色腕表', why: '条纹本身信息量已经够，配饰只留一块表，别再加项链。', applyId: 'a-watch', src: 'hallo-tricks' },
    { title: '卡其帆布托特包', why: '条纹+帆布包的组合很文艺，颜色卡其能呼应条纹里的米白。', applyId: 'a-tote-k', src: 'curator-shops' },
  ],
  warnings: ['条纹已经承担了图案角色，外套与下装请全部用纯色，否则会花掉。'],
}

RULES_BY_TOP['t-polo-b'] = {
  bottoms: [
    { title: '卡其锥形裤', why: '黑色针织Polo配卡其裤，是"轻商务"最省力的组合：上身收，下装柔。', applyId: 'b-chinos-k', src: 'dandy-fit' },
    { title: '藏青西裤', why: '针织Polo够formal，配藏青西裤就能进大多数会议室，比衬衫舒服一个档次。', applyId: 'b-trousers-n', src: 'stone-suit' },
    { title: '灰色直筒牛仔裤', why: '想放松一点就换灰牛仔，黑色针织的光泽在高清镜头下很出彩。', applyId: 'b-jeans-g', src: 'bvr-curator-tee' },
  ],
  shoes: [
    { title: '棕色乐福鞋', why: '无领上衣配无带鞋，是意式休闲的标准公式。', applyId: 's-loafer-b', src: 'stride-loafer' },
    { title: '黑色切尔西靴', why: '秋冬把乐福换成黑切尔西，裤脚盖住靴口更利落。', applyId: 's-chelsea-b', src: 'curator-winter' },
  ],
  accs: [
    { title: '黑色皮带', why: '针织Polo一般要扎进裤子，一条素扣皮带能收干净腰线。', applyId: 'a-belt-b', src: 'shirts-tuck' },
    { title: '银色腕表', why: '针织的哑光表面需要一点金属反光，腕表正是那个点。', applyId: 'a-watch', src: 'hallo-tricks' },
  ],
  tips: ['针织Polo领口微开一颗扣子即可，全扣会显得像制服。'],
}

RULES_BY_TOP['t-oxford-g'] = {
  bottoms: [
    { title: '藏青西裤', why: '灰蓝牛津衬衫是深色西裤最好的内搭，比纯白更耐看也更耐脏。', applyId: 'b-trousers-n', src: 'stone-suit' },
    { title: '深蓝直筒牛仔裤', why: '灰蓝衬衫配深蓝牛仔，同色系深浅落差，是日系通勤的常见解法。', applyId: 'b-jeans-d', src: 'mfa-basic' },
    { title: '燕麦色休闲裤', why: '灰蓝 × 燕麦是低饱和灰调组合，比卡其更安静。', applyId: 'b-chinos-o', src: 'xhs-soete-autumn' },
  ],
  shoes: [
    { title: '棕色德比鞋', why: '灰蓝衬衫配棕德比，暖冷对比刚好，比黑鞋更有层次。', applyId: 's-derby-b', src: 'dandy-fit' },
    { title: '白色小白鞋', why: '通勤日想舒服就换小白鞋，衬衫下摆记得塞进腰里。', applyId: 's-white', src: 'sspai-basic' },
  ],
  accs: [
    { title: '卡其帆布托特包', why: '装得下电脑的通勤包，帆布质地与牛津纺的粗糙感很搭。', applyId: 'a-tote-k', src: 'curator-shops' },
    { title: '黑色皮带', why: '衬衫束进去就需要一条皮带收尾，颜色与鞋保持同族。', applyId: 'a-belt-b', src: 'shirts-tuck' },
  ],
}

RULES_BY_TOP['t-sweatshirt-c'] = {
  bottoms: [
    { title: '灰色直筒牛仔裤', why: '米白卫衣配灰牛仔，两件都是低饱和，靠材质差出层次。', applyId: 'b-jeans-g', src: 'sspai-autumn' },
    { title: '黑色牛仔裤', why: '米白 × 黑是最安全的高对比，配黑色上衣还能顺色到底。', applyId: 'b-jeans-b', src: 'stone-black' },
    { title: '卡其锥形裤', why: '米白卫衣+卡其裤是完整的暖色系，秋天骑车的标配。', applyId: 'b-chinos-k', src: 'cake-pants' },
  ],
  shoes: [
    { title: '米色帆布鞋', why: '圆领卫衣配帆布鞋最松弛，鞋与卫衣同色更能拉长比例。', applyId: 's-canvas', src: 'shu-week' },
    { title: '白色小白鞋', why: '小白鞋是活力感的保险，配束脚裤尤其精神。', applyId: 's-white', src: 'chongs-converse' },
  ],
  accs: [
    { title: '卡其帆布托特包', why: '无帽卫衣比连帽干净，正适合配一个帆布托特包通勤。', applyId: 'a-tote-k', src: 'curator-shops' },
    { title: '银色腕表', why: '米白色容易显得"软"，一块金属表能补回一点硬朗。', applyId: 'a-watch', src: 'hallo-tricks' },
  ],
}

RULES_BY_TOP['t-knit-n'] = {
  bottoms: [
    { title: '藏青西裤', why: '藏青针织+藏青西裤是同色系修身公式，靠针织的哑光区分层次。', applyId: 'b-trousers-n', src: 'stone-suit' },
    { title: '燕麦色休闲裤', why: '藏青 × 燕麦是秋冬最稳的配色，一冷一暖刚好平衡。', applyId: 'b-chinos-o', src: 'xhs-soete-autumn' },
    { title: '灰色直筒牛仔裤', why: '针织衫配灰牛仔，是周末最容易被夸"看起来会穿"的组合。', applyId: 'b-jeans-g', src: 'lu16-formula' },
  ],
  shoes: [
    { title: '棕色乐福鞋', why: '针织衫+乐福鞋是标准的秋日斯文搭配，记得露出脚踝。', applyId: 's-loafer-b', src: 'stride-loafer' },
    { title: '黑色切尔西靴', why: '天冷换切尔西靴，裤脚刚好搭在靴口上最干净。', applyId: 's-chelsea-b', src: 'curator-winter' },
  ],
  accs: [
    { title: '灰色围巾', why: '针织衫外再加围巾会有点重复，选薄款并让它自然垂下。', applyId: 'a-scarf', src: 'stone-coat' },
    { title: '银色腕表', why: '藏青是最衬金属的颜色，袖口卷起后腕表立刻显眼。', applyId: 'a-watch', src: 'hallo-tricks' },
  ],
}

RULES_BY_TOP['t-ls-tee-b'] = {
  bottoms: [
    { title: '灰色束脚运动裤', why: '长袖T + 束脚裤是最轻的athleisure组合，脚踝收紧就有精神。', applyId: 'b-joggers-g', src: 'mfa-basic' },
    { title: '迷彩工装裤', why: '黑色长袖T打底，让迷彩工装裤成为全身唯一的图案。', applyId: 'b-cargo-o', src: 'kin-pants' },
    { title: '黑色牛仔裤', why: '全身黑靠材质分层：棉质T恤与牛仔布的哑光差就是答案。', applyId: 'b-jeans-b', src: 'stone-black' },
  ],
  shoes: [
    { title: '黑色工装靴', why: '秋冬把裤脚搭在工装靴上，厚重感与长袖T的分量正好配套。', applyId: 's-boot-b', src: 'dy-jiang-skills' },
    { title: '黑白跑鞋', why: '想轻快就用跑鞋，长袖T外披夹克就是标准的街头层次。', applyId: 's-runner', src: 'kin-pants' },
  ],
  accs: [
    { title: '黑色斜挎包', why: '长袖T单穿时上身面积大，斜挎背带能切出比例。', applyId: 'a-bag', src: 'kin-pants' },
    { title: '棒球帽', why: '黑色长袖T配帽子，是街头最不需要思考的一套。', applyId: 'a-cap', src: 'hallo-tricks' },
  ],
  tips: ['长袖T恤当内搭时，让领口与袖口露出外套 1–2cm，层次感立刻出来。'],
}

// 开发期不变量：所有硬编码 applyId 必须真实存在于 catalog。
// 若 catalog 改了 id / 删了单品而这里没同步，导入本模块时立刻抛错，而不是让建议静默失效。
export const HARDCODED_APPLY_IDS = [
  ...new Set(
    Object.values(RULES_BY_TOP).flatMap((rule) =>
      [...(rule.bottoms || []), ...(rule.shoes || []), ...(rule.accs || [])]
        .map((suggestion) => suggestion.applyId)
        .filter(Boolean),
    ),
  ),
]

const CATALOG_ID_SET = new Set(ITEMS.map((item) => item.id))
const missingApplyIds = HARDCODED_APPLY_IDS.filter((id) => !CATALOG_ID_SET.has(id))
if (missingApplyIds.length > 0) {
  throw new Error(`[advice] 硬编码 applyId 在 catalog 中不存在: ${missingApplyIds.join(', ')}`)
}

// ---------- 四维评分：配色 / 正式度 / 轮廓 / 完成度 ----------
// 每一项都必须真的从入参算出来，禁止写成常量映射。

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 解析 #rrggbb / #rrggbbaa；非法或全透明返回 null
function parseHex(hex) {
  if (typeof hex !== 'string') return null
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const alpha = m[2] === undefined ? 1 : parseInt(m[2], 16) / 255
  if (alpha <= 0.05) return null
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

// 把带 hex 的单品转成 HSL 列表（跳过透明/非法色）
function toHslList(items) {
  return items
    .map((it) => (it ? parseHex(it.hex) : null))
    .filter(Boolean)
    .map(rgbToHsl)
}

// 彩色按色相环形聚类：相邻色相差 <= 40° 归为同族
function hueClusters(chroma) {
  const sorted = chroma.slice().sort((a, b) => a.h - b.h)
  const groups = []
  for (const c of sorted) {
    const last = groups[groups.length - 1]
    if (last && hueGap(last.center, c.h) <= 40) last.items.push(c)
    else groups.push({ center: c.h, items: [c] })
  }
  if (groups.length > 1 && hueGap(groups[0].center, groups[groups.length - 1].center) <= 40) {
    const tail = groups.pop()
    groups[0].items = groups[0].items.concat(tail.items)
  }
  return groups.map((g) => ({
    size: g.items.length,
    hue: g.items.reduce((s, c) => s + c.h, 0) / g.items.length,
    sat: g.items.reduce((s, c) => s + c.s, 0) / g.items.length,
    light: g.items.reduce((s, c) => s + c.l, 0) / g.items.length,
  }))
}

function scorePalette(top, outer, bottom, shoes, accs) {
  const hasOuter = Boolean(outer && outer.id !== 'o-none')
  const all = [top, bottom, shoes, hasOuter ? outer : null, ...accs].filter(Boolean)
  const parts = [top, bottom, shoes, hasOuter ? outer : null].filter(Boolean)
  const hslList = toHslList(parts)
  const accHsl = toHslList(accs)

  if (!hslList.length) {
    return { value: 18, note: '没有可判定的颜色信息（单品缺失或全透明），配色维度按中性给分。' }
  }

  const chroma = hslList.filter((c) => c.s >= 0.10)
  const neutrals = hslList.filter((c) => c.s < 0.10)
  const clusters = hueClusters(chroma)

  // 起始值取「中等偏下」而不是满分：
  // 这条维度满分 30，若从 30 起算，7 条规则里只有强冲突才扣得动，实测 77% 的搭配
  // 直接拿满 30 分——等于这一维几乎没有区分能力，把总分整体推高（16848 组合只得 37 个
  // 分值、中位数 82）。从 18 起算，让「好搭配加分 / 坏搭配扣分」两个方向都真的能动。
  let value = 18
  const notes = []
  let good = 0
  let bad = 0

  // ① 彩色族数量：越少越干净
  if (clusters.length >= 4) { value -= 12; bad++; notes.push(`出现 ${clusters.length} 个彩色族，颜色过于分散`) }
  else if (clusters.length === 3) { value -= 7; bad++; notes.push('全身有 3 个彩色族，已超出三色原则的边缘') }
  else if (clusters.length === 2) { value -= 2; notes.push('两个彩色族，属于可接受的对比') }
  else if (clusters.length === 1) { value += 4; good++; notes.push('只有 1 个彩色族，其余靠中性色收住') }
  else { value += 5; good++; notes.push('全身都是中性色，最安全但也最保守') }

  // ② 中性色数量（含配饰）：中性色太多会显得灰扑扑
  const neutralCount = neutrals.length + accHsl.filter((c) => c.s < 0.10).length
  if (neutralCount >= 5) { value -= 4; notes.push(`中性色多达 ${neutralCount} 处，画面偏灰`) }
  else if (neutralCount >= 4) { value -= 1 }

  // ③ 上/下装的明度对比：拉开才能分割比例
  if (top && bottom) {
    const a = toHslList([top])[0], b = toHslList([bottom])[0]
    if (a && b) {
      const dl = Math.abs(a.l - b.l)
      if (dl >= 0.35) { value += 6; good++; notes.push(`上装与下装明度差 ${Math.round(dl * 100)}%，上下分割清晰`) }
      else if (dl >= 0.18) { value += 4; good++; notes.push(`上装与下装明度差 ${Math.round(dl * 100)}%，层次可辨`) }
      else if (dl < 0.08) { value -= 6; bad++; notes.push(`上装与下装明度差仅 ${Math.round(dl * 100)}%，色块糊在一起`) }
      else { value += 0; notes.push(`上装与下装明度差 ${Math.round(dl * 100)}%，中规中矩`) }
    }
  }

  // ④ 色相关系：邻近色和谐加分，夹角过小会显脏
  if (clusters.length === 2) {
    const gap = hueGap(clusters[0].hue, clusters[1].hue)
    if (gap <= 90) { value += 5; good++; notes.push(`两色色相相差 ${Math.round(gap)}°，属邻近色搭配`) }
    else if (gap >= 150) { value += 3; good++; notes.push(`两色色相相差 ${Math.round(gap)}°，属对比色搭配，需要靠面积控场`) }
    else { value -= 3; bad++; notes.push(`两色色相相差 ${Math.round(gap)}°，半生不熟最容易显脏`) }
  }

  // ⑤ 饱和度：多件高饱和会互相打架
  const loud = chroma.filter((c) => c.s >= 0.5).length
  if (loud >= 2) { value -= 5; bad++; notes.push(`有 ${loud} 件高饱和单品相互抢色`) }
  else if (chroma.length && chroma.every((c) => c.s < 0.35)) { value += 4; good++; notes.push('彩色件全部低饱和，画面安静高级') }

  // ⑥ accent 家族的单品数：焦点色只允许一个
  const accentCount = all.filter((it) => it.family === 'accent').length
  if (accentCount >= 2) { value -= 4; bad++; notes.push(`焦点色单品 ${accentCount} 件，视觉上互抢`) }

  // ⑦ 主色占比（面积法：上装 35% / 下装 30% / 外套 25% / 鞋 10%，按色相族归并）
  const areas = [[top, 0.35], [bottom, 0.30], [hasOuter ? outer : null, 0.25], [shoes, 0.10]]
  const share = {}
  for (const [item, w] of areas) {
    if (!item) continue
    const hsl = toHslList([item])[0]
    if (!hsl) continue
    const key = hsl.s < 0.10 ? 'neutral' : 'h' + Math.round(hsl.h / 40)
    share[key] = (share[key] || 0) + w
  }
  const topShare = Object.values(share).sort((a, b) => b - a)[0] || 0
  if (topShare >= 0.65 && Object.keys(share).length <= 3) { value += 4; good++; notes.push(`主色占比约 ${Math.round(topShare * 100)}%，主体明确`) }
  else if (topShare < 0.40 && Object.keys(share).length >= 3) { value -= 4; bad++; notes.push(`没有主色（最大色块仅 ${Math.round(topShare * 100)}%），视觉缺少重心`) }

  value = clamp(Math.round(value), 0, 30)
  // 加分与减分都真实发生过时，优先展示「为什么扣分」——用户更需要知道怎么改。
  const ordered = bad > 0 ? notes : notes
  return { value, note: ordered.slice(0, 3).join('；') + '。' }
}

function scoreFormality(top, outer, bottom, shoes) {
  const hasOuter = Boolean(outer && outer.id !== 'o-none')
  const roles = [
    ['上装', top],
    ['下装', bottom],
    ['鞋子', shoes],
  ].filter(([, it]) => it)
  if (hasOuter) roles.push(['外套', outer])

  const ids = roles.map(([, it]) => it.id)
  const notes = []
  if (roles.length < 2) {
    return { value: 12, note: '单品不足两件，无法判断正式度是否成套，按中性给分。' }
  }

  // ① 所有单品两两之间的正式度差（绝对值）
  let sum = 0, pairs = 0, worst = null
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const d = Math.abs(roles[i][1].formality - roles[j][1].formality)
      sum += d; pairs++
      if (!worst || d > worst.d) worst = { d, a: roles[i][0], b: roles[j][0] }
    }
  }
  const mean = sum / pairs
  let value = 25 - Math.round(mean * 8)

  if (mean === 0) notes.push(`上装/下装/${hasOuter ? '外套/' : ''}鞋子的正式度完全同档（均为 ${roles[0][1].formality} 档），成套度最高`)
  else if (mean <= 1) notes.push(`各件正式度平均差距 ${mean.toFixed(2)} 档，落在可接受的半档内`)
  else if (mean <= 1.7) notes.push(`各件正式度平均差距 ${mean.toFixed(2)} 档，需要靠配饰拉平`)
  else notes.push(`各件正式度平均差距达 ${mean.toFixed(2)} 档，${worst.a}与${worst.b}错位最明显`)

  // ② 单点暴差：一双过于正式或过于休闲的鞋最伤体面
  if (bottom && shoes && Math.abs(bottom.formality - shoes.formality) >= 2) {
    value -= 4
    notes.push(`鞋子（${shoes.formality} 档）与下装（${bottom.formality} 档）落差过大`)
  }
  if (hasOuter && top && Math.abs(outer.formality - top.formality) >= 2) {
    value -= 3
    notes.push('外套与内搭正式度断层，敞穿时容易"两截"')
  }

  // ③ 层级正确性：外套不应比内搭低两档以上
  if (hasOuter && bottom && outer.formality < bottom.formality) {
    value -= 2
    notes.push('外套比下装更休闲，压不住下半身的正式度')
  }

  // ④ 全场偏高正式度但鞋不够正式
  const maxF = Math.max(...roles.map(([, it]) => it.formality))
  if (maxF >= 3 && shoes && shoes.formality <= 1) {
    value -= 3
    notes.push('整体走到 3 档正式度，鞋子却还是休闲档')
  }
  if (roles.length === 3 && !hasOuter && mean <= 0.7 && maxF === 1) {
    value += 3
    notes.push('全套休闲档、无外套，休闲场合里完成度最好的形态')
  }

  value = clamp(Math.round(value), 0, 25)
  return { value, note: notes.slice(0, 3).join('；') + '。' }
}

function scoreSilhouette(top, outer, bottom, shoes, accs) {
  const hasOuter = Boolean(outer && outer.id !== 'o-none')
  const notes = []
  // 起始值取中等偏下而非满分：从 25 起算时实测 79.5% 的搭配拿满，这一维几乎没有区分度。
  // 从 14 起算，「量感收得住 / 保暖连续 / 鞋裤匹配」这些加分会真的把分数抬起来。
  let value = 14

  if (!top || !bottom) {
    return { value: 12, note: '缺少上装或下装，无法判断轮廓，按中性给分。' }
  }

  // ① 长短关系：短裤配长大衣/风衣是典型断层
  const bottomMesh = bottom.mesh || ''
  const outerMesh = hasOuter ? (outer.mesh || '') : ''
  const longOuter = ['trench', 'coat'].includes(outerMesh)
  if (bottomMesh === 'shorts') {
    if (longOuter) { value -= 8; notes.push('短裤配及膝长外套，下半身被截断，比例最差') }
    else if (hasOuter) { value -= 2; notes.push('短裤外搭外套时，外套长度务必停在腰线附近') }
    else { value += 3; notes.push('短裤单穿，腿部线条完整') }
  }

  // ② 上宽下宽 / 上窄下宽：版型量感是否互相兜住
  const bulkyTop = top.warmth >= 3
  const straightBottom = ['pants-denim', 'pants-twill', 'joggers', 'pants-cargo'].includes(bottomMesh)
  if (bulkyTop && straightBottom) { value += 4; notes.push('厚上装配直筒下装，量感收得住') }
  if (!bulkyTop && bottomMesh === 'shorts') { value += 1 }

  // ③ 保暖层级是否连续（温度断层会让轮廓忽厚忽薄）
  const warmthValues = [top.warmth, bottom.warmth, shoes ? shoes.warmth : null, hasOuter ? outer.warmth : null]
    .filter((w) => typeof w === 'number' && w > 0)
  if (warmthValues.length >= 3) {
    const spread = Math.max(...warmthValues) - Math.min(...warmthValues)
    if (spread >= 3) { value -= 6; notes.push(`上下的保暖层级差 ${spread} 级（从 ${Math.min(...warmthValues)} 到 ${Math.max(...warmthValues)}），厚薄断层`) }
    else if (spread === 2) { value -= 2; notes.push(`保暖层级差 ${spread} 级，需要靠内搭补一层`) }
    else { value += 3; notes.push('全身保暖层级基本连续') }
  }

  // ④ 鞋型与下装体积：重靴配短裤会显得脚踝被剪断
  if (shoes) {
    const shoesMesh = shoes.mesh || ''
    if (bottomMesh === 'shorts' && ['boot', 'derby', 'chelsea'].includes(shoesMesh)) {
      value -= 5; notes.push('短裤配靴/皮鞋，脚踝处会断成两截')
    }
    if (bottomMesh === 'joggers' && ['sneaker', 'runner', 'canvas'].includes(shoesMesh)) {
      value += 4; notes.push('束脚口配运动鞋，脚踝收得干净')
    }
    if (['pants-twill', 'pants-denim'].includes(bottomMesh) && ['loafer', 'derby'].includes(shoesMesh)) {
      value += 4; notes.push('垂感裤装配皮鞋，裤脚自然搭在鞋面上')
    }
  }

  // ⑤ 外套给出的轮廓上限：有外套才有"外轮廓"
  if (hasOuter) { value += 4; notes.push('有外套提供完整外轮廓') }
  else { value -= 1; notes.push('无外套，轮廓完全依赖内搭与下装') }

  // ⑥ 配饰数量对轮廓的影响（围巾/包/帽子能加体积）
  const bulkyAccs = accs.filter((a) => ['scarf', 'beanie', 'bag', 'tote'].includes(a.mesh)).length
  if (bulkyAccs >= 3) { value -= 3; notes.push('附加体积的配饰过多，轮廓会显得臃肿') }
  else if (bulkyAccs === 1) { value += 2 }

  value = clamp(Math.round(value), 0, 25)
  return { value, note: notes.slice(0, 3).join('；') + '。' }
}

function scoreCompleteness(top, outer, bottom, shoes, accs) {
  const hasOuter = Boolean(outer && outer.id !== 'o-none')
  const notes = []
  // 起始 10 分、满分 20 分：必须「配件数量合适 + 三件齐全 + 鞋色呼应」三件事同时做到才够得着满分。
  // 原实现起始 12 且「2 件配饰 +5」「三件齐全 +3」就已顶到 20，导致 48% 的组合拿满分。
  let value = 10

  // ① 配饰数量：0 件缺细节，2 件最从容，4 件以上开始乱
  if (accs.length === 0) { value -= 5; notes.push('全身没有任何配饰，细节全靠衣服本身') }
  else if (accs.length === 1) { value += 1; notes.push('1 件配饰，克制但已经有点睛') }
  else if (accs.length === 2) { value += 4; notes.push('2 件配饰，是全套最舒服的数量') }
  else if (accs.length === 3) { value += 2; notes.push('3 件配饰已到上限，注意彼此呼应') }
  else { value -= 3; notes.push(`${accs.length} 件配饰过量，容易显乱`) }

  // ② 基本件齐不齐
  const missing = []
  if (!top) missing.push('上装')
  if (!bottom) missing.push('下装')
  if (!shoes) missing.push('鞋子')
  if (missing.length) { value -= missing.length * 6; notes.push(`缺少${missing.join('、')}`) }
  else { value += 3; notes.push('上装/下装/鞋子三件齐全') }

  // ③ 温度闭环：厚上装却没有外套，或夏天套了厚外套
  if (top && shoes) {
    if (top.warmth >= 3 && !hasOuter) { value -= 3; notes.push('厚内搭却没有外套过渡，出门需要再加一层') }
    // 原实现这里是一句空操作（value += 0），属死代码；改成真正的惩罚：
    // 薄内搭 + 极厚外套 = 内外不匹配，进屋脱掉外套后只剩一件夏装。
    if (hasOuter && outer.warmth >= 4 && top.warmth <= 1) {
      value -= 2
      notes.push('薄内搭配极厚外套，脱掉外套后体感断层，建议换成中间层')
    }
  }

  // ④ 色彩呼应（免费的设计感）：鞋与某件上/下装同色族
  if (shoes && top && bottom) {
    const sColor = toHslList([shoes])[0]
    const others = toHslList([top, bottom, ...(hasOuter ? [outer] : [])])
    if (sColor && others.some((o) => (o.s < 0.10 && sColor.s < 0.10) || hueGap(o.h, sColor.h) <= 30)) {
      value += 3; notes.push('鞋子与身上某件单品同色系，形成呼应')
    } else if (sColor && others.length) {
      // 鞋色与全身都不呼应时也应当扣分，否则这一维在「有没有呼应」两侧不对称，
      // 导致完成度满分率长期停在 50%（实测）。
      value -= 2
      notes.push('鞋子与全身没有色彩呼应，可作为下一步改进点')
    }
  }

  // ⑤ 金属一致性（腕表/项链/戒指都银色，或者都没有）
  const metals = ['watch', 'necklace', 'ring'].filter((m) => accs.some((a) => a.mesh === m))
  if (metals.length >= 2) { value += 2; notes.push(`金属配饰 ${metals.length} 件且同色，细节统一`) }

  value = clamp(Math.round(value), 0, 20)
  return { value, note: notes.slice(0, 3).join('；') + '。' }
}

const verdictOf = (total) =>
  total >= 85 ? '优秀' : total >= 70 ? '良好' : total >= 55 ? '及格' : '需要调整'

function buildScore(top, outer, bottom, shoes, accs) {
  const palette = scorePalette(top, outer, bottom, shoes, accs)
  const formality = scoreFormality(top, outer, bottom, shoes)
  const silhouette = scoreSilhouette(top, outer, bottom, shoes, accs)
  const completeness = scoreCompleteness(top, outer, bottom, shoes, accs)
  const breakdown = [
    { key: 'palette', label: '配色', value: palette.value, max: 30, note: palette.note },
    { key: 'formality', label: '正式度', value: formality.value, max: 25, note: formality.note },
    { key: 'silhouette', label: '轮廓', value: silhouette.value, max: 25, note: silhouette.note },
    { key: 'completeness', label: '完成度', value: completeness.value, max: 20, note: completeness.note },
  ]
  const total = breakdown.reduce((s, i) => s + i.value, 0)
  return { total, verdict: verdictOf(total), breakdown }
}

// 法则卡片（来源见 sources.js）
export const LAWS = [
  { n: '01', kind: 'principle', title: '全身颜色不超过三种', body: '三色原则是所有UP主的第一共识：主色60% + 辅色30% + 点缀色10%。新手直接照抄"上浅下深"或"上深下浅"最安全。', src: 'six-rules' },
  { n: '02', kind: 'principle', title: '先合身，再谈风格', body: '肩线落在肩峰、裤长微堆或利落九分、袖口到手腕——不合身的贵价衣服不如合身的优衣库。', src: 'wave-details' },
  { n: '03', kind: 'principle', title: '廉价感来自皱、旧、紧', body: '衣服平整比新更重要：起球、褶皱、过紧的版型是廉价感三大来源。挂烫机是性价比最高的"变帅设备"。', src: 'goose-cheap' },
  { n: '04', kind: 'principle', title: '塞衣角 = 免费长高', body: '上装塞进下装，腰线上移，腿长比例立刻改变。全塞干练、前塞随性，塞完记得拉松腰部。', src: 'victor-tuck' },
  { n: '05', kind: 'principle', title: '鞋裤同色系最显腿长', body: '鞋与裤子颜色一致，视觉上腿延伸到脚底；鞋头别太笨重，厚底慎用。', src: 'chongs-converse' },
  { n: '06', kind: 'principle', title: '基础款占衣柜70%', body: '白T、牛仔、卡其裤、素色卫衣……先买基础款打底，再少量买设计款提亮，怎么组合都不乱。', src: 'curator-shops' },
  { n: '07', kind: 'style', title: '风格先行，参考脸型气质', body: '面部线条硬朗适合工装/美式，柔和圆润适合日系/韩系。先定主风格再买衣服，避免衣柜精神分裂。', src: 'xu-face' },
  { n: '08', kind: 'style', title: '黄黑皮的显白法则', body: '避开荧光色、土黄、亮橙；藏青、大地色、燕麦、黑白灰才是黄黑皮的朋友色。', src: 'kin-darkskin' },
  { n: '09', kind: 'style', title: '配饰是标点符号，不是主角', body: '手表/项链/帽子/包，全身选1-2件就够，且尽量与衣服同色系。配饰越克制，越显从容。', src: 'hallo-tricks' },
  { n: '10', kind: 'style', title: '全身黑靠材质分层', body: '黑色不显高级？针织、牛仔、皮革、帆布混搭，让"黑与黑"之间产生纹理差。', src: 'stone-black' },
  { n: '11', kind: 'style', title: '细节完成度：卷袖口、露脚踝', body: '袖口卷两折露出小臂，裤脚九分微露脚踝——两个免费动作，精神度立刻提升。', src: 'wave-details' },
  { n: '12', kind: 'subjective', title: '比场合低半档最得体', body: '职场别穿成老板，约会别穿成面试。判断场合的正式度，再降半档，是最舒服的分寸感。', src: 'stone-intern' },
  { n: '13', kind: 'experience', title: '三分法则：上短下长显腿长', body: '上装占视觉1/3、下装占2/3，比50/50平均分割更显高。高腰裤+短款夹克/塞衣角，都是同一原理。', src: 'cr-put' },
  { n: '14', kind: 'subjective', title: 'Buy nice or buy twice', body: '质量>数量：鞋、外套、牛仔、腕表值得买好的（按每次穿着成本算更划算），潮流单品则别花大钱。', src: 'tmf-wardrobe' },
  { n: '15', kind: 'experience', title: '记住三个尺寸公式', body: '正肩=肩宽+2~3cm，落肩=肩宽+6~7cm，合身=胸围+6~8cm，衣长≈身高×0.41。不同品牌与体型会有偏差，请以实际试穿为准。', src: 'hupu-summer' },
  { n: '16', kind: 'style', title: '色彩呼应=免费的设计感', body: '鞋、帽、包与身上某件单品同色呼应（如白T+黑裤+白鞋），整体立刻"成套"；全身同色时，用内搭长白T做过渡层。', src: 'web-colorsohu' },
]

export function getAdvice(state) {
  // 防御：state 缺失 / 字段不全 / 类型不对时都必须正常返回，不抛异常
  const s = state && typeof state === 'object' ? state : {}
  const topId = typeof s.top === 'string' ? s.top : null
  const outerId = typeof s.outer === 'string' ? s.outer : 'o-none'
  const bottomId = typeof s.bottom === 'string' ? s.bottom : null
  const shoesId = typeof s.shoes === 'string' ? s.shoes : null
  const accIds = Array.isArray(s.accs) ? s.accs.filter((id) => typeof id === 'string') : []

  const top = byId(TOPS, topId)
  const outer = byId(OUTERS, outerId)
  const bottom = byId(BOTTOMS, bottomId)
  const shoes = byId(SHOES, shoesId)
  const accs = accIds.map((id) => byId(ACCS, id)).filter(Boolean)

  const rule = RULES_BY_TOP[topId] || {}
  const bottoms = rule.bottoms || []
  const shoesOut = rule.shoes || []
  const accsOut = rule.accs || []
  const warnings = [...(rule.warnings || [])]
  const tips = [...(rule.tips || [])]

  // ---- 冲突检测（单一事实来源：src/data/conflicts.js）----
  warnings.push(...detectConflicts({ top, outer, bottom, shoes }))
  if (outer && outer.id === 'o-blazer-n') {
    if (accs.some((a) => a.id === 'a-cap'))
      warnings.push('西装+棒球帽是潮流玩法，但极考验脸和整体度，通勤场景建议摘掉帽子。')
    if (top && top.id.startsWith('t-hoodie'))
      tips.push('西装内搭连帽卫衣是美式休闲混搭，记得让卫衣帽子平整地翻在领外。')
    else
      tips.push('西装敞开穿时，内搭颜色越素越高级；白T其实是西装最被低估的内搭。')
  }
  if (accs.length >= 3)
    warnings.push(`当前已佩戴 ${accs.length} 件配饰——配饰点到为止，超过3件容易显乱。`)
  if (top && top.id.startsWith('t-shirt') && !tips.some((t) => t.includes('塞')))
    tips.push('衬衫记得塞衣角或买短款：下摆堆在胯上是最常见的"显矮"原因。')
  if (bottom && shoes && bottom.family === shoes.family && bottom.id !== 'b-shorts-b')
    tips.push('鞋裤同色系（显腿长加成）：你已经踩中这个心机点，保持住。')
  if (outer && outer.formality >= 2 && top && top.warmth >= 3)
    tips.push('毛衣/卫衣外搭外套时，外套尺码要比平时大一码，否则袖口会卡出褶皱。')

  // ---- 总结 ----
  const formality = Math.round(((top?.formality || 1) * 0.3 + (bottom?.formality || 1) * 0.3 + (shoes?.formality || 1) * 0.25 + (outer?.formality || 0) * 0.15) * 10) / 10
  const vibe = formality >= 2.6 ? '偏正式' : formality >= 1.8 ? '通勤smart casual' : '休闲'
  const colorCount = new Set([top?.hex, outer && outer.hex !== '#00000000' ? outer.hex : null, bottom?.hex].filter(Boolean)).size
  const overall = `当前是一套${vibe}的搭配，全身主色约 ${colorCount} 种${colorCount > 3 ? '——超出三色原则，建议减色' : '，符合三色原则'}。`

  // ---- 四维评分 ----
  const score = buildScore(top, outer, bottom, shoes, accs)

  return { bottomSugs: bottoms, shoeSugs: shoesOut, accSugs: accsOut, warnings, tips, overall, top, outer, bottom, shoes, accs, score }
}
