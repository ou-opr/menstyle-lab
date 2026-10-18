import { LINK_STATUS } from './link-status.generated.js'

// 全网博主资源：platform -> bilibili / zhihu / xiaohongshu / douyin / youtube / reddit
export const PLATFORMS = {
  bilibili: { name: '哔哩哔哩', color: '#fb7299' },
  zhihu: { name: '知乎', color: '#0084ff' },
  xiaohongshu: { name: '小红书', color: '#ff2442' },
  douyin: { name: '抖音', color: '#161823' },
  hupu: { name: '虎扑', color: '#c9281e' },
  sspai: { name: '少数派', color: '#cf4c3d' },
  douban: { name: '豆瓣', color: '#2b7a4b' },
  youtube: { name: 'YouTube', color: '#e62117' },
  reddit: { name: 'Reddit', color: '#ff4500' },
  web: { name: '其他平台', color: '#8a8f98' },
}

const RAW_SOURCES = [
  // ================= B站（浏览器实测抓取，2026-09） =================
  { id: 'kin-pants', platform: 'bilibili', creator: '阿kin教穿搭', title: '被问爆的百元神裤，腿粗的看过来！！', url: 'https://www.bilibili.com/video/BV1fA4m1w7xw', plays: '241万播放 · 2024-03', note: '裤子版型优先于花色：腿粗选直筒/锥形，拒绝紧身铅笔裤。', tags: ['裤装'] },
  { id: 'stone-coat', platform: 'bilibili', creator: '石头的穿衣报告', title: '身高不够怎么穿长大衣？请注意这几点', url: 'https://www.bilibili.com/video/BV1rQ4y147fS', plays: '155万播放 · 2023-11', note: '小个子穿大衣：长度过臀不过膝、内搭收短、露出脚踝。', tags: ['外套', '显高'] },
  { id: 'cake-pants', platform: 'bilibili', creator: '一口蛋糕酱', title: '男生穿裤子不注意这些细节，一不小心就丑了｜基本款长裤', url: 'https://www.bilibili.com/video/BV1mY411L7sh', plays: '197万播放 · 2022-02', note: '裤长盖住鞋帮1/3处最利落，堆积在脚踝=廉价感。', tags: ['裤装'] },
  { id: 'wave-details', platform: 'bilibili', creator: '波-SIR', title: '6个穿搭细节让男生更帅气', url: 'https://www.bilibili.com/video/BV1LE411G7gW', plays: '116万播放 · 2020-03', note: '卷袖口、露脚踝、领口平整——细节完成度决定整体气质。', tags: ['技巧'] },
  { id: 'six-rules', platform: 'bilibili', creator: '穿搭-', title: '你一定要知道的男生穿搭的6大原则', url: 'https://www.bilibili.com/video/BV1oW4y1w7GQ', plays: '68万播放 · 2024-01', note: '三色原则、合身剪裁、扬长避短等六大底层原则一次讲全。', tags: ['原则'] },
  { id: 'gushu-logic', platform: 'bilibili', creator: '古叔の着', title: '男生穿搭的底层逻辑，看完没有收获你来打我', url: 'https://www.bilibili.com/video/BV1Zb4y1S7cy', plays: '94万播放 · 2021-04', note: '先定风格再买衣服；不知道穿什么就做减法。', tags: ['原则'] },
  { id: 'goose-cheap', platform: 'bilibili', creator: '不饿的小鹅酱', title: '男生穿衣，如何快速丢掉廉价感！！三分钟速成班', url: 'https://www.bilibili.com/video/BV1WQ4y177Py', plays: '188万播放 · 2024-01', note: '廉价感来自：皱、起球、不合身、logo堆砌。熨烫比买新衣划算。', tags: ['衣品'] },
  { id: 'curator-advanced', platform: 'bilibili', creator: '馆长穿搭日记', title: '男生怎么穿搭更显得高级，注意这些点就可以', url: 'https://www.bilibili.com/video/BV1ku4y117hZ', plays: '414万播放 · 2023-08', note: '高级感=低饱和度配色+重磅面料+利落版型。', tags: ['衣品'] },
  { id: 'chammy-quality', platform: 'bilibili', creator: '痴五安chammy', title: '错误的穿搭思路真的会拉低衣服质感！', url: 'https://www.bilibili.com/video/BV1ZkbCzyEer', plays: '47万播放 · 2025-07', note: '贵≠有质感；全身一件"贵价单品"+基础款就够。', tags: ['衣品'] },
  { id: 'xu-face', platform: 'bilibili', creator: '小徐先生的', title: '你的脸是什么风格？【重置版】', url: 'https://www.bilibili.com/video/BV1pB4y1o7UW', plays: '137万播放 · 2023-10', note: '根据脸型/骨相选风格：攻击性强选硬朗风，圆润脸选柔和日系。', tags: ['风格'] },
  { id: 'cat-styles', platform: 'bilibili', creator: '爱猫人士赵百万', title: '不清楚自己适合什么样的穿衣风格？8种不同的男生穿搭风格带你入门', url: 'https://www.bilibili.com/video/BV1m54y167Ha', plays: '54万播放 · 2020-12', note: '日系/工装/美式/韩系…先试后买，找到自己的主风格。', tags: ['风格'] },
  { id: 'cake-styles', platform: 'bilibili', creator: '一口蛋糕酱', title: '4种最适合男生的穿搭风格，这么穿整个秋天都温柔起来了', url: 'https://www.bilibili.com/video/BV1of4y1j7T1', plays: '164万播放 · 2021-10', note: '男生秋冬四大风格模板：大地色温柔、黑白灰禁欲…', tags: ['风格'] },
  { id: 'madeng-short', platform: 'bilibili', creator: '马登福叔', title: '180以下不配谈穿搭？这种穿搭技巧你要知道！', url: 'https://www.bilibili.com/video/BV1u14y1J7BF', plays: '117万播放 · 2022-12', note: '小个子：提高腰线、上短下长、整体色块不超过三段。', tags: ['显高'] },
  { id: 'chongs-converse', platform: 'bilibili', creator: '叔本聪', title: '视觉欺诈！8双显高百搭鞋，男生显腿长从选鞋开始', url: 'https://www.bilibili.com/video/BV1XV411q7kz', plays: '51万播放 · 2021-01', note: '鞋裤同色系最显腿长，厚底慎用、鞋头别太笨重。', tags: ['显高', '鞋履'] },
  { id: 'luoluo-tall', platform: 'bilibili', creator: '落落的穿搭笔记', title: '怒买101条，我找到了最显高的裤子！', url: 'https://www.bilibili.com/video/BV1Mj421Z7wx', plays: '135万播放 · 2024-03', note: '实测101条裤子：锥形九分裤是160-175cm的万能答案。', tags: ['显高', '裤装'] },
  { id: 'victor-mono', platform: 'bilibili', creator: '崔胜元Victor', title: '优衣库|170显高黑白灰色系穿搭|打造禁欲系高级感男神', url: 'https://www.bilibili.com/video/BV1Lf4y1k7Pq', plays: '115万播放 · 2021-01', note: '黑白灰三色系穿搭模板，平价基础款也能穿出高级感。', tags: ['配色', '风格'] },
  { id: 'victor-tuck', platform: 'bilibili', creator: '崔胜元Victor', title: '男生如何塞衣服才能好看显高不邋遢', url: 'https://www.bilibili.com/video/BV1Qk4y157cp', plays: '51万播放 · 2023-07', note: '全塞显干练、前塞显随性；塞完记得拉松腰部留余量。', tags: ['技巧'] },
  { id: 'shirts-tuck', platform: 'bilibili', creator: '小将金十八', title: '看完就会！衬衫的正确塞法&系法', url: 'https://www.bilibili.com/video/BV1GbDYBgEjg', plays: '101万播放 · 2026-04', note: '衬衫塞法教程：军装塞、前塞、全塞各适用什么场合。', tags: ['技巧'] },
  { id: 'kin-darkskin', platform: 'bilibili', creator: '阿kin教穿搭', title: '黄黑皮男生必看的秋冬穿搭指南', url: 'https://www.bilibili.com/video/BV1CB4y1o78B', plays: '58万播放 · 2023-10', note: '黄黑皮避开荧光色/土黄色，选藏青、大地色、燕麦色显白。', tags: ['配色'] },
  { id: 'madeng-glasses', platform: 'bilibili', creator: '马登工装', title: '别让眼镜封印你的颜值！15秒教你挑选你的天命眼镜', url: 'https://www.bilibili.com/video/BV11c41157T6', plays: '165万播放 · 2023-04', note: '镜框要跟脸型互补：圆脸方框、方脸圆框。', tags: ['配饰'] },
  { id: 'stone-black', platform: 'bilibili', creator: '石头的穿衣报告', title: '我衣柜里的黑色衣服全在这了', url: 'https://www.bilibili.com/video/BV1Ty421a7vn', plays: '148万播放 · 2024-01', note: '全身黑要靠材质差（针织/牛仔/皮革）制造层次。', tags: ['配色'] },
  { id: 'stone-casual', platform: 'bilibili', creator: '石头的穿衣报告', title: '这是思路，不是规定', url: 'https://www.bilibili.com/video/BV1um411m7WA', plays: '125万播放 · 2024-04', note: '穿搭没有标准答案，先模仿再微调成自己的版本。', tags: ['原则'] },
  { id: 'shu-look', platform: 'bilibili', creator: '叔本聪', title: '男生春夏穿搭｜去你的城市，为你挑8套Look', url: 'https://www.bilibili.com/video/BV1LA411N7pb', plays: '162万播放 · 2021-03', note: '8套可直接抄作业的日系春夏搭配。', tags: ['示范'] },
  { id: 'shu-week', platform: 'bilibili', creator: '叔本聪', title: '男生一周穿搭｜夏天8套舒服有型的日系穿搭', url: 'https://www.bilibili.com/video/BV1Ky4y137Lr', plays: '81万播放 · 2021-05', note: '一周穿搭不重样模板，基础款复用率高。', tags: ['示范'] },
  { id: 'dandy-fit', platform: 'bilibili', creator: 'MrDandy胡榛', title: '厅局风6大单品，get体制内男友穿搭精髓', url: 'https://www.bilibili.com/video/BV19t4y1h76d', plays: '52万播放 · 2022-06', note: '体制内穿搭精髓：低调面料+合身剪裁+无logo。', tags: ['风格'] },
  { id: 'molia-first', platform: 'bilibili', creator: 'Molia讲穿搭', title: '男士想改善外形，需要先知道哪些事', url: 'https://www.bilibili.com/video/BV1vT411J71k', plays: '94万播放 · 2022-07', note: '改外形顺序：体型>发型>皮肤>穿搭，别本末倒置。', tags: ['原则'] },
  { id: 'lu16-formula', platform: 'bilibili', creator: '我是路十六', title: '男生穿搭公式教学｜长得不帅，也能靠穿搭逆袭', url: 'https://www.bilibili.com/video/BV1Yk4y1P7nG', plays: '57万播放 · 2023-07', note: '穿搭公式：基础款×合身×统一色系，普通人也能80分。', tags: ['原则'] },
  { id: 'curator-shops', platform: 'bilibili', creator: '馆长穿搭日记', title: '分享几家只要不倒闭就会一直回购的宝藏男装店铺', url: 'https://www.bilibili.com/video/BV1wu4y1C7iW', plays: '135万播放 · 2023-09', note: '性价比男装店铺合集，基础款闭眼入。', tags: ['店铺'] },
  { id: 'luoluo-coat', platform: 'bilibili', creator: '落落的穿搭笔记', title: '男生大衣选购指南！秋冬最值得购买的7件毛呢大衣', url: 'https://www.bilibili.com/video/BV11ZSvBPEFr', plays: '65万播放 · 2025-11', note: '大衣看克重与含毛量，深灰/藏青比黑色更高级。', tags: ['外套'] },
  { id: 'rain-coats', platform: 'bilibili', creator: '刘阳RAIN', title: '男生秋冬穿搭指南！必不可少的7件外套分享', url: 'https://www.bilibili.com/video/BV1dD4y1C7Br', plays: '48万播放 · 2022-10', note: '男装必备外套清单：牛仔夹克/工装/大衣/派克…', tags: ['外套'] },
  { id: 'stone-intern', platform: 'bilibili', creator: '石头的穿衣报告', title: '当实习生穿得像个老板……', url: 'https://www.bilibili.com/video/BV13K4y1q7ra', plays: '98万播放 · 2024-01', note: '职场新人别穿得太隆重，比场合低半档最得体。', tags: ['场合'] },
  { id: 'fire-formula', platform: 'bilibili', creator: '四火_C', title: '原来穿搭是有公式的，不信你看！', url: 'https://www.bilibili.com/video/BV1b45RzWERK', plays: '61万播放 · 2025-04', note: '万能公式：纯色上装+有设计感下装（或反过来）。', tags: ['原则'] },
  { id: 'hallo-tricks', platform: 'bilibili', creator: '哈喽先生的潮流社', title: '回头率飙升的小技巧原来在这', url: 'https://www.bilibili.com/video/BV1Xx4y127VC', plays: '207万播放 · 2024-03', note: '小配饰（袜子/帽/包）与衣服同色系，完成度暴涨。', tags: ['配饰'] },
  { id: 'bear-formula', platform: 'bilibili', creator: '熊先生Bear丶', title: '性张力穿搭公式！分分钟变成穿搭博主', url: 'https://www.bilibili.com/video/BV1NAgUeaEmc', plays: '79万播放 · 2024-06', note: '松紧对比：宽松上装+收口下装，或反之。', tags: ['原则'] },

  // ================= B站第二批（同批API验证） =================
  { id: 'luan-save', platform: 'bilibili', creator: '乱小世', title: '这些穿搭都救过男生的命吗？', url: 'https://www.bilibili.com/video/BV1xE1YBEEct', plays: '621万播放 · 2025-11', note: '播放量最高的男装内容之一：普通男生的穿搭改造合集。', tags: ['改造'] },
  { id: 'xiao-summer', platform: 'bilibili', creator: '晓观队长', title: '热死人，谁还穿搭啊！', url: 'https://www.bilibili.com/video/BV1MF411Q7DP', plays: '459万播放 · 2023-07', note: '夏天的省力穿搭方案：凉快与体面兼得。', tags: ['示范'] },
  { id: 'si-date5', platform: 'bilibili', creator: '思远glenindiv', title: '人渣和女生出去玩怎么穿（5）', url: 'https://www.bilibili.com/video/BV1HpAMznEKh', plays: '220万播放 · 2026-03', note: '约会场景穿搭系列，示范"干净+合身"的异性好感公式。', tags: ['约会'] },
  { id: 'dian-bf', platform: 'bilibili', creator: '颠点儿_', title: '「改造男友」听说男生初秋这么穿会更受欢迎哦~', url: 'https://www.bilibili.com/video/BV1eQ4y1k7sd', plays: '149万播放 · 2021-09', note: '女友视角的男友改造：初秋叠穿示范。', tags: ['改造'] },
  { id: 'fan-black', platform: 'bilibili', creator: '你的范爷阿', title: '当那个讨厌你穿一身黑的女友和你分手后，你的穿搭...', url: 'https://www.bilibili.com/video/BV1UKrjYMEPa', plays: '144万播放 · 2025-01', note: '全身黑怎么穿出花样：版型与配饰的变化空间。', tags: ['配色'] },
  { id: 'hallo-175', platform: 'bilibili', creator: '哈喽先生的潮流社', title: '175男生阳光少年感穿搭！', url: 'https://www.bilibili.com/video/BV1Xw411P7hT', plays: '131万播放 · 2023-11', note: '中等身高男生的少年感公式：浅色系+利落版型。', tags: ['示范'] },
  { id: 'daxiong-autumn', platform: 'bilibili', creator: '大雄小个子穿搭日记', title: '个子不高的男生，秋天的第一套来啦～', url: 'https://www.bilibili.com/video/BV1VN4y1o7Eq', plays: '114万播放 · 2023-08', note: '小个子秋季显高显白模板，不挑人。', tags: ['显高'] },
  { id: 'aeng-3step', platform: 'bilibili', creator: '阿衡要逆袭', title: '男生穿搭开挂技巧！简单3步让回头率暴涨', url: 'https://www.bilibili.com/video/BV1vZ9TYRE2X', plays: '107万播放 · 2025-02', note: '三步上手：换合身版型、统一色系、加一件配饰。', tags: ['技巧'] },
  { id: 'lu16-makeover', platform: 'bilibili', creator: '我是路十六', title: '爆改男粉丝·第四期', url: 'https://www.bilibili.com/video/BV1Mgw1zcEeE', plays: '93万播放 · 2026-03', note: '真实素人改造全过程，前后对比极直观。', tags: ['改造'] },
  { id: 'si-arm', platform: 'bilibili', creator: '思远glenindiv', title: '人渣和女生出去怎么穿 臂腿系穿搭', url: 'https://www.bilibili.com/video/BV1xQQ2YLE8C', plays: '93万播放 · 2025-03', note: '按身材优势选款：手臂/腿部有训练痕迹的强调型穿法。', tags: ['体型'] },
  { id: 'stone-suit', platform: 'bilibili', creator: '石头的穿衣报告', title: '瘦人撑不起来西装吗', url: 'https://www.bilibili.com/video/BV1wj421U7DC', plays: '90万播放 · 2024-03', note: '偏瘦体型穿西装的解法：垫肩、面料克重与合身度。', tags: ['体型', '正装'] },
  { id: 'stone-socks', platform: 'bilibili', creator: '石头的穿衣报告', title: '皮鞋配白袜，一穿一个不吱声', url: 'https://www.bilibili.com/video/BV1TK41147cS', plays: '102万播放 · 2023-12', note: '经典雷区：皮鞋该配什么袜子，什么场合白袜会翻车。', tags: ['避雷'] },
  { id: 'stone-summer', platform: 'bilibili', creator: '石头的穿衣报告', title: '夏季雷区单品榜首', url: 'https://www.bilibili.com/video/BV1dr421j7Sm', plays: '126万播放 · 2024-05', note: '夏天最容易穿丑的单品盘点，避雷清单。', tags: ['避雷'] },
  { id: 'shu-paris', platform: 'bilibili', creator: '叔本聪', title: '秋冬穿搭灵感｜在巴黎的一周都穿了啥', url: 'https://www.bilibili.com/video/BV1ee411X7dc', plays: '62万播放 · 2023-11', note: '旅拍向秋冬灵感，大地色与层次叠穿示范。', tags: ['示范'] },
  { id: 'shu-outer', platform: 'bilibili', creator: '叔本聪', title: '男生一周穿搭｜秋冬9套LOOK，舒适外套合辑', url: 'https://www.bilibili.com/video/BV1KP4y1H71B', plays: '54万播放 · 2021-12', note: '9套秋冬LOOK不重样，外套轮换模板。', tags: ['外套', '示范'] },
  { id: 'joe-ugly', platform: 'bilibili', creator: 'JOESPIRIT', title: '比你丑的人为什么可以比你帅气', url: 'https://www.bilibili.com/video/BV1QC4y197K7', plays: '65万播放 · 2023-12', note: '帅不靠脸靠完成度：发型、合身、整洁的复利。', tags: ['原则'] },
  { id: 'aliang-163', platform: 'bilibili', creator: '163的阿亮', title: '男生变帅的成本真的很低，当163的小个子男生学会穿搭', url: 'https://www.bilibili.com/video/BV14js2zsE1i', plays: '63万播放 · 2025-10', note: '163cm素人秋冬改造，显高思路全程可抄。', tags: ['显高', '改造'] },
  { id: 'chammy-normal', platform: 'bilibili', creator: '痴五安chammy', title: '长的一般就更要大大方方变帅！【普男逆袭秘籍】', url: 'https://www.bilibili.com/video/BV1XTyQByEim', plays: '53万播放 · 2025-11', note: '普通长相的逆袭路径：扬长避短+自信管理。', tags: ['心态'] },
  { id: 'chen-170', platform: 'bilibili', creator: '陈更新不常更新', title: '170男生穿搭｜夏季出游通勤的一周心动男友穿搭', url: 'https://www.bilibili.com/video/BV1qT421m7f2', plays: '52万播放 · 2024-04', note: '170男生一周七套：出游通勤两用模板。', tags: ['示范', '显高'] },
  { id: 'li-5step', platform: 'bilibili', creator: '超级里里', title: '男生从细节变帅教程！只需五步！学生党进', url: 'https://www.bilibili.com/video/BV1UT4y1u7vf', plays: '52万播放 · 2020-05', note: '不花钱变帅五步：毛发/皮肤/牙齿/穿搭/体味。', tags: ['仪容'] },
  { id: 'yian-date', platform: 'bilibili', creator: '伊恩轩呐', title: '普通男生约会穿搭从夯到拉', url: 'https://www.bilibili.com/video/BV1XpSfBLEe1', plays: '71万播放 · 2026-04', note: '约会穿搭正反对比点评，避雷+抄作业两用。', tags: ['约会'] },
  { id: 'curator-winter', platform: 'bilibili', creator: '馆长穿搭日记', title: '男生必学的秋冬穿搭技巧分享', url: 'https://www.bilibili.com/video/BV1hJxjesE23', plays: '76万播放 · 2024-09', note: '秋冬技巧合集，附优质男装店铺推荐。', tags: ['秋冬'] },
  { id: 'dandy-coat', platform: 'bilibili', creator: 'MrDandy胡榛', title: '柴斯特yyds！', url: 'https://www.bilibili.com/video/BV1j34y1m7QK', plays: '77万播放 · 2021-10', note: '柴斯特大衣（Chesterfield）的正式感穿法科普。', tags: ['外套', '正装'] },
  { id: 'qiao-hk', platform: 'bilibili', creator: 'Vintage乔修', title: '张国荣的港风穿搭，一辈子也不会过时？', url: 'https://www.bilibili.com/video/BV1J94y1P7BV', plays: '79万播放 · 2023-12', note: '港风复古穿搭拆解：宽肩西装、高腰裤与白背心。', tags: ['风格'] },

  // ================= B站近期热门（2025-09 之后发布，API验证） =================
  { id: 'bvr-sheep-legs', platform: 'bilibili', creator: '绵羊小众工坊', title: '腿型不好？那都不是事儿？', url: 'https://www.bilibili.com/video/BV1BxBBBYEVk', plays: '366万播放 · 2025-12', note: '腿型修正穿搭：O型腿/X型腿的版型解法。', tags: ['体型'] },
  { id: 'bvr-zong-coat', platform: 'bilibili', creator: '寻找的粽经理', title: '100-300元买大牌羽绒服？冬季有这期就够了！', url: 'https://www.bilibili.com/video/BV1MUCtBiEW1', plays: '117万播放 · 2025-11', note: '平价羽绒服好物清单，冬季保暖与体面兼得。', tags: ['好物'] },
  { id: 'bvr-chammy-1000', platform: 'bilibili', creator: '痴五安chammy', title: '当全世界穿搭能力下降1000倍……', url: 'https://www.bilibili.com/video/BV1YeKn6wEwm', plays: '53万播放 · 2026-07', note: '趣味设定下的穿搭科普：会穿的人到底强在哪。', tags: ['原则'] },
  { id: 'bvr-curator-tee', platform: 'bilibili', creator: '馆长穿搭日记', title: '避雷篇丨普通男生如何在网上买到高质量短袖', url: 'https://www.bilibili.com/video/BV1KPXSBEE6X', plays: '53万播放 · 2026-03', note: '短袖选购避雷：克重、领口工艺、版型怎么看。', tags: ['避雷'] },
  { id: 'bvr-chammy-swap', platform: 'bilibili', creator: '痴五安chammy', title: '让【180肌肉男】穿【165瘦子】的衣橱！改造系列回归', url: 'https://www.bilibili.com/video/BV17eh46XEqL', plays: '50万播放 · 2026-09', note: '同一堆衣服在不同身材上的效果对比，看版型如何改写比例。', tags: ['近期', '体型'] },
  { id: 'bvr-luoluo-pants', platform: 'bilibili', creator: '落落的穿搭笔记', title: '三年起步，五年能打！9条「长期主义」神裤！', url: 'https://www.bilibili.com/video/BV1pH9jBDEKk', plays: '26万播放 · 2026-04', note: '长期主义裤子清单：牛仔/工装/西裤怎么买得值。', tags: ['裤装'] },
  { id: 'bvr-tan-bag', platform: 'bilibili', creator: '谈徽中', title: '【包包推荐】5款宝藏双肩包！穿搭开挂神器！', url: 'https://www.bilibili.com/video/BV1NyJG68Enj', plays: '23万播放 · 2026-06', note: '双肩包推荐：通勤上学的配饰补全方案。', tags: ['配饰'] },
  { id: 'bvr-lu16-fit', platform: 'bilibili', creator: '我是路十六', title: '如何拥有梦幻身材？靠版型作弊的7套公式穿搭', url: 'https://www.bilibili.com/video/BV1ZUEe6GERj', plays: '19万播放 · 2026-06', note: '版型"作弊"：不练也能穿出身材比例的7套公式。', tags: ['原则'] },
  { id: 'bvr-dapei-date', platform: 'bilibili', creator: '大呸湿', title: '男生夏季约会穿搭指南！4大风格覆盖所有约会场景', url: 'https://www.bilibili.com/video/BV12VLD68Evr', plays: '19万播放 · 2026-06', note: '约会穿搭四风格模板：咖啡/西餐/户外/观影。', tags: ['约会'] },
  { id: 'bvr-chuan-qi', platform: 'bilibili', creator: '不会穿的川仔', title: '当我和我的165的兄弟发现，穿搭真的可以改变气质', url: 'https://www.bilibili.com/video/BV1x2T463Eyv', plays: '17万播放 · 2026-07', note: '165兄弟实测：穿搭对气质与身高的真实改变。', tags: ['显高'] },
  { id: 'bvr-curator-jacket', platform: 'bilibili', creator: '馆长穿搭日记', title: '普通男生听劝学习穿搭：春季必备薄外套分享', url: 'https://www.bilibili.com/video/BV141wXzJE1q', plays: '17万播放 · 2026-03', note: '2026春季薄外套盘点：低成本穿得帅气又自然。', tags: ['外套'] },

  // ================= YouTube（代理抓取验证，2026-09） =================
  { id: 'tmf-wardrobe', platform: 'youtube', creator: 'Teachingmensfashion', title: 'If I Was Starting A Wardrobe From Scratch, I\'d Buy This', url: 'https://www.youtube.com/watch?v=hbwlWsui_DI', plays: '37.2万播放 · 2024-11', note: '从零重建衣橱：优先高频基础款，用百搭中性色搭骨架。', tags: ['衣橱'] },
  { id: 'tmf-sneakers', platform: 'youtube', creator: 'Teachingmensfashion', title: 'How to Match Your Sneakers To Your Outfit', url: 'https://www.youtube.com/watch?v=dbtgHEX93k8', plays: '169万播放 · 2018-03', note: '球鞋配色与整体呼应；鞋型与裤脚的衔接比例；保持鞋干净。', tags: ['鞋履'] },
  { id: 'rmrs-master', platform: 'youtube', creator: 'Real Men Real Style', title: 'The Secret to Mastering Style in 2026', url: 'https://www.youtube.com/watch?v=R7d2pBC2iaE', plays: '11.6万播放 · 2024-11', note: '77分钟体系课：先认清体型与肤色，再用胶囊衣橱减少决策成本。', tags: ['体系'] },
  { id: 'rmrs-rules', platform: 'youtube', creator: 'Real Men Real Style', title: '10 Style Rules EVERY Man Should Know', url: 'https://www.youtube.com/watch?v=qCKVxGbZpMU', plays: '18.7万播放 · 2018-08', note: '十条不破例的铁律：合身第一、按场合着装、细节与仪容。', tags: ['原则'] },
  { id: 'og-improve', platform: 'youtube', creator: 'The Style O.G.', title: '11 EASY Ways To Improve Your Style', url: 'https://www.youtube.com/watch?v=a8LGxkma1dY', plays: '5万播放 · 2024-04', note: '不用换衣柜，11个低成本改进点：合身/整洁/配色/配饰。', tags: ['技巧'] },
  { id: 'og-never', platform: 'youtube', creator: 'The Style O.G.', title: '10 Things Stylish Guys NEVER WEAR', url: 'https://www.youtube.com/watch?v=sdMsI2U0fro', plays: '6.5万播放 · 2026-02', note: '廉价仿皮夹克、明显假货、廉价正装皮鞋毁全局——鞋决定基调。', tags: ['避雷'] },
  { id: 'hss-system', platform: 'youtube', creator: 'He Spoke Style', title: 'Why Most Men Fail at Style (And How This System Fixes It)', url: 'https://www.youtube.com/watch?v=xOMXqAI5H0k', plays: '2.1万播放 · 2026-05', note: '失败原因是零散买衣；围绕生活方式建立风格系统。', tags: ['体系'] },
  { id: 'ods-teen', platform: 'youtube', creator: 'One Dapper Street', title: 'Fashion Advice For Teens!', url: 'https://www.youtube.com/watch?v=ajNIyNCaFNY', plays: '10.5万播放 · 2019-02', note: '合身比名牌重要，从基础款开始建立个人风格。', tags: ['原则'] },
  { id: 'alpha-makeover', platform: 'youtube', creator: 'alpha m.', title: 'Alpha M Project Tony | A Men\'s Makeover Series', url: 'https://www.youtube.com/watch?v=BKWOtOOba-o', plays: '106万播放 · 2015-01', note: '经典改造案例：合身西装+发型+仪容+姿态的完整流程。', tags: ['改造'] },
  { id: 'cr-put', platform: 'youtube', creator: 'Courtney Ryan', title: 'How To Look More Put Together & Expensive', url: 'https://www.youtube.com/watch?v=IxQnabCr7G0', plays: '18.6万播放 · 2025-04', note: '"Buy nice or buy twice"；三分法则（上1/3下2/3）；鞋履三件套；保养即高级。', tags: ['原则', '质感'] },
  { id: 'stride-loafer', platform: 'youtube', creator: 'Stridewise', title: 'The 6 Best Loafers for Men Right Now', url: 'https://www.youtube.com/watch?v=InzGeyZDxmY', plays: '16万播放 · 2023-06', note: '按场景选乐福鞋：厚底休闲/正装/多用途；看皮质与鞋楦。', tags: ['鞋履'] },
  { id: 'antor-asian', platform: 'youtube', creator: 'StandoutWithAntor', title: 'Style Guide for Asian Men', url: 'https://www.youtube.com/watch?v=jzb1QeS5_f0', plays: '2.4万播放 · 2024-08', note: '先定 mood board 再买衣服；上浅下深显肩宽显高；裤长微短。', tags: ['亚洲男生'] },
  { id: 'tim-asian', platform: 'youtube', creator: 'Timothy Hu', title: 'how to improve your style as an asian guy', url: 'https://www.youtube.com/watch?v=9UO58cmDNbE', plays: '3.1万播放 · 2025-01', note: '韩系审美：同色系+材质差异做层次；all-black 对东亚人友好；好体态是地基。', tags: ['亚洲男生'] },

  // ================= YouTube 第二批（浏览器按播放量排序抓取，2026-09；亚洲审美向+经典法则） =================
  { id: 'yt2-wanhee-kr', platform: 'youtube', creator: 'Wanhee 완희', title: 'Why Koreans Dress Better (6 Fashion Tips)', url: 'https://www.youtube.com/watch?v=e2MgmGDLV9Q', plays: '211万播放 · 2024-07', note: '韩系为什么强：合身、配色克制、场合意识等 6 个习惯，最适合东亚男生参考。', tags: ['韩系', '亚洲审美'] },
  { id: 'yt2-wanhee-jp', platform: 'youtube', creator: 'Wanhee 완희', title: 'Why Japanese People Dress Better (5 Fashion Tips)', url: 'https://www.youtube.com/watch?v=B9PIhkSQKuw', plays: '113万播放 · 2025-01', note: '日系穿搭的 5 个底层思路：轮廓、材质、层次感。', tags: ['日系', '亚洲审美'] },
  { id: 'yt2-chengdu-street', platform: 'youtube', creator: 'chuchuwOo', title: 'Latest Korean, Japanese And Chinese Style Fashion — Street Fashion Chengdu', url: 'https://www.youtube.com/watch?v=2LSQqGUSQZc', plays: '91.9万播放 · 2021-10', note: '成都街拍实录：中日韩三种风格在中国年轻人身上的真实演绎。', tags: ['街拍', '亚洲审美'] },
  { id: 'yt2-dessaint-legs', platform: 'youtube', creator: 'Tim Dessaint', title: 'Things To AVOID Wearing If You Have Short Legs', url: 'https://www.youtube.com/watch?v=jFtgTD4vd_w', plays: '152万播放 · 2023-08', note: '腿短避雷：低腰、过长上衣、厚重鞋履等拉低比例的穿法。', tags: ['显高', '避雷'] },
  { id: 'yt2-dessaint-jewelry', platform: 'youtube', creator: 'Tim Dessaint', title: 'A Complete Guide To Wearing Jewelry For Men', url: 'https://www.youtube.com/watch?v=gc_W7FTEngU', plays: '165万播放 · 2021-03', note: '男士首饰完整指南：材质、数量、场合适配。', tags: ['配饰'] },
  { id: 'yt2-thecasual-jp', platform: 'youtube', creator: 'THE CASUAL', title: '10 MUST HAVE Japanese Fashion Essentials', url: 'https://www.youtube.com/watch?v=6JpVNjY7PWk', plays: '38万播放 · 2021-03', note: '日系必备 10 件：CityBoy 风格的基础单品清单。', tags: ['日系', '衣橱'] },
  { id: 'yt2-timothy-3styles', platform: 'youtube', creator: 'Timothy Hu', title: '3 Best Fashion Styles for Asian Men', url: 'https://www.youtube.com/watch?v=Mh9JmnJ5bxo', plays: '39.2万播放 · 2023-10', note: '亚洲男生三大风格路线：极简、韩系、街头的落地方法。', tags: ['亚洲审美', '风格'] },
  { id: 'yt2-kevin-hair', platform: 'youtube', creator: 'Kevin Chiang', title: 'Best hairstyles for east asian guys', url: 'https://www.youtube.com/watch?v=qPNdC0KN4Pc', plays: '37.1万播放 · 2024-02', note: '东亚男生发型趋势：脸型适配与日常打理。', tags: ['仪容', '亚洲审美'] },
  { id: 'yt2-devmoore-tokyo', platform: 'youtube', creator: 'Dev Moore', title: 'What Are People Wearing in Tokyo? (Street Style)', url: 'https://www.youtube.com/watch?v=U_TSdbk0A-Y', plays: '79.6万播放 · 2025-02', note: '东京街头实拍：当下日本年轻人的真实穿搭趋势。', tags: ['街拍', '日系'] },
  { id: 'yt2-rmrs-body', platform: 'youtube', creator: 'Real Men Real Style', title: 'How To Dress For Your Body Type', url: 'https://www.youtube.com/watch?v=GwfDE03lnus', plays: '1007万播放 · 2016-12', note: '按体型选版型：胖、瘦、高、矮各有修正方案。', tags: ['体型'] },
  { id: 'yt2-rmrs-tuck', platform: 'youtube', creator: 'Real Men Real Style', title: '4 Secrets To Keeping Your Shirt Tucked In ALL DAY', url: 'https://www.youtube.com/watch?v=BoEhmxYrN4A', plays: '2058万播放 · 2017-01', note: '衬衫塞法全教程：军装塞等技巧保持一整天不松。', tags: ['技巧'] },
  { id: 'yt2-rmrs-casual', platform: 'youtube', creator: 'Real Men Real Style', title: 'How To Dress Casually As An Adult Man', url: 'https://www.youtube.com/watch?v=s6v4kT1aD7c', plays: '390万播放 · 2022-08', note: '成年男性的休闲装：摆脱"学生感"的关键替换。', tags: ['原则'] },
  { id: 'yt2-casually-explained', platform: 'youtube', creator: 'Casually Explained', title: 'Casually Explained: Men\'s Fashion', url: 'https://www.youtube.com/watch?v=KyQyz2upSgY', plays: '984万播放 · 2018-03', note: '漫画式幽默讲解男士穿搭常识，入门必看的"世界观"视频。', tags: ['入门'] },
  { id: 'yt2-asiajackson-mistakes', platform: 'youtube', creator: 'Asia Jackson', title: 'How to Make Your Outfits Better (Avoid These Styling Mistakes!)', url: 'https://www.youtube.com/watch?v=klKVm1FALhs', plays: '725万播放 · 2023-05', note: '亚裔创作者总结的常见穿搭误区清单，逐条修正。', tags: ['避雷', '亚洲审美'] },
  { id: 'yt2-tomford-rules', platform: 'youtube', creator: 'MR PORTER', title: 'Tom Ford\'s Six Rules Of Style', url: 'https://www.youtube.com/watch?v=ghgW1PLXrc8', plays: '586万播放 · 2017-11', note: 'Tom Ford 的六条着装铁律：从剪裁到自信。', tags: ['原则'] },
  { id: 'yt2-doctormike-suit', platform: 'youtube', creator: 'Doctor Mike', title: 'How to Suit Up | Men\'s Fashion Tips', url: 'https://www.youtube.com/watch?v=-nTfrtzsup8', plays: '550万播放 · 2017-07', note: '西装正确穿法：合身、场合、细节三要素。', tags: ['正装'] },
  { id: 'yt2-ods-jeans', platform: 'youtube', creator: 'One Dapper Street', title: '10 Easy Ways to Style Jeans with T-Shirts', url: 'https://www.youtube.com/watch?v=-jGSNFt-6Ic', plays: '514万播放 · 2019-06', note: '牛仔裤×T恤的 10 种穿法：最基础的两件也能不重样。', tags: ['示范'] },
  { id: 'yt2-courtney-sexy', platform: 'youtube', creator: 'Courtney Ryan', title: 'The 9 Sexiest Things Men Wear According To Women', url: 'https://www.youtube.com/watch?v=3vUFP_Lwedk', plays: '483万播放 · 2022-06', note: '女性视角：最有魅力的 9 种男士单品与穿法。', tags: ['约会'] },
  { id: 'yt2-gazette-never', platform: 'youtube', creator: 'Gentleman\'s Gazette', title: '19 Things Men Should Never Wear', url: 'https://www.youtube.com/watch?v=KqAxHC_ewa4', plays: '448万播放 · 2017-10', note: '19 件男士避雷单品清单，附替换方案。', tags: ['避雷'] },
  { id: 'yt2-ashley-30', platform: 'youtube', creator: 'Mens Fashioner (Ashley Weston)', title: '11 Things Men Over 30 Should NEVER Wear', url: 'https://www.youtube.com/watch?v=F8_z53x-l9c', plays: '299万播放 · 2023-06', note: '轻熟龄男性避雷：哪些"年轻感"单品该退役。', tags: ['避雷'] },
  { id: 'yt2-speeed-effortless', platform: 'youtube', creator: 'Speeed', title: 'Dress better without trying harder', url: 'https://www.youtube.com/watch?v=_NXYpEMEZPc', plays: '360万播放 · 2025-03', note: '不费力的变帅思路：把"体系"搭好，穿搭自动升级。', tags: ['体系'] },
  { id: 'yt2-balfour-oldmoney', platform: 'youtube', creator: 'Brandon Balfour', title: 'How To Build An Old Money Aesthetic Wardrobe (Properly)', url: 'https://www.youtube.com/watch?v=eiLFqHYBLAI', plays: '268万播放 · 2023-07', note: '老钱风衣橱搭建：面料、配色、单品清单一次讲全。', tags: ['风格', '衣橱'] },
  { id: 'yt2-gq-iron', platform: 'youtube', creator: 'GQ', title: 'How to Iron a Dress Shirt in 90 Seconds', url: 'https://www.youtube.com/watch?v=z91MtZpcsKY', plays: '405万播放 · 2014-10', note: '90 秒熨好衬衫：保养是隐形的加分项。', tags: ['保养'] },

  // ================= Reddit（代理抓取验证） =================
  { id: 'mfa-basic', platform: 'reddit', creator: 'r/malefashionadvice', title: 'Building a Basic Wardrobe v6.0（经典基础衣橱指南）', url: 'https://www.reddit.com/r/malefashionadvice/comments/5da1xt/building_a_basic_wardrobe_v60', note: '别想一口气买齐；slim not skinny；肩线必须落肩点；基础色板清单。', tags: ['衣橱', '社区'] },
  { id: 'mfa-bastard', platform: 'reddit', creator: 'r/malefashionadvice', title: 'The Basic Bastard - Basic Wardrobe and Inspiration Album', url: 'https://www.reddit.com/r/malefashionadvice/comments/5da1dc/the_basic_bastard_basic_wardrobe_and_inspiration', note: '模块化基础衣橱：每件都能互搭；裤脚 half-break 或更短；附平价品牌清单。', tags: ['衣橱', '社区'] },
  { id: 'mfa-fit', platform: 'reddit', creator: 'r/malefashionadvice', title: 'How Should Clothes Fit（fit 手册）', url: 'https://www.reddit.com/r/malefashionadvice/comments/h0di0s/simple_concepts_for_dressing_better_how_should', note: '肩线/袖长/裤长/腰身的合身基本标准，社区传奇手册。', tags: ['社区'] },
  { id: 'mfa-guides', platform: 'reddit', creator: 'r/malefashionadvice', title: 'MFA 官方 Guides Wiki（色彩/fit/入门总目录）', url: 'https://www.reddit.com/r/malefashionadvice/wiki/guides', note: 'Understanding Colour 色彩指南与 Getting Started 总入口。', tags: ['社区'] },
  { id: 'mfa-v7', platform: 'reddit', creator: 'MFA Substack', title: 'Building A Basic Wardrobe v7.0（最新版）', url: 'https://malefashionadvice.substack.com/p/building-a-basic-wardrobe-v70', note: '面向完全新手的极简购物清单：先搞定"能体面出门"的最小集合。', tags: ['衣橱'] },

  // ================= 知乎（代理搜索+抓取验证，2026-09） =================
  { id: 'zhihu-8rules', platform: 'zhihu', creator: '他型', title: '男士穿衣的八大搭配原则', url: 'https://zhuanlan.zhihu.com/p/18257503710', note: '得体/量感/色彩/叠穿/体型/裤长/扬长避短八大原则系统讲全。', tags: ['原则'] },
  { id: 'zhihu-guide', platform: 'zhihu', creator: '我变成了一条狗', title: '男生穿搭攻略，全面版（4181赞）', url: 'https://zhuanlan.zhihu.com/p/97990746', note: '按肤色选色；衣长手腕上2-3cm；"衣短裤长≈显高"；全身不超三色。', tags: ['原则', '配色'] },
  { id: 'zhihu-learn', platform: 'zhihu', creator: '鱼落落（形象管理师）', title: '男生如何学会穿搭啊？（3669赞）', url: 'https://www.zhihu.com/tardis/bd/ans/2015500070', note: '学穿搭六步：肤色→体型→理论→参考同体型博主→基本款→细节；附肤色自测法。', tags: ['方法论'] },
  { id: 'zhihu-styles', platform: 'zhihu', creator: '饭饭帮你搭衣服', title: '6种最受欢迎的男生穿搭风格', url: 'https://zhuanlan.zhihu.com/p/434723910', note: '韩系/日系/轻熟/户外/工装/街头六种风格适配人群拆解。', tags: ['风格'] },
  { id: 'zhihu-basics', platform: 'zhihu', creator: '知乎问题', title: '男生应该有的基础款衣服有哪些？', url: 'https://www.zhihu.com/question/22332133', note: '高赞基础款清单合集：T恤/衬衫/牛仔/鞋履入门必买列表。', tags: ['衣橱'] },
  { id: 'zhihu-layer', platform: 'zhihu', creator: '知乎专栏', title: '男士穿搭之叠穿大法，注意这5点', url: 'https://zhuanlan.zhihu.com/p/904393668', note: '内层最薄最紧、外层最厚最松；秋冬层次感五个注意点。', tags: ['技巧'] },
  { id: 'zhihu-q-system', platform: 'zhihu', creator: '知乎问题', title: '男士该如何基础而系统地学习服装搭配？', url: 'https://www.zhihu.com/question/27079859', note: '知乎男装领域经典问题，系统学习方法论讨论合集。', tags: ['方法论'] },
  { id: 'zhihu-q-taste', platform: 'zhihu', creator: '知乎问题', title: '男生怎么穿搭提升衣品？', url: 'https://www.zhihu.com/question/66193903', note: '从身材、色彩、版型角度系统讨论提升衣品的高赞合集。', tags: ['衣品'] },
  { id: 'zhihu-q-ankle', platform: 'zhihu', creator: '知乎问题', title: '男生怎么穿露脚踝的裤子？', url: 'https://www.zhihu.com/question/35616642', note: '露脚踝穿法与裤长选择的专题讨论。', tags: ['裤装'] },

  // ================= 少数派 =================
  { id: 'sspai-basic', platform: 'sspai', creator: 'Dav1d', title: '男性基础穿搭指南', url: 'https://sspai.com/post/98276', note: '宽松>紧身；黑白永不出错；拒绝LOGO堆积；别为身高盲目厚底鞋。', tags: ['原则'] },
  { id: 'sspai-autumn', platform: 'sspai', creator: '少数派作者', title: '我的男装穿搭策略（初秋版）', url: 'https://sspai.com/post/102686', note: '三大误区：拘泥单一风格/拘泥黑白灰/假长期主义；外套按厚度分层买。', tags: ['方法论'] },
  { id: 'sspai-fabric', platform: 'sspai', creator: '书藏', title: '关于衣服我们需要学习的：面料和男装分类', url: 'https://sspai.com/post/63912', note: '天然纤维vs化纤的面料知识体系，选衣服先看面料。', tags: ['面料'] },
  { id: 'sspai-1111', platform: 'sspai', creator: '少数派作者', title: '我的双十一男装清单：从基础大牌到私藏好店', url: 'https://sspai.com/post/103360', note: '男装购物清单参考：基础大牌与私藏店铺。', tags: ['店铺'] },

  // ================= 虎扑 =================
  { id: 'hupu-summer', platform: 'hupu', creator: '朝阳餐厅', title: '男生夏天穿搭的一点想法和建议', url: 'https://bbs.hupu.com/638468431.html', note: '可量化尺寸公式：正肩=肩宽+2~3cm，合身=胸围+6~8cm，衣长=身高×0.41。', tags: ['技巧'] },
  { id: 'hupu-clean', platform: 'hupu', creator: '追云者z', title: '男生穿搭，简单干净就够了', url: 'https://bbs.hupu.com/630400456.html', note: '潮流区1.6万阅读晒图帖："简单干净"是最大公约数审美。', tags: ['示范'] },
  { id: 'hupu-ding', platform: 'hupu', creator: '虎扑步行街', title: '朋友说，虎扑都是顶男穿搭，让我发穿搭给大家看看', url: 'https://bbs.hupu.com/56765738.html', note: '虎扑"顶男穿搭"晒装文化一线样本，评论区即真实反馈。', tags: ['示范'] },

  // ================= 豆瓣 =================
  { id: 'douban-style', platform: 'douban', creator: '衣澄嘉人', title: '男生如何找到适合自己的穿搭风格？', url: 'https://www.douban.com/note/703087672/', note: '先建立理论框架，再按个人情况落地；不存在万能答案。', tags: ['方法论'] },
  { id: 'douban-capsule', platform: 'douban', creator: 'Lynn', title: '极简｜男士胶囊衣橱－冬', url: 'https://www.douban.com/note/608529327/', note: '冬季男士胶囊衣橱清单式记录，极简主义思路。', tags: ['衣橱'] },
  { id: 'douban-mine', platform: 'douban', creator: '小组「男生穿搭终极指南」', title: '男生的日常穿搭指南，你成功避开雷区了吗？', url: 'https://www.douban.com/group/topic/170072277/', note: '穿搭雷区盘点帖，反面案例教学。', tags: ['避雷'] },
  { id: 'douban-topic', platform: 'douban', creator: '豆瓣话题', title: '男生穿搭指南（站方聚合话题）', url: 'https://www.douban.com/gallery/topic/81137/', note: '豆瓣男生穿搭相关日记与帖子的聚合入口，可翻出大量真实素人示范。', tags: ['示范'] },

  // ================= 抖音（2026-10-18 经 aweme/detail 接口实测点赞与发布日期） =================
  { id: 'douyin-capsule', platform: 'douyin', creator: '小宇子酱', title: '30s讲清楚男生胶囊衣橱需要哪些衣服', url: 'https://www.douyin.com/video/7466389790401776908', plays: '3464赞 · 2025-02', note: '男生胶囊衣橱≈30件单品覆盖日常，基础款重质量与剪裁。', tags: ['衣橱'] },
  { id: 'douyin-3color', platform: 'douyin', creator: '西安优伲西服定制', title: '三色原则：正装全身颜色不超过三种', url: 'https://www.douyin.com/note/7347919918056197426', plays: '8赞 · 2024-03', note: '正装场合三色原则的短视频科普。', tags: ['配色'] },

  // ================= 抖音第二批（2026-10-18 实测：点赞 1.9万~58.2万，发布日期已回填） =================
  { id: 'dy-daxiong-30s', platform: 'douyin', creator: '大雄小个子穿搭日记', title: '夏季穿搭30秒网课，安排上了！', url: 'https://www.douyin.com/video/6951375638968175885', plays: '58.2万赞 · 2021-04', note: '30秒讲清一个显高心机：小个子的"心机boy"公式。', tags: ['显高', '夏季'] },
  { id: 'dy-qingshan-crush', platform: 'douyin', creator: '青衫', title: '过年回家要见一年没见的crush了，哪套合适', url: 'https://www.douyin.com/video/7601453598341839589', plays: '20.5万赞 · 2026-01', note: '约会/回村场景选套思路：场景匹配 > 单纯好看。', tags: ['约会'] },
  { id: 'dy-levi-170', platform: 'douyin', creator: '乐仔Levi', title: '170秒变180！小土豆直接变薯条', url: 'https://www.douyin.com/video/7323933583138245925', plays: '17.7万赞 · 2024-01', note: '170+显高改造：发型、比例、穿搭三板斧。', tags: ['显高', '改造'] },
  { id: 'dy-shen-top', platform: 'douyin', creator: '沈', title: '顶帅男都这么穿', url: 'https://www.douyin.com/video/7594374529079214507', plays: '15.4万赞 · 2026-01', note: '"顶帅"审美拆解：干净、合身、有细节。', tags: ['风格', '示范'] },
  { id: 'dy-jiangye-hla', platform: 'douyin', creator: '江野.', title: '人夫感还得是海澜之家', url: 'https://www.douyin.com/video/7688759267881155182', plays: '27.7万赞 · 2026-09', note: '秋冬"人夫感"穿搭：基础品牌穿出温和体面。', tags: ['秋冬', '风格'] },
  { id: 'dy-boolon-autumn', platform: 'douyin', creator: 'Boolon', title: '这个秋天我将这样穿', url: 'https://www.douyin.com/video/7666767135759029361', plays: '12.8万赞 · 2026-07', note: '秋季通勤穿搭：变装形式示范整套思路。', tags: ['通勤', '秋季'] },
  { id: 'dy-zhiao-color', platform: 'douyin', creator: '支奥赵', title: '男生穿搭是不是多一点点彩色点缀就行', url: 'https://www.douyin.com/video/7606324575085090553', plays: '6.9万赞 · 2026-02', note: '中性色基础上加一点彩色点缀的正确方式。', tags: ['配色'] },
  { id: 'dy-levi-score', platform: 'douyin', creator: '乐仔Levi', title: '男生会穿搭，真的很加分！', url: 'https://www.douyin.com/video/7310544610353237275', plays: '6万赞 · 2023-12', note: '同一人不同穿法对比：穿搭带来的加分直观可见。', tags: ['原则'] },
  { id: 'dy-levi-formula', platform: 'douyin', creator: '乐仔Levi', title: '小白必学穿搭公式！一看就会', url: 'https://www.douyin.com/video/7112401678426541320', plays: '5.7万赞 · 2022-06', note: '新手公式：颜色不过三 + 上下呼应 + 合身。', tags: ['原则'] },
  { id: 'dy-hahulu', platform: 'douyin', creator: '哈呼噜', title: '男生如何通过穿搭变小帅', url: 'https://www.douyin.com/video/7594811941857416571', plays: '4.7万赞 · 2026-01', note: '变帅路径：从版型到配色的高级感改造。', tags: ['改造'] },
  { id: 'dy-jiang-skills', platform: 'douyin', creator: '姜春琳.', title: '男生穿搭的技巧', url: 'https://www.douyin.com/video/7597775237069276038', plays: '4.5万赞 · 2026-01', note: '男生穿搭技巧合集，基础向干货。', tags: ['技巧'] },
  { id: 'dy-levi-dog', platform: 'douyin', creator: '乐仔Levi', title: '别再让男朋友穿的像土狗了！', url: 'https://www.douyin.com/video/7149143715204893983', plays: '4.1万赞 · 2022-09', note: '基础穿搭避雷：土味穿法对照修正。', tags: ['避雷'] },
  { id: 'dy-dalishu-summer', platform: 'douyin', creator: '大李叔说复古', title: '男生夏季只需要这五种单品', url: 'https://www.douyin.com/video/7098894088392543502', plays: '4.1万赞 · 2022-05', note: '夏季五件单品应对整季：极简衣橱思路。', tags: ['夏季', '衣橱'] },
  { id: 'dy-wubai-fake', platform: 'douyin', creator: '吴白Alex', title: '上身很痞帅的假两件，自带领带满满学院感', url: 'https://www.douyin.com/video/7594126338660295035', plays: '2.9万赞 · 2026-01', note: '假两件/领带的雅痞学院风单品玩法。', tags: ['单品', '风格'] },
  { id: 'dy-amz-ai', platform: 'douyin', creator: '啊吗粽', title: 'AI帮我搭配约会穿搭！', url: 'https://www.douyin.com/video/7593685765461134602', plays: '2.7万赞 · 2026-01', note: '用 AI 工具辅助搭配的趣味实测，约会场景参考。', tags: ['约会', '技巧'] },
  { id: 'dy-levi-summer', platform: 'douyin', creator: '乐仔Levi', title: '身高身材可以输，但是穿搭不行！', url: 'https://www.douyin.com/video/7385867246238715199', plays: '2.4万赞 · 2024-06', note: '夏天真的一穿就帅的搭配思路。', tags: ['夏季'] },
  { id: 'dy-san-summer', platform: 'douyin', creator: '叁日记', title: '男生夏天怎么穿不单调', url: 'https://www.douyin.com/video/7114240255678549285', plays: '1.9万赞 · 2022-06', note: '日潮风格：几套不同风格的夏天搭配。', tags: ['日潮', '夏季'] },
  { id: 'dy-ba-youzi', platform: 'douyin', creator: '一起扒柚子（178）', title: '男生早春cleanfit风穿搭', url: 'https://www.douyin.com/video/7604487280955613297', plays: '1.9万赞 · 2026-02', note: 'Clean Fit 入门：178男生的春季模板。', tags: ['风格', '春季'] },

  // ================= 小红书（登录后实测抓取，2026-09，均点赞1000+） =================
  { id: 'xhs-star-wardrobe', platform: 'xiaohongshu', creator: '星动研究所', title: '原来改变一个男生的衣柜只需要四年', url: 'https://www.xiaohongshu.com/explore/6a8acae40000000014026a34?xsec_token=AByuO7LskaV5Q9xfDnvZzdBBihEJXQd2JnCWe3E2XXPCM=&xsec_source=pc_search', plays: '3.4万赞 · 2026-08', note: '四年衣橱进化实录：从乱买到体系化的全过程示范。', tags: ['衣橱'] },
  { id: 'xhs-xie-trick', platform: 'xiaohongshu', creator: '蟹煲', title: '上课！穿搭障眼法（二）', url: 'https://www.xiaohongshu.com/explore/6a2d1fd30000000015027343?xsec_token=ABPpCqn0RUa5MP7xgY659_G-2h-qd0r51gNLJsR8jCzGU=&xsec_source=pc_search', plays: '5708赞 · 2026-06', note: '视觉修正技巧：用搭配"障眼法"弥补身材小短板。', tags: ['技巧'] },
  { id: 'xhs-charlie-date', platform: 'xiaohongshu', creator: '查理沧叶', title: '健身约会两不误穿搭', url: 'https://www.xiaohongshu.com/explore/69032ef60000000005012db0?xsec_token=ABka5SanZQ3is-ARPx32xSO46u8YO_YWyBES4t8IjbGr4=&xsec_source=pc_search', plays: '5493赞 · 2025-10', note: '有训练痕迹的男生约会穿法：强调臂肩线条的选款。', tags: ['约会', '体型'] },
  { id: 'xhs-haha-han', platform: 'xiaohongshu', creator: '哈哈怪', title: '一周韩系穿搭分享', url: 'https://www.xiaohongshu.com/explore/69228921000000001e038570?xsec_token=ABUvVWJj6_aCT0ioAKkVrzYfCMWY_gmsbhVDYqr8WGIEM=&xsec_source=pc_search', plays: '5150赞 · 2025-11', note: '韩系一周不重样模板：宽松上衣+干净配色。', tags: ['示范', '风格'] },
  { id: 'xhs-chuan-winter', platform: 'xiaohongshu', creator: '小小川同学', title: '冬季穿搭合集｜9套"少年感"色彩搭配', url: 'https://www.xiaohongshu.com/explore/692acf54000000001e0058d1?xsec_token=ABPAxS8X7nu3EMy6fL_XtD9sDEV6HKMKYU0DQKBqdfifU=&xsec_source=pc_search', plays: '4613赞 · 2025-11', note: '少年感配色公式：低饱和打底 + 一件提亮单品。', tags: ['配色', '冬季'] },
  { id: 'xhs-liu-2026', platform: 'xiaohongshu', creator: '小刘六四分', title: '我的2026穿搭合集第一弹', url: 'https://www.xiaohongshu.com/explore/69680c2e0000000022030047?xsec_token=ABfaV7h81VXeIZJdYPoADonNzJM-H8Fw2n-e56-3o4z10=&xsec_source=pc_search', plays: '4244赞 · 2026-01', note: '年度穿搭合集，通勤/出游多场景覆盖。', tags: ['示范'] },
  { id: 'xhs-oneline-summer', platform: 'xiaohongshu', creator: '0n1ine', title: '一周穿搭合集｜夏季穿搭', url: 'https://www.xiaohongshu.com/explore/69fdfbfe0000000035028e92?xsec_token=ABzZLwqBGVqLNlWw0pihQo55y34ZO64OyfdkDBO6FBcPs=&xsec_source=pc_search', plays: '3528赞 · 2026-05', note: '夏季一周模板：极简单品高复用率穿法。', tags: ['示范', '夏季'] },
  { id: 'xhs-rare-formula', platform: 'xiaohongshu', creator: '稀有生物', title: '普通人穿搭吃建模？试试这套万能穿搭公式', url: 'https://www.xiaohongshu.com/explore/6974a9b3000000000e00f52e?xsec_token=AB02x8PW8XZSWCj4lCUmQwX3tVNoLbnoyTNa0ai58eAnY=&xsec_source=pc_search', plays: '3621赞 · 2026-01', note: '万能公式：基础款 × 统一色系 × 一件焦点单品。', tags: ['原则'] },
  { id: 'xhs-chi-darkskin', platform: 'xiaohongshu', creator: '鸡胸Killer', title: '6套秋冬穿衣｜黄黑皮男友干净风模版', url: 'https://www.xiaohongshu.com/explore/69199fc6000000000d0374ff?xsec_token=ABhRYfoJNsWe5eL7X7bdsKmktCAr4EC1ZkE89t1lRFVRw=&xsec_source=pc_search', plays: '3285赞 · 2025-11', note: '黄黑皮友好：藏青/大地色/燕麦色的干净风模板。', tags: ['配色', '冬季'] },
  { id: 'xhs-xing-summer', platform: 'xiaohongshu', creator: '星⭐', title: '男生夏日松弛感穿搭合集✨少年感直接拉满', url: 'https://www.xiaohongshu.com/explore/6a0a6e63000000000702351c?xsec_token=ABOL_nmqxWhPR2XbRYnYqt0WmshoyWvdK6hzIz1hmtZCo=&xsec_source=pc_search', plays: '2856赞 · 2026-05', note: '夏日松弛感：oversize 上衣 × 利落下装的对比。', tags: ['夏季'] },
  { id: 'xhs-yi-168', platform: 'xiaohongshu', creator: '小易玩穿搭', title: '谁说168小个子男生难穿搭❓显高干货必看', url: 'https://www.xiaohongshu.com/explore/6a0ad7640000000007027f75?xsec_token=ABOL_nmqxWhPR2XbRYnYqt0bRIlWa1EhUanVKze0AKLpo=&xsec_source=pc_search', plays: '2951赞 · 2026-05', note: '168显高干货：高腰线、同色系、短上衣三件套思路。', tags: ['显高'] },
  { id: 'xhs-soete-autumn', platform: 'xiaohongshu', creator: 'Soete', title: '为早秋准备的七套顶级/优雅/氛围感穿搭合集', url: 'https://www.xiaohongshu.com/explore/68f0c5c60000000005011431?xsec_token=ABZQDgxiWr3LK38KfEQgfw4i656YdfLNZ6XEpDf7vOYvM=&xsec_source=pc_search', plays: '2799赞 · 2025-10', note: '早秋氛围感七套：叠穿层次与质感面料示范。', tags: ['秋冬', '示范'] },
  { id: 'xhs-r-sweater', platform: 'xiaohongshu', creator: '小R同学', title: 'OOTD｜简单干净的毛衣穿搭合集', url: 'https://www.xiaohongshu.com/explore/68da5260000000001203c5b5?xsec_token=ABsGpsXTeMpqqUK-I9iC42qyLvR6Te8q8p7XnZcizxfMY=&xsec_source=pc_search', plays: '2757赞 · 2025-09', note: '毛衣穿搭合集：燕麦/灰/藏青的干净穿法。', tags: ['秋冬'] },
  { id: 'xhs-timon-uniqlo', platform: 'xiaohongshu', creator: '张满Timon', title: '这竟然是优衣库❓黑白灰真的太高级了‼️', url: 'https://www.xiaohongshu.com/explore/68db9efa000000000301e75c?xsec_token=ABNwJmNNreA6XlBiLl5gFQ2sVcmd5enmm6VSBHXUmdT7w=&xsec_source=pc_search', plays: '2544赞 · 2025-09', note: '平价高级感：优衣库黑白灰全靠版型与层次。', tags: ['配色', '平价'] },
  { id: 'xhs-nanase-summer', platform: 'xiaohongshu', creator: 'Nanase', title: '攒了很久的夏季穿搭合集！！！', url: 'https://www.xiaohongshu.com/explore/6a05d2d3000000003502f624?xsec_token=AB3l9-D0VrCVybk4nOvsH06JZjQ99NSN3NUugq2xC7Vc8=&xsec_source=pc_search', plays: '2181赞 · 2026-05', note: '夏季合集：短裤/短袖的清爽搭配索引。', tags: ['夏季'] },
  { id: 'xhs-ren-zerobarrier', platform: 'xiaohongshu', creator: '男生穿搭达人', title: '男生穿搭零门槛，每套都好看到失语！', url: 'https://www.xiaohongshu.com/explore/69db25c6000000001b002fe2?xsec_token=ABvVVIbtSOaD1IVbLUGfsQUCFaa5F76Yc5ULmZcL3NWuA=&xsec_source=pc_search', plays: '2015赞 · 2026-04', note: '零门槛套装示范，纯照抄向。', tags: ['示范'] },
  { id: 'xhs-da-lifetime', platform: 'xiaohongshu', creator: '搭搭慢点跑', title: '男生一辈子需要多少件衣服？！', url: 'https://www.xiaohongshu.com/explore/6a86c9a40000000025004122?xsec_token=ABpWKwbpP5s13kHU8mbgk4ykLYCTt2Rb-nnOMPqmgRvk0=&xsec_source=pc_search', plays: '1802赞 · 2026-08', note: '极简衣橱思考：真正高频的单品清单。', tags: ['衣橱'] },
  { id: 'xhs-chen-layer', platform: 'xiaohongshu', creator: '陳晨', title: '已经开始期待秋冬怎么穿了（叠穿篇）', url: 'https://www.xiaohongshu.com/explore/6a71bb7f0000000028008b4f?xsec_token=ABfYEg_0f2hKjlC-N4uXCwGON9-RqLHoOHq2TlLxX18-E=&xsec_source=pc_search', plays: '1512赞 · 2026-08', note: '叠穿实操：内薄外厚、领口层次怎么处理。', tags: ['叠穿', '秋冬'] },
  { id: 'xhs-tang-summer', platform: 'xiaohongshu', creator: '汤泡饭', title: '男生夏季一周穿搭分享丨无脑抄作业', url: 'https://www.xiaohongshu.com/explore/69e21bb1000000001d01bf5d?xsec_token=ABC4aLf5uhTzvY8u9IPES2LQAbSSt6oV6L5FG9PuT6NnY=&xsec_source=pc_search', plays: '1290赞 · 2026-04', note: '夏季一周"无脑抄作业"模板。', tags: ['夏季', '示范'] },
  { id: 'xhs-chi-12styles', platform: 'xiaohongshu', creator: '炽野（穿搭色彩思路）', title: '12种顶男穿搭风格｜男生干货必看‼️', url: 'https://www.xiaohongshu.com/explore/69c883a40000000023017989?xsec_token=ABuVgYDV1Wltv3I3o1T1WAFhrfVgnhx_IVN2_b1tIfZhw=&xsec_source=pc_search', plays: '1216赞 · 2026-03', note: '12种风格图鉴：从老钱风到 CityBoy 一次看全。', tags: ['风格'] },

  // ================= 小红书近期热门（2025-09 之后发布，登录态抓取） =================
  { id: 'xhsr-jiahwen-hair', platform: 'xiaohongshu', creator: '长沙男生发型设计张嘉文', title: '不要再找了，男生一共就这六款发型可以碰', url: 'https://www.xiaohongshu.com/explore/68ee11c10000000007001ed8?xsec_token=AB07pqJMjMtMqaSQXBRFOuvgaK1wc635-b3j_lw4NM_x0=&xsec_source=pc_search', plays: '7064赞 · 2025-10', note: '男生发型六款图鉴：按脸型对号入座。', tags: ['仪容'] },
  { id: 'xhsr-santong-winter', platform: 'xiaohongshu', creator: '仨桶水', title: '宝宝 一起预习一下秋冬穿搭', url: 'https://www.xiaohongshu.com/explore/6a6dcf26000000003303004f?xsec_token=AB3H95GCW8Vv8HsKTmbDZi8ueN69CGfTFfTFGecSmbvsQ=&xsec_source=pc_search', plays: '5396赞 · 2026-08', note: '本季秋冬搭配预习清单：提前把层次和配色想好。', tags: ['近期', '秋冬'] },
  { id: 'xhsr-ache-skincare', platform: 'xiaohongshu', creator: '阿澈闲养记', title: '男生把脸养白只需一个月，就靠这几点', url: 'https://www.xiaohongshu.com/explore/6a71d1540000000028032901?xsec_token=ABfYEg_0f2hKjlC-N4uXCwGBkReVVUUb7mHZzmZXItL1E=&xsec_source=pc_search', plays: '3133赞 · 2026-08', note: '护肤习惯养成：穿搭之外的第二张名片。', tags: ['近期', '仪容'] },
  { id: 'xhsr-maomao-16', platform: 'xiaohongshu', creator: '毛毛同学', title: '男生要变好看，这16件小事坚持下来变化明显', url: 'https://www.xiaohongshu.com/explore/69f5e6670000000023017d51?xsec_token=ABJSrmRlpItaeTEdUbR4fC6-j_uD4X9-GiRTmT5SFjJhc=&xsec_source=pc_search', plays: '2381赞 · 2026-05', note: '变好看清单：仪容/体态/习惯的16件小事。', tags: ['仪容'] },
  { id: 'xhsr-levi-upgrade', platform: 'xiaohongshu', creator: '乐仔Levi', title: '视频长归长，但看完包能逆袭成功！', url: 'https://www.xiaohongshu.com/explore/69fb2b5e000000003502baaf?xsec_token=ABDc0OUh3EzSa8WvEqdbN-GqU1kkOCbNWZ-VZJgMkM-pg=&xsec_source=pc_search', plays: '3259赞 · 2026-05', note: '长视频逆袭教程：从头到脚的改造路径。', tags: ['改造'] },
  { id: 'xhsr-xianyu-poise', platform: 'xiaohongshu', creator: '咸鱼。', title: '男生如何摆脱猥琐感（经验分享）', url: 'https://www.xiaohongshu.com/explore/69b7d45d000000001d01b034?xsec_token=ABz2gxjlCNI5iyulqhSpWaC8sRMtD33aLzYQlLqrUYCFg=&xsec_source=pc_search', plays: '1895赞 · 2026-03', note: '体态与气质管理：站姿、眼神、表情的练习。', tags: ['体态'] },
  { id: 'xhsr-snoopy-upgrade', platform: 'xiaohongshu', creator: '上进的Snoopy', title: '男生变帅思路实操版', url: 'https://www.xiaohongshu.com/explore/69d7708b000000001d01f039?xsec_token=ABh1BCOwaiPsfSHHP3_eZ1PMCMM3xrlYjX1-VvPJX09a4=&xsec_source=pc_search', plays: '1857赞 · 2026-04', note: '变帅思路落地：发型/穿搭/仪容的执行顺序。', tags: ['改造'] },
  { id: 'xhsr-pailaemeng-cardigan', platform: 'xiaohongshu', creator: '派拉萌穿搭', title: 'OOTD｜谁懂啊，这件燕麦色开衫真的好温柔', url: 'https://www.xiaohongshu.com/explore/69c7553b000000002301730b?xsec_token=ABUEc78k_0l2w9oUCogwPEaTqyla0hqAtVaRXw6Y36aBw=&xsec_source=pc_search', plays: '1841赞 · 2026-03', note: '燕麦色开衫穿搭：温柔感单品的上身体范。', tags: ['示范'] },
  { id: 'xhsr-caicai-week', platform: 'xiaohongshu', creator: '蔡蔡不会穿', title: '一周穿搭不重样来啦！！！', url: 'https://www.xiaohongshu.com/explore/6982bbe5000000002801e3f9?xsec_token=ABDbRoxIu1LZbNaJRKQgV_7zG_Bc-tdpF6NwZrUhmHk5s=&xsec_source=pc_search', plays: '1481赞 · 2026-02', note: '一周穿搭不重样模板，基础款高复用。', tags: ['示范'] },
  { id: 'xhsr-pidan-170', platform: 'xiaohongshu', creator: '173的皮蛋', title: '建议170男生直接抄作业、秋冬这么穿帅的很', url: 'https://www.xiaohongshu.com/explore/68e7865a0000000007035ed4?xsec_token=ABYTv-Bb2I0U_BcR8pO5Vjgxl192ZaxGcNLU3-YipJraI=&xsec_source=pc_search', plays: '1332赞 · 2025-10', note: '170男生秋冬抄作业模板。', tags: ['显高'] },

  // ================= 其他平台 =================
  { id: 'web-colorsohu', platform: 'web', creator: '男神颜习社', title: '是上深下浅，还是下浅上深？论色彩搭配对男生颜值的重要性', url: 'https://www.sohu.com/a/484793193_120753247', note: '色彩呼应（白T+黑裤+白鞋）；同色系=明度差不是套装；点亮色缩小面积。', tags: ['配色'] },
  { id: 'web-ankle', platform: 'web', creator: 'FashionRadio（新浪时尚）', title: '卷裤腿露脚踝 这样才性感', url: 'https://fashion.sina.com.cn/zl/fashion/2015-04-20/14503353.shtml', note: '裤脚不堆积=有品位；直卷/别针卷/单折/吊脚四种卷法对应不同裤鞋。', tags: ['技巧'] },
  { id: 'web-xhs-bjting', platform: 'web', creator: '草叔BiBi机（网易）', title: '白敬亭「氛围感」穿搭拆解（小红书方法论）', url: 'https://www.163.com/dy/article/GJSTAS9I0518DAVF.html', note: '同色系帽子/T恤+合身直筒牛仔；西装可以配sneaker。', tags: ['示范'] },
  { id: 'web-xhs-eco', platform: 'web', creator: '电商在线（搜狐）', title: '他在小红书分享男性穿搭，粉丝买爆了他的淘宝店', url: 'https://news.sohu.com/a/566543456_197955', note: '小红书男士穿搭生态："盐系穿搭"=低饱和色+版型优秀的基础款。', tags: ['风格'] },
  { id: 'web-dushaofei', platform: 'web', creator: '杜绍斐 DUSHAOFEI', title: '《有斐 Basic：男士基本款》对谈转载：要想俏一身儿皂', url: 'https://www.sohu.com/a/272637195_281966', note: '知名男装公众号主理人：黑白灰是最保险的直男穿法，含蓄耐看。', tags: ['配色', '衣橱'] },
  { id: 'web-fat', platform: 'web', creator: '搜狐时尚', title: '微胖男生显瘦穿搭术，掌握这3招遮肉技巧', url: 'https://www.sohu.com/a/496937920_121242134', note: '微胖身材：上下同色淡化腰线、硬挺面料、直筒剪裁遮肉。', tags: ['体型'] },
  { id: 'web-tuzu', platform: 'web', creator: '澎湃新闻', title: '穿得越土越开心，10万人在豆瓣小组反时尚', url: 'https://www.thepaper.cn/newsDetail_forward_14359414', note: '"土味穿搭践行者"小组报道：穿搭的另一种解压思路——不焦虑也是穿衣哲学。', tags: ['心态'] },
]

