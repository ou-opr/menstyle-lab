// 服装目录：每件单品 = 类型 + 颜色，formality 1休闲 2通勤 3正式
// family: light浅色 / dark深色 / earth大地色 / accent彩色
// warmth: 1酷暑 2春秋 3秋冬 4严冬；mesh: T5 三维网格映射键（契约 docs/CONTRACT.md 第 3 节）

export const TOPS = [
  { id: 't-white', name: '白色短袖T恤', hex: '#f1efe8', family: 'light', formality: 1, warmth: 1, mesh: 'tee',
    tip: '公认的新手安全牌，闭眼搭都成立', ref: '重磅袋款 Tee（优衣库U / Carhartt 风格）' },
  { id: 't-black', name: '黑色短袖T恤', hex: '#23242a', family: 'dark', formality: 1, warmth: 1, mesh: 'tee',
    tip: '禁欲系高级感的起点', ref: '重磅袋款 Tee' },
  { id: 't-gray', name: '灰色短袖T恤', hex: '#9a9da3', family: 'light', formality: 1, warmth: 1, mesh: 'tee',
    tip: '比白T低调，比黑T清爽', ref: '重磅袋款 Tee' },
  { id: 't-stripe-t', name: '藏青条纹T恤', hex: '#dfe3ea', family: 'light', formality: 1, warmth: 1, mesh: 'tee-stripe',
    tip: '条纹本身自带节奏，下装与外套全部用纯色压住才不花', ref: '海魂衫 / 细条纹纯棉T' },
  { id: 't-polo', name: '藏青Polo衫', hex: '#2b3a55', family: 'dark', formality: 2, warmth: 1, mesh: 'polo',
    tip: '比T恤正式、比衬衫松弛', ref: 'Lacoste L.12.12 罗纹袖口' },
  { id: 't-polo-b', name: '黑色针织Polo', hex: '#212328', family: 'dark', formality: 2, warmth: 2, mesh: 'polo',
    tip: '针织质地让Polo摆脱校服感，配西裤可以直接进会议室', ref: '针织Polo（Ralph Lauren 风格）' },
  { id: 't-shirt-w', name: '白衬衫', hex: '#f4f2ec', family: 'light', formality: 3, warmth: 2, mesh: 'shirt',
    tip: '通勤与正式场合的万能内搭', ref: 'Oxford 剑桥领衬衫' },
  { id: 't-shirt-b', name: '浅蓝衬衫', hex: '#a8c0d8', family: 'light', formality: 2, warmth: 2, mesh: 'shirt',
    tip: '清爽感担当，约会通勤两用', ref: 'Oxford 剑桥领衬衫' },
  { id: 't-oxford-g', name: '灰蓝牛津衬衫', hex: '#7c8896', family: 'light', formality: 2, warmth: 2, mesh: 'shirt',
    tip: '介于灰与蓝之间的中性色，是深色外套里最不抢戏的一层', ref: 'Oxford 牛津纺衬衫' },
  { id: 't-hoodie-g', name: '灰色连帽卫衣', hex: '#8d9096', family: 'light', formality: 1, warmth: 3, mesh: 'hoodie',
    tip: '街头与学院风的基础件', ref: 'Champion Reverse Weave 袋鼠兜' },
  { id: 't-hoodie-b', name: '黑色连帽卫衣', hex: '#26272b', family: 'dark', formality: 1, warmth: 3, mesh: 'hoodie',
    tip: '显瘦且好搭，配工装裤很出片', ref: 'Champion Reverse Weave 袋鼠兜' },
  { id: 't-sweatshirt-c', name: '米白圆领卫衣', hex: '#efe7d8', family: 'light', formality: 1, warmth: 3, mesh: 'sweatshirt',
    tip: '无帽设计比连帽干净，配休闲西裤也不会显得随便', ref: 'Reverse Weave 圆领卫衣' },
  { id: 't-sweater-o', name: '燕麦色针织毛衣', hex: '#d3c4ab', family: 'earth', formality: 2, warmth: 3, mesh: 'sweater',
    tip: '秋冬温柔感的核心单品', ref: '圆领罗纹针织' },
  { id: 't-sweater-w', name: '酒红色针织毛衣', hex: '#7a3b40', family: 'accent', formality: 2, warmth: 3, mesh: 'sweater',
    tip: '全身的焦点色，下装务必收敛', ref: '圆领罗纹针织' },
  { id: 't-knit-n', name: '藏青圆领针织衫', hex: '#2f3a4d', family: 'dark', formality: 2, warmth: 3, mesh: 'sweater',
    tip: '藏青针织是"安静的正式"，衬衫打底就能当轻商务穿', ref: '细针圆领针织衫' },
  { id: 't-ls-tee-b', name: '黑色长袖T恤', hex: '#26272b', family: 'dark', formality: 1, warmth: 2, mesh: 'longsleeve-tee',
    tip: '秋冬内搭的底座，靠露出的领口与袖口叠出层次', ref: '重磅长袖T恤' },
]

export const OUTERS = [
  { id: 'o-none', name: '不穿外套', hex: '#00000000', family: '—', formality: 0, warmth: 0, mesh: 'none' },
  { id: 'o-overshirt-k', name: '卡其工装夹克', hex: '#b49a72', family: 'earth', formality: 1, warmth: 2, mesh: 'overshirt',
    tip: '当作"衬衫外套"穿的万金油，扣上比敞开更斯文', ref: 'Carhartt 工装夹克' },
  { id: 'o-overshirt-d', name: '牛仔夹克', hex: '#5b7492', family: 'dark', formality: 1, warmth: 2, mesh: 'overshirt',
    tip: '唯一要注意的是别与牛仔裤同色同洗水，否则像制服', ref: "Levi's Type III 牛仔夹克" },
  { id: 'o-harrington-o', name: '军绿哈林顿夹克', hex: '#5d6647', family: 'earth', formality: 1, warmth: 2, mesh: 'harrington',
    tip: '短下摆正好卡在腰线，是显腿长最省力的一件外套', ref: 'Baracuta G9 风格哈林顿' },
  { id: 'o-bomber-b', name: '黑色飞行夹克', hex: '#2a2b30', family: 'dark', formality: 1, warmth: 3, mesh: 'bomber',
    tip: '肩线利落、下摆收口，配直筒裤能把上身体积收住', ref: 'MA-1 飞行夹克（袖袋款）' },
  { id: 'o-puffer-b', name: '黑色轻薄羽绒服', hex: '#232428', family: 'dark', formality: 1, warmth: 4, mesh: 'puffer',
    tip: '零下也能保住轮廓，绗缝越细越不显臃肿', ref: '轻薄羽绒（Ultra Light Down）' },
  { id: 'o-blazer-n', name: '藏青西装外套', hex: '#2e3b52', family: 'dark', formality: 3, warmth: 2, mesh: 'blazer',
    tip: '单件就能把休闲装拉高半档，敞开穿时内搭越素越高级', ref: '藏青两粒扣平驳领' },
  { id: 'o-trench-k', name: '卡其风衣', hex: '#bcaa8c', family: 'earth', formality: 2, warmth: 2, mesh: 'trench',
    tip: '梅雨季与春秋的体面外壳，长度到膝盖上更利落', ref: '双排扣翻领风衣' },
  { id: 'o-coat-g', name: '深灰毛呢大衣', hex: '#4b4d52', family: 'dark', formality: 3, warmth: 4, mesh: 'coat',
    tip: '正式度仅次于西装，大衣长度基本决定气场', ref: '羊毛混纺单排扣大衣' },
]