export const SOURCE_STATUS = {
  verified: { label: '已验证', tone: 'ok' },
  'token-risk': { label: '凭证可能失效', tone: 'warn' },
  restricted: { label: '访问受限', tone: 'warn' },
  invalid: { label: '链接失效', tone: 'bad' },
  error: { label: '检测异常', tone: 'warn' },
  unchecked: { label: '待验证', tone: 'muted' },
}

export const PERSPECTIVE_TYPES = {
  principle: '通用原则',
  style: '特定风格观点',
  subjective: '主观审美',
}

const PRINCIPLE_TAGS = new Set(['原则', '体系', '技巧', '避雷', '衣橱', '裤装', '鞋履', '显高', '体型'])
const STYLE_TAGS = new Set(['风格', '示范', '配色', '约会', '通勤', '夏季', '秋冬', '外套', '叠穿'])

const inferPublishedAt = (source) => source.publishedAt || source.plays?.match(/20\d{2}-\d{2}/)?.[0] || null
const inferPerspective = (source) => {
  if (source.perspective) return source.perspective
  if (source.tags?.some((tag) => PRINCIPLE_TAGS.has(tag))) return 'principle'
  if (source.tags?.some((tag) => STYLE_TAGS.has(tag))) return 'style'
  return 'subjective'
}

export const SOURCES = RAW_SOURCES.map((source) => {
  const checked = LINK_STATUS[source.id]
  const topic = source.tags?.filter((tag) => tag !== '近期').slice(0, 2).join('、') || '穿搭'
  return {
    ...source,
    publishedAt: inferPublishedAt(source),
    verifiedAt: checked?.checkedAt?.slice(0, 10) || source.verifiedAt || '未检测',
    status: checked?.status || source.status || 'unchecked',
    httpStatus: checked?.httpStatus || null,
    perspective: inferPerspective(source),
    editorNote: source.editorNote || `入选理由：它提供了可落地的${topic}信息，可直接支持本站对应建议，而不只是展示造型。`,
  }
})