export const BOTTOMS = [
  { id: 'b-jeans-d', name: '深蓝直筒牛仔裤', hex: '#3d4d66', family: 'dark', formality: 1, warmth: 2, mesh: 'pants-denim',
    tip: '万能下装，直筒不紧身才有质感', ref: "Levi's 501 直筒" },
  { id: 'b-jeans-l', name: '浅蓝牛仔裤', hex: '#7e97b5', family: 'light', formality: 1, warmth: 2, mesh: 'pants-denim',
    tip: '春夏日系感来源，配深色上装更稳', ref: "Levi's 501 直筒" },
  { id: 'b-jeans-b', name: '黑色牛仔裤', hex: '#2b2c31', family: 'dark', formality: 1, warmth: 2, mesh: 'pants-denim',
    tip: '显腿细，正式度比蓝牛仔高半档', ref: "Levi's 511 锥形" },
  { id: 'b-jeans-g', name: '灰色直筒牛仔裤', hex: '#6b7078', family: 'dark', formality: 1, warmth: 2, mesh: 'pants-denim',
    tip: '灰色牛仔介于黑与蓝之间，给彩色上装留出了空间', ref: "Levi's 501 灰色水洗" },
  { id: 'b-chinos-k', name: '卡其锥形裤', hex: '#c0a97e', family: 'earth', formality: 2, warmth: 2, mesh: 'pants-twill',
    tip: '大地色系百搭件，配白/藏青上衣最稳', ref: 'Dockers 卡其裤' },
  { id: 'b-chinos-o', name: '燕麦色休闲裤', hex: '#cdbb9c', family: 'earth', formality: 2, warmth: 2, mesh: 'pants-twill',
    tip: '燕麦比卡其更轻，配同色系上装就是高级灰调', ref: '水洗棉休闲裤' },
  { id: 'b-trousers-g', name: '深灰休闲西裤', hex: '#4a4d55', family: 'dark', formality: 3, warmth: 2, mesh: 'pants-twill',
    tip: '通勤体面担当，垂感是关键', ref: '垂感锥形西裤' },
  { id: 'b-trousers-b', name: '黑色西裤', hex: '#232428', family: 'dark', formality: 3, warmth: 2, mesh: 'pants-twill',
    tip: '正式场合唯一解', ref: '垂感锥形西裤' },
  { id: 'b-trousers-n', name: '藏青西裤', hex: '#2c3648', family: 'dark', formality: 3, warmth: 2, mesh: 'pants-twill',
    tip: '比黑色少一点严肃，与藏青西装同色时最成套', ref: '垂感锥形西裤' },
  { id: 'b-cargo-o', name: '迷彩工装裤', hex: '#6f7355', family: 'earth', formality: 1, warmth: 2, mesh: 'pants-cargo',
    tip: '机能街头风核心，上装要简洁', ref: 'Carhartt Cargo 大侧袋' },
  { id: 'b-joggers-g', name: '灰色束脚运动裤', hex: '#83878e', family: 'light', formality: 1, warmth: 2, mesh: 'joggers',
    tip: '束脚口收紧脚踝，运动裤也能穿出比例', ref: '抓绒束脚卫裤' },
  { id: 'b-shorts-b', name: '黑色运动短裤', hex: '#2f3036', family: 'dark', formality: 1, warmth: 1, mesh: 'shorts',
    tip: '夏天救急，膝上5cm内最利落', ref: '及膝运动短裤' },
  { id: 'b-shorts-k', name: '卡其休闲短裤', hex: '#c3ae86', family: 'earth', formality: 1, warmth: 1, mesh: 'shorts',
    tip: '比运动短裤正式半档，配Polo就能进咖啡馆', ref: '斜纹棉短裤' },
]

export const SHOES = [
  { id: 's-white', name: '白色小白鞋', hex: '#edeae2', family: 'light', formality: 1, warmth: 2, mesh: 'sneaker',
    tip: '万物皆可搭的完成度神器', ref: '极简小白鞋（Common Projects 风格）' },
  { id: 's-canvas', name: '米色帆布鞋', hex: '#d8cdb8', family: 'earth', formality: 1, warmth: 1, mesh: 'canvas',
    tip: '学生感与日系感来源', ref: 'Converse 1970s 硫化底' },
  { id: 's-runner', name: '黑白跑鞋', hex: '#dcdcdc', hex2: '#222326', family: 'light', formality: 1, warmth: 2, mesh: 'runner',
    tip: '配运动风、街头风下装', ref: 'Air Jordan Legacy 312' },
  { id: 's-loafer-b', name: '棕色乐福鞋', hex: '#6b4a33', family: 'earth', formality: 2, warmth: 2, mesh: 'loafer',
    tip: '不系带的体面，比德比松弛，配九分裤露出脚踝最正', ref: '便士乐福（Penny Loafer）' },
  { id: 's-chelsea', name: '棕色切尔西靴', hex: '#6e4a2f', family: 'earth', formality: 2, warmth: 3, mesh: 'chelsea',
    tip: '秋冬质感担当，配大地色系', ref: 'Clarks 切尔西靴' },
  { id: 's-chelsea-b', name: '黑色切尔西靴', hex: '#1d1e22', family: 'dark', formality: 2, warmth: 3, mesh: 'chelsea',
    tip: '黑靴配黑裤是最省力的延长线，腿看起来更长', ref: '黑色麂皮切尔西' },
  { id: 's-boot-b', name: '黑色工装靴', hex: '#26262a', family: 'dark', formality: 1, warmth: 4, mesh: 'boot',
    tip: '厚底撑起工装裤，雨天与泥地也不心疼', ref: '6寸工装靴（Red Wing 风格）' },
  { id: 's-derby', name: '黑色德比皮鞋', hex: '#1e1f23', family: 'dark', formality: 3, warmth: 2, mesh: 'derby',
    tip: '西装/西裤的唯一正确答案', ref: '德比正装皮鞋' },
  { id: 's-derby-b', name: '棕色德比鞋', hex: '#6a452c', family: 'earth', formality: 2, warmth: 2, mesh: 'derby',
    tip: '棕色德比是藏青西装的黄金搭档，比黑色多一分亲和', ref: '棕色牛皮德比' },
]

// ACCS 的 `note` 为契约第 3 节原文；`tip` 为补充信息量的说明。
// 注意：契约 ACCS 表没有 ref 列，且 Panel.jsx 的 subLabel 优先级是 ref > tip > note，
// 加 ref 会顶掉契约 note 的展示，故 ACCS 不设 ref（Panel.jsx 非 T1 所有，不改）。
export const ACCS = [
  { id: 'a-watch', name: '银色腕表', hex: '#c9ccd1', family: 'light', formality: 2, warmth: 1, mesh: 'watch',
    tip: '圆领上装留出的手腕空间，一块表就能补上细节；表盘直径别超过手腕宽度。', note: '上手就是"有细节的人"' },
  { id: 'a-necklace', name: '银色项链', hex: '#d3d6da', family: 'light', formality: 1, warmth: 1, mesh: 'necklace',
    tip: '细链即可，40–45cm 刚好落在圆领边缘上方，是最高性价比的提亮。', note: '圆领上装的好搭档' },
  { id: 'a-cap', name: '棒球帽', hex: '#2f3138', family: 'dark', formality: 1, warmth: 2, mesh: 'cap',
    tip: '运动与街头风的点睛，同时压住没洗的头发；正装场合请摘掉。', note: '街头/运动风的点睛' },
  { id: 'a-beanie-g', name: '灰色针织帽', hex: '#8b8f96', family: 'light', formality: 1, warmth: 3, mesh: 'beanie',
    tip: '冷到必须戴帽子时用，针织帽比棒球帽更配毛呢大衣，帽檐别盖住眉毛。', note: '秋冬保暖兼造型' },
  { id: 'a-glasses', name: '黑框眼镜', hex: '#20211f', family: 'dark', formality: 2, warmth: 1, mesh: 'glasses',
    tip: '一副镜框就是一层斯文滤镜，镜框宽度与脸最宽处齐平才不显脸大。', note: '斯文感滤镜' },
  { id: 'a-sunglasses', name: '黑框墨镜', hex: '#1b1c1f', family: 'dark', formality: 1, warmth: 1, mesh: 'sunglasses',
    tip: '户外与街拍的眼部提亮，配夹克、工装与短裤最对味，室内记得收起来。', note: '户外与街拍提亮' },
  { id: 'a-bag', name: '黑色斜挎包', hex: '#26272b', family: 'dark', formality: 1, warmth: 1, mesh: 'bag',
    tip: '斜背的背带线能分割上身面积，顺便解放双手；包身别超过 A4。', note: '机能感 + 实用' },
  { id: 'a-tote-k', name: '卡其帆布托特包', hex: '#c2b295', family: 'earth', formality: 1, warmth: 1, mesh: 'tote',
    tip: '装得下电脑的通勤包，厚帆布比真皮更日常，也更好搭大地色下装。', note: '通勤装得下电脑' },
  { id: 'a-belt-b', name: '黑色皮带', hex: '#26262a', family: 'dark', formality: 2, warmth: 1, mesh: 'belt',
    tip: '塞衣角时的收尾，带宽 3cm 左右最稳，皮带颜色尽量与鞋同色系。', note: '塞衣角时的收尾' },
  { id: 'a-ring-s', name: '银色戒指', hex: '#d6d9dd', family: 'light', formality: 1, warmth: 1, mesh: 'ring',
    tip: '手部细节，金属色要与腕表、项链保持同一种（都银或都金）。', note: '手部细节' },
  { id: 'a-scarf', name: '灰色围巾', hex: '#9aa0a6', family: 'light', formality: 1, warmth: 3, mesh: 'scarf',
    tip: '秋冬层次感来源，垂挂在胸前比绕三圈更利落，也不会显得脖子短。', note: '秋冬层次感来源' },
  { id: 'a-socks-w', name: '白色长袜', hex: '#efece4', family: 'light', formality: 1, warmth: 2, mesh: 'socks',
    tip: '短裤与露踝搭配时用，中筒长度盖过脚踝、别过小腿肚，是复古运动风的标点。', note: '短裤与露踝搭配用' },
]

// 个人衣橱单品（id 以 u- 开头）不在系统目录里，但衣柜条、3D 试衣间、建议引擎都要按 id
// 取到它的 name / hex / mesh / formality。与其让七八个调用点各自判断 id 从哪来，这里挂一层
// 运行时叠加：先查系统目录，查不到再查衣橱。App 在每次渲染前同步登记，保证同一帧就能查到。
let wardrobeIndex = new Map()

/** 由 App 调用；传非数组或空数组即清空叠加。 */
export function setWardrobeItems(items) {
  const list = Array.isArray(items) ? items : []
  wardrobeIndex = new Map(
    list.filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]),
  )
}

export const byId = (list, id) => list.find((x) => x.id === id) || wardrobeIndex.get(id)

// 契约要求的汇总出口：ITEMS 展开五大类，CATEGORIES 按类别取数组，findItem 全表按 id 查找
export const ITEMS = [...TOPS, ...OUTERS, ...BOTTOMS, ...SHOES, ...ACCS]

export const CATEGORIES = { top: TOPS, outer: OUTERS, bottom: BOTTOMS, shoes: SHOES, acc: ACCS }

export const findItem = (id) => ITEMS.find((x) => x.id === id) || wardrobeIndex.get(id)

// 一键造型预设
export const PRESETS = [
  {
    id: 'p-safe', name: '新手安全牌', mood: '怎么穿都不会错',
    outfit: { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] },
    desc: '白T + 深蓝直筒牛仔 + 小白鞋，被无数UP主称为"闭眼穿"公式，再加一块腕表就有细节感。',
    src: 'kin-pants',
  },
  {
    id: 'p-street', name: '街头机能', mood: '出片率最高',
    outfit: { top: 't-hoodie-b', outer: 'o-none', bottom: 'b-cargo-o', shoes: 's-runner', accs: ['a-cap', 'a-bag'] },
    desc: '黑卫衣 + 军绿工装裤 + 跑鞋，上简下繁，帽子与挎包强化机能感。',
    src: 'kin-pants',
  },
  {
    id: 'p-date', name: '秋日约会', mood: '温柔有质感',
    outfit: { top: 't-sweater-o', outer: 'o-none', bottom: 'b-chinos-k', shoes: 's-chelsea', accs: ['a-necklace'] },
    desc: '燕麦色毛衣 × 卡其裤 × 切尔西靴，大地色系层层递进，是约会场景的高分答案。',
    src: 'cake-styles',
  },
  {
    id: 'p-work', name: '通勤体面', mood: '面试也够用',
    outfit: { top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-g', shoes: 's-derby', accs: ['a-watch'] },
    desc: '白衬衫 + 藏青西装 + 深灰西裤 + 德比鞋，正式度拉满，衬衫下摆记得塞。',
    src: 'shirts-tuck',
  },
  {
    id: 'p-layer', name: '秋冬层次', mood: '叠穿教科书',
    outfit: { top: 't-shirt-b', outer: 'o-overshirt-k', bottom: 'b-jeans-d', shoes: 's-chelsea', accs: ['a-scarf'] },
    desc: '浅蓝衬衫外搭卡其工装夹克，配深蓝牛仔与棕色靴，围巾补上秋冬氛围。',
    src: 'stone-coat',
  },
  {
    id: 'p-mono', name: '黑白灰禁欲', mood: '170也能高级',
    outfit: { top: 't-black', outer: 'o-none', bottom: 'b-trousers-b', shoes: 's-chelsea', accs: ['a-necklace', 'a-watch'] },
    desc: '全身上下只用黑白灰三色，靠材质与轮廓制造层次，崔胜元同款思路。',
    src: 'victor-mono',
  },
  {
    id: 'p-campus', name: '清爽校园', mood: '干净少年感',
    outfit: { top: 't-polo', outer: 'o-none', bottom: 'b-chinos-k', shoes: 's-canvas', accs: ['a-glasses'] },
    desc: '藏青Polo + 卡其裤 + 帆布鞋 + 黑框眼镜，斯文清爽，图书馆与食堂通吃。',
    src: 'stone-casual',
  },
  {
    id: 'p-summer', name: '夏日短裤', mood: '凉快但利落',
    outfit: { top: 't-gray', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-white', accs: ['a-cap'] },
    desc: '灰T + 黑色短裤 + 小白鞋，短裤选膝上5cm，袜子隐形，夏天最清爽的公式。',
    src: 'stone-casual',
  },
  {
    id: 'p-weekend', name: '周末城市', mood: '松弛好走一天',
    outfit: { top: 't-sweatshirt-c', outer: 'o-harrington-o', bottom: 'b-jeans-g', shoes: 's-canvas', accs: ['a-tote-k', 'a-watch'] },
    desc: '米白圆领卫衣 + 军绿哈林顿 + 灰牛仔 + 帆布鞋：三色以内、上短下直，逛一整天也不显累。',
    src: 'sspai-autumn',
  },
  {
    id: 'p-camp', name: '露营户外', mood: '耐造又上镜',
    outfit: { top: 't-ls-tee-b', outer: 'o-overshirt-k', bottom: 'b-cargo-o', shoes: 's-boot-b', accs: ['a-sunglasses', 'a-cap'] },
    desc: '黑色长袖T恤打底、卡其工装夹克外披、迷彩工装裤配工装靴：耐脏耐磨，帽子墨镜负责上镜。',
    src: 'dy-jiang-skills',
  },
  {
    id: 'p-festival', name: '音乐节', mood: '白天到夜晚',
    outfit: { top: 't-stripe-t', outer: 'o-none', bottom: 'b-jeans-l', shoes: 's-runner', accs: ['a-sunglasses', 'a-ring-s'] },
    desc: '条纹T恤 + 浅蓝牛仔 + 跑鞋，墨镜与戒指补细节；条纹自带图案，其余单品别再叠花色。',
    src: 'cat-styles',
  },
  {
    id: 'p-gala', name: '正式晚宴', mood: '不出错的体面',
    outfit: { top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-b', shoes: 's-derby', accs: ['a-watch', 'a-ring-s'] },
    desc: '白衬衫 + 藏青西装 + 黑西裤 + 黑德比，配饰只留腕表与戒指；正式场合少即是多。',
    src: 'stone-suit',
  },
  {
    id: 'p-rainy', name: '梅雨季', mood: '淋不透的体面',
    outfit: { top: 't-oxford-g', outer: 'o-trench-k', bottom: 'b-trousers-n', shoes: 's-chelsea-b', accs: ['a-bag'] },
    desc: '卡其风衣压住灰蓝牛津衬衫，藏青西裤配黑色切尔西靴；深色下装 + 防泼水面料是雨天关键。',
    src: 'rain-coats',
  },
  {
    id: 'p-heat', name: '酷暑', mood: '35℃也不闷',
    outfit: { top: 't-gray', outer: 'o-none', bottom: 'b-shorts-k', shoes: 's-canvas', accs: ['a-sunglasses', 'a-socks-w'] },
    desc: '灰T + 卡其休闲短裤 + 帆布鞋，膝上5cm配白袜；高湿度天里浅色棉麻比深色凉快。',
    src: 'stone-summer',
  },
  {
    id: 'p-winter', name: '寒冬', mood: '零下也显形',
    outfit: { top: 't-knit-n', outer: 'o-coat-g', bottom: 'b-jeans-g', shoes: 's-boot-b', accs: ['a-beanie-g', 'a-scarf'] },
    desc: '藏青针织 + 深灰毛呢大衣 + 灰牛仔 + 工装靴，针织帽与围巾补上温度；大衣盖过膝盖才保暖。',
    src: 'curator-winter',
  },
  {
    id: 'p-gym', name: '健身通勤', mood: '从器械到工位',
    outfit: { top: 't-ls-tee-b', outer: 'o-none', bottom: 'b-joggers-g', shoes: 's-runner', accs: ['a-bag', 'a-cap'] },
    desc: '黑色长袖T恤 + 灰色束脚裤 + 跑鞋，斜挎包直接装毛巾与水壶；练完不换装也能进公司。',
    src: 'chongs-converse',
  },
  {
    id: 'p-wedding', name: '朋友婚礼', mood: '不抢新人风头',
    outfit: { top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-n', shoes: 's-derby-b', accs: ['a-watch', 'a-ring-s'] },
    desc: '白衬衫配藏青西装与藏青西裤（同色西服更成套），棕色德比鞋比黑色多一分亲和。',
    src: 'yt2-doctormike-suit',
  },
  {
    id: 'p-gallery', name: '看展', mood: '安静的高级',
    outfit: { top: 't-polo-b', outer: 'o-coat-g', bottom: 'b-chinos-o', shoes: 's-loafer-b', accs: ['a-glasses', 'a-tote-k'] },
    desc: '黑色针织Polo + 深灰大衣 + 燕麦色休闲裤 + 棕色乐福鞋：低饱和大地色系，眼镜与托特包收尾。',
    src: 'douban-style',
  },
  {
    id: 'p-home', name: '居家', mood: '舒服但不邋遢',
    outfit: { top: 't-white', outer: 'o-none', bottom: 'b-joggers-g', shoes: 's-canvas', accs: ['a-socks-w'] },
    desc: '白T + 灰色束脚裤 + 帆布鞋，一双白袜就是全身的颜色呼应；居家最忌起球与松垮两连击。',
    src: 'sspai-basic',
  },
]
