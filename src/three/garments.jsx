// ============ 服装网格库（T5 3D 舞台）============
// 本文件是唯一的「单品 → 网格」映射处：GarmentMesh 按 item.mesh 在 REGISTRY 里查组件，
// 不再像旧版按 item.id 硬编码 switch，因此以后新增单品只需在 catalog.js 里填 mesh 字段。
// 依赖仅 three / @react-three/drei（RoundedBox）/ ./textures；
// 绝不 import ./Mannequin（那是上层，反向 import 会形成循环依赖）。
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { getTexture, getNormalMap, getRoughnessMap } from './textures'

// ============ 基础尺寸（米）：头顶1.83 地面0 ============
// 躯干/服装为 LatheGeometry 旋转曲面（profile: [半径, 高度]，z 轴压扁成椭圆截面）
export const ARM = { x: 0.185, y: 1.44, tilt: 0.15, bend: -0.22 }
export const LEG = { x: 0.093, y: 0.9 }

export function Skin(props) {
  return <meshStandardMaterial color="#d8b49a" roughness={0.42} envMapIntensity={0.5} {...props} />
}
export function HairM(props) {
  return <meshStandardMaterial color="#2b2620" roughness={0.92} envMapIntensity={0.35} {...props} />
}
// 布料材质：颜色一律由调用方传入的物品色决定（item.hex），tex 为 textures.js 支持的 9 种之一。
// meshPhysicalMaterial：sheen 织物绒感（针织/绒类强、平纹/斜纹/皮革弱）+ PBR 法线/粗糙度贴图；
// 最终 roughness = material.roughness × roughnessMap.g；IBL 经 envMapIntensity 压到 0.45，避免叠加灯光后过曝。
// normalScale 基线 1.0（真实切线空间法线），按面料性格微调；camo 走旧 painter 管线沿用旧补偿值 0.35。
// 注：repeat 默认 4 沿用交付基线；各单品按自身尺度另给值（tee/cotton 6、blazer/twill 5、
// 鞋类 leather 2）——repeat 越大代表单位面积内平铺次数越多，织纹越细密。
// 历史提醒：曾有一版实测「repeat 从 6 调到 3 或 2 截图逐字节相同」，据此以为 repeat 无杠杆；
// 真实原因是当时 PBR 贴图根本没上 GPU（见 textures.js 里 loadPBRTexture 的 dispose 注释），
// 所有面料都停在 2×2 纯白占位上，自然调什么都没变化。贴图修好后 repeat 已恢复生效。
const NORMAL_SCALE = {
  fleece: 1.0, woolknit: 1.0, // 结构化面料（0.9–1.1）
  jersey: 0.9, denim: 0.9, leather: 0.9,
  twill: 0.85,
  cotton: 0.8, oxford: 0.75, // 细密面料（0.7–0.9）
  camo: 0.35,
}
function Cloth({ hex, rough = 0.82, side, tex, repeat = 4 }) {
  const map = tex ? getTexture(tex, repeat, repeat) : null
  const nm = tex ? getNormalMap(tex, repeat, repeat) : null
  const rm = tex ? getRoughnessMap(tex, repeat, repeat) : null
  const soft = tex === 'jersey' || tex === 'fleece' || tex === 'woolknit'
  const sheen = soft ? 0.9 : 0.35
  const sheenRoughness = soft ? 0.65 : 0.85
  const normalScale = tex ? (NORMAL_SCALE[tex] ?? 1.0) : 1.0
  return (
    <meshPhysicalMaterial
      color={hex}
      roughness={rough}
      side={side}
      map={map || null}
      normalMap={nm || null}
      roughnessMap={rm || null}
      normalScale={[normalScale, normalScale]}
      sheen={sheen}
      sheenColor="#ffffff"
      sheenRoughness={sheenRoughness}
      envMapIntensity={0.45}
    />
  )
}
function Metal({ hex = '#c9ccd1' }) {
  return <meshPhysicalMaterial color={hex} metalness={0.85} roughness={0.28} clearcoat={0.3} clearcoatRoughness={0.25} envMapIntensity={0.75} />
}

const DS = THREE.DoubleSide
// Lathe 几何：模块级创建一次，所有实例共享（不要在组件函数体内重建）
const lathe = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
// 领口：斜收至脖根（r=0.062，贴合脖子），配合罗纹领环（当前各上装剖面已显式收口，保留此约定备用）
const closesTop = (pts) => [...pts, [0.062, pts[pts.length - 1][1] + 0.008]]

// 左胸口袋切平面坐标系：法线 = G.tee 在 (x=-0.112, y=1.27) 处的曲面外法线（已计入 scale=[1,1,0.75]）。
// 平面 box 无法同时贴曲面又保持矩形，故把口袋绕曲面法线摆成切平面：后表面距曲面 3mm，厚度压到 0.010。
const POCKET_SURF = new THREE.Vector3(-0.112, 1.27, 0.103567)
const POCKET_N = new THREE.Vector3(-0.508134, -0.209714, 0.835356).normalize()
const POCKET_T = new THREE.Vector3(0.854363, 0, 0.519677).normalize()
const POCKET_B = new THREE.Vector3().crossVectors(POCKET_N, POCKET_T).normalize()
const POCKET_ROT = new THREE.Euler().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(POCKET_T, POCKET_B, POCKET_N),
  'XYZ',
)
const POCKET_POS = POCKET_SURF.clone().addScaledVector(POCKET_N, 0.008)

// 罗纹领口环：贴脖罗纹领（真实T恤样式）
function NeckRib({ hex, y = 1.512, r = 0.062, tube = 0.01 }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.75]}>
      <torusGeometry args={[r, tube, 12, 32]} />
      <Cloth hex={hex} rough={0.75} />
    </mesh>
  )
}
// 环向束带：细扁的开口圆柱面，竖直壁绕躯干一圈（z×0.75 贴合椭圆截面）
// 用于条纹、罗纹收口、绗缝环等一切「真的绕身体一圈」的横向结构
function BandRing({ r, y, h = 0.014, hex, rough = 0.6, tex, radial = 0.75 }) {
  return (
    <mesh position={[0, y, 0]} scale={[1, 1, radial]}>
      <cylinderGeometry args={[r, r, h, 44, 1, true]} />
      <Cloth hex={hex} rough={rough} side={DS} tex={tex} />
    </mesh>
  )
}
// 横向绗缝蓬松环：torus 绕 X 转 90° 后平面变水平，local Y 缩放把圆环压成椭圆以贴合躯干
function QuiltRing({ r, y, tube = 0.022, hex, rough = 0.72 }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.75, 1]}>
      <torusGeometry args={[r, tube, 12, 40]} />
      <Cloth hex={hex} rough={rough} side={DS} />
    </mesh>
  )
}

// ---- 身体躯干（平滑连续曲面，顶部收口藏在服装领口内侧，z×0.72）----
export const BODY_TORSO = lathe([[0.150, 0.84], [0.165, 0.92], [0.162, 1.00], [0.142, 1.10], [0.148, 1.20], [0.172, 1.32], [0.168, 1.40], [0.120, 1.46], [0.05, 1.50]])

// ---- 服装躯干（全部比身体放量；外套比卫衣/毛衣再大一号，保证叠穿不穿模）----
const G = {
  // 所有上装肩部扩展到 0.23+，领壁近乎垂直（肩线到脖根快速收拢，无锥形斗篷）
  tee: lathe([[0.185, 0.97], [0.180, 1.04], [0.158, 1.12], [0.170, 1.24], [0.196, 1.34], [0.215, 1.40], [0.230, 1.44], [0.226, 1.458], [0.075, 1.470], [0.062, 1.505]]),
  polo: lathe([[0.180, 0.965], [0.175, 1.05], [0.155, 1.13], [0.167, 1.25], [0.192, 1.34], [0.212, 1.40], [0.228, 1.44], [0.224, 1.458], [0.075, 1.470], [0.062, 1.505]]),
  shirt: lathe([[0.178, 0.96], [0.172, 1.06], [0.150, 1.14], [0.162, 1.26], [0.188, 1.35], [0.208, 1.40], [0.226, 1.44], [0.222, 1.458], [0.075, 1.470], [0.062, 1.505]]),
  hoodie: lathe([[0.196, 0.95], [0.190, 1.06], [0.168, 1.16], [0.180, 1.28], [0.206, 1.37], [0.224, 1.40], [0.240, 1.44], [0.236, 1.462], [0.078, 1.474], [0.062, 1.508]]),
  sweater: lathe([[0.182, 0.99], [0.175, 1.08], [0.156, 1.16], [0.168, 1.27], [0.192, 1.35], [0.212, 1.40], [0.230, 1.44], [0.226, 1.458], [0.075, 1.470], [0.062, 1.508]]),
  overshirt: lathe([[0.192, 0.94], [0.186, 1.05], [0.164, 1.15], [0.176, 1.27], [0.207, 1.36], [0.228, 1.40], [0.244, 1.44], [0.240, 1.462], [0.078, 1.474], [0.062, 1.508]]),
  blazer: lathe([[0.190, 0.95], [0.184, 1.06], [0.162, 1.16], [0.174, 1.27], [0.210, 1.36], [0.232, 1.40], [0.248, 1.44], [0.244, 1.462], [0.078, 1.474], [0.062, 1.508]]),
  bomber: lathe([[0.192, 1.00], [0.186, 1.10], [0.166, 1.18], [0.178, 1.29], [0.210, 1.37], [0.230, 1.40], [0.246, 1.44], [0.242, 1.462], [0.078, 1.474], [0.062, 1.508]]),
  // 圆领厚卫衣：比 tee 整体 +0.006 放量
  sweatshirt: lathe([[0.191, 0.965], [0.186, 1.04], [0.164, 1.12], [0.176, 1.24], [0.202, 1.34], [0.221, 1.40], [0.236, 1.44], [0.232, 1.458], [0.075, 1.470], [0.062, 1.505]]),
  // 哈林顿：比 overshirt 略修身（短下摆卡在腰线），立领靠独立领筒
  harrington: lathe([[0.188, 1.00], [0.182, 1.08], [0.162, 1.16], [0.174, 1.27], [0.202, 1.36], [0.222, 1.40], [0.238, 1.44], [0.234, 1.458], [0.075, 1.472], [0.062, 1.500]]),
  // 羽绒服：比 bomber 再大一号，给绗缝环留出外包空间
  puffer: lathe([[0.206, 0.99], [0.200, 1.08], [0.180, 1.16], [0.192, 1.27], [0.224, 1.37], [0.246, 1.41], [0.260, 1.44], [0.256, 1.462], [0.084, 1.478], [0.066, 1.512]]),
  // 长风衣：下摆过膝（0.55），髋部 0.19 → 放到 0.246 → 下摆略收
  trench: lathe([[0.210, 0.55], [0.232, 0.64], [0.244, 0.74], [0.246, 0.84], [0.234, 0.92], [0.198, 0.99], [0.186, 1.06], [0.176, 1.14], [0.188, 1.26], [0.212, 1.35], [0.228, 1.40], [0.242, 1.44], [0.238, 1.462], [0.080, 1.474], [0.062, 1.508]]),
  // 毛呢大衣：下摆更低（0.50）更直（收腰更少），整体比风衣厚一号
  coat: lathe([[0.224, 0.50], [0.244, 0.58], [0.254, 0.70], [0.256, 0.82], [0.246, 0.90], [0.210, 0.98], [0.196, 1.06], [0.186, 1.14], [0.198, 1.26], [0.222, 1.35], [0.238, 1.40], [0.252, 1.44], [0.248, 1.462], [0.084, 1.474], [0.064, 1.508]]),
}
// 下摆收口环（椭圆 torus，z×0.75）
const hemTorus = (r) => new THREE.TorusGeometry(r, 0.008, 10, 44)
const HEM = {
  tee: hemTorus(0.186), polo: hemTorus(0.181), shirt: hemTorus(0.179), hoodie: hemTorus(0.197),
  sweater: hemTorus(0.183), overshirt: hemTorus(0.193), bomber: hemTorus(0.193),
  sweatshirt: hemTorus(0.192), harrington: hemTorus(0.189),
}
// 裤腰（z×0.75 的旋转曲面）
const PANTS_HIP = lathe([[0.152, 0.78], [0.170, 0.86], [0.176, 0.94], [0.172, 1.00], [0.165, 1.07]])

// ============ 骨架辅助（袖子/裤腿与肢体共用同一变换）============
export function ArmGroup({ side, children }) {
  return <group position={[side * ARM.x, ARM.y, 0]} rotation={[0, 0, side * ARM.tilt]}>{children}</group>
}
export function LegGroup({ side, children }) {
  return <group position={[side * LEG.x, LEG.y, 0]}>{children}</group>
}

// ============ 袖子 ============
function ShortSleeves({ hex, ribCuff = false, tex }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <ArmGroup key={s} side={s}>
          {/* 肩头覆盖：衔接 Lathe 肩缘与袖子 */}
          <mesh position={[0, 0.02, 0]}><sphereGeometry args={[0.06, 24, 24]} /><Cloth hex={hex} tex={tex} /></mesh>
          <mesh position={[0, -0.075, 0]}><cylinderGeometry args={[0.066, 0.057, 0.13, 24]} /><Cloth hex={hex} tex={tex} /></mesh>
          {ribCuff && <mesh position={[0, -0.138, 0]}><cylinderGeometry args={[0.0575, 0.0575, 0.032, 24]} /><Cloth hex={hex} rough={0.92} /></mesh>}
        </ArmGroup>
      ))}
    </>
  )
}
function LongSleeves({ hex, cuff = true, r1 = 0.06, r2 = 0.052, r3 = 0.052, r4 = 0.045, rc = 0.047, rs = 0.062, tex, rough }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <ArmGroup key={s} side={s}>
          {/* 肩头覆盖：衔接 Lathe 肩缘与袖子 */}
          <mesh position={[0, 0.02, 0]}><sphereGeometry args={[rs, 24, 24]} /><Cloth hex={hex} rough={rough} /></mesh>
          <mesh position={[0, -0.145, 0]}><cylinderGeometry args={[r1, r2, 0.24, 24]} /><Cloth hex={hex} tex={tex} rough={rough} /></mesh>
          <group position={[0, -0.28, 0]} rotation={[ARM.bend, 0, 0]}>
            <mesh position={[0, -0.14, 0]}><cylinderGeometry args={[r3, r4, 0.26, 24]} /><Cloth hex={hex} tex={tex} rough={rough} /></mesh>
            {cuff && <mesh position={[0, -0.27, 0]}><cylinderGeometry args={[rc, rc, 0.055, 24]} /><Cloth hex={hex} rough={0.72} /></mesh>}
          </group>
        </ArmGroup>
      ))}
    </>
  )
}
function HemTorus({ geo, hex, y, zScale = 0.75, rough = 0.75 }) {
  return <mesh geometry={geo} position={[0, y, 0]} scale={[1, 1, zScale]}><Cloth hex={hex} rough={rough} /></mesh>
}
// 立领（短竖领筒）：别用贴脖罗纹环，立领是竖直的一圈筒壁
function StandCollar({ hex, y = 1.535, h = 0.066, r = 0.072, rough = 0.8 }) {
  return (
    <mesh position={[0, y, 0]}>
      <cylinderGeometry args={[r, r * 0.97, h, 24, 1, true]} />
      <Cloth hex={hex} rough={rough} side={DS} />
    </mesh>
  )
}

// ============ 上装 ============
function Tee({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.tee} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="cotton" repeat={6} /></mesh>
      <HemTorus geo={HEM.tee} hex={hex} y={0.97} />
      {/* 经典袋款左胸口袋 */}
      <mesh position={POCKET_POS} rotation={POCKET_ROT}><boxGeometry args={[0.09, 0.085, 0.010]} /><Cloth hex={hex} rough={0.85} tex="cotton" repeat={6} /></mesh>
      <mesh position={[0, 1.545, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.068, 0.014, 12, 32]} /><Cloth hex={hex} rough={0.7} /></mesh>
      <NeckRib hex={hex} />
      <ShortSleeves hex={hex} tex="cotton" />
    </group>
  )
}
function Polo({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.polo} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="jersey" /></mesh>
      <HemTorus geo={HEM.polo} hex={hex} y={0.965} />
      <mesh position={[0, 1.49, 0.104]}><boxGeometry args={[0.02, 0.1, 0.008]} /><Cloth hex={'#f0ede6'} /></mesh>
      <mesh position={[-0.035, 1.545, 0.068]} rotation={[0.25, 0.5, 0.15]}><boxGeometry args={[0.075, 0.02, 0.045]} /><Cloth hex={hex} rough={0.7} /></mesh>
      <mesh position={[0.035, 1.545, 0.068]} rotation={[0.25, -0.5, -0.15]}><boxGeometry args={[0.075, 0.02, 0.045]} /><Cloth hex={hex} rough={0.7} /></mesh>
      <NeckRib hex={hex} />
      <ShortSleeves hex={hex} tex="jersey" ribCuff />
    </group>
  )
}
function Shirt({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.shirt} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="oxford" /></mesh>
      <HemTorus geo={HEM.shirt} hex={hex} y={0.96} />
      <mesh position={[0, 1.21, 0.124]}><boxGeometry args={[0.02, 0.44, 0.008]} /><Cloth hex={hex} rough={0.68} /></mesh>
      {[1.36, 1.28, 1.2, 1.12, 1.05].map((y) => (
        <mesh key={y} position={[0, y, 0.131]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.008, 0.008, 0.004, 10]} /><meshStandardMaterial color="#ffffff" roughness={0.4} /></mesh>
      ))}
      <mesh position={[-0.035, 1.548, 0.062]} rotation={[0.3, 0.55, 0.12]}><boxGeometry args={[0.08, 0.022, 0.05]} /><Cloth hex={hex} rough={0.68} /></mesh>
      <mesh position={[0.035, 1.548, 0.062]} rotation={[0.3, -0.55, -0.12]}><boxGeometry args={[0.08, 0.022, 0.05]} /><Cloth hex={hex} rough={0.68} /></mesh>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} tex="oxford" />
    </group>
  )
}
function Hoodie({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.hoodie} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="fleece" /></mesh>
      <HemTorus geo={HEM.hoodie} hex={hex} y={0.95} />
      <mesh position={[0, 1.555, -0.105]} scale={[1, 0.72, 0.9]}><sphereGeometry args={[0.14, 24, 24]} /><Cloth hex={hex} rough={0.88} side={DS} /></mesh>
      <mesh position={[-0.035, 1.42, 0.148]}><cylinderGeometry args={[0.006, 0.006, 0.11, 8]} /><meshStandardMaterial color="#e8e4da" roughness={0.8} /></mesh>
      <mesh position={[0.035, 1.42, 0.148]}><cylinderGeometry args={[0.006, 0.006, 0.11, 8]} /><meshStandardMaterial color="#e8e4da" roughness={0.8} /></mesh>
      <mesh position={[0, 1.03, 0.142]}><boxGeometry args={[0.2, 0.11, 0.015]} /><Cloth hex={hex} rough={0.88} /></mesh>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} r1={0.063} r2={0.055} r3={0.055} r4={0.048} rc={0.05} rs={0.077} tex="fleece" />
    </group>
  )
}
function Sweater({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.sweater} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.92} side={DS} tex="woolknit" /></mesh>
      <HemTorus geo={HEM.sweater} hex={hex} y={0.99} />
      <NeckRib hex={hex} y={1.516} r={0.06} tube={0.016} />
      <LongSleeves hex={hex} r1={0.06} r2={0.053} r3={0.053} r4={0.046} rc={0.049} tex="woolknit" />
    </group>
  )
}
function Overshirt({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.overshirt} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.9} side={DS} tex="twill" /></mesh>
      <HemTorus geo={HEM.overshirt} hex={hex} y={0.94} />
      <mesh position={[-0.122, 1.38, 0.150]}><boxGeometry args={[0.095, 0.09, 0.02]} /><Cloth hex={hex} rough={0.92} /></mesh>
      <mesh position={[0.122, 1.38, 0.150]}><boxGeometry args={[0.095, 0.09, 0.02]} /><Cloth hex={hex} rough={0.92} /></mesh>
      <mesh position={[0, 1.05, 0.147]}><boxGeometry args={[0.022, 0.42, 0.008]} /><Cloth hex={hex} rough={0.8} /></mesh>
      <mesh position={[-0.04, 1.548, 0.062]} rotation={[0.28, 0.5, 0.12]}><boxGeometry args={[0.08, 0.022, 0.05]} /><Cloth hex={hex} rough={0.85} /></mesh>
      <mesh position={[0.04, 1.548, 0.062]} rotation={[0.28, -0.5, -0.12]}><boxGeometry args={[0.08, 0.022, 0.05]} /><Cloth hex={hex} rough={0.85} /></mesh>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} r1={0.063} r2={0.055} r3={0.055} r4={0.048} rc={0.05} rs={0.077} tex="twill" />
    </group>
  )
}
function Blazer({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.blazer} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.62} side={DS} tex="twill" repeat={5} /></mesh>
      <mesh position={[0, 1.42, 0.148]}><boxGeometry args={[0.13, 0.2, 0.006]} /><Cloth hex="#f2efe8" /></mesh>
      <mesh position={[-0.055, 1.42, 0.158]} rotation={[0.05, 0.25, 0.38]}><boxGeometry args={[0.075, 0.17, 0.018]} /><Cloth hex={hex} rough={0.55} /></mesh>
      <mesh position={[0.055, 1.42, 0.158]} rotation={[0.05, -0.25, -0.38]}><boxGeometry args={[0.075, 0.17, 0.018]} /><Cloth hex={hex} rough={0.55} /></mesh>
      <mesh position={[0, 1.12, 0.150]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.011, 0.011, 0.006, 12]} /><Metal /></mesh>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} r1={0.064} r2={0.056} r3={0.056} r4={0.049} rc={0.051} rs={0.078} tex="twill" />
    </group>
  )
}
function Bomber({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.bomber} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.6} side={DS} /></mesh>
      <mesh position={[0, 1.005, 0]} scale={[1, 1, 0.75]}><cylinderGeometry args={[0.194, 0.194, 0.055, 44, 1, true]} /><Cloth hex={hex} rough={0.95} side={DS} /></mesh>
      <mesh position={[0, 1.24, 0.138]}><boxGeometry args={[0.016, 0.42, 0.008]} /><Cloth hex={hex} rough={0.8} /></mesh>
      {/* MA-1 经典左臂工具袋 */}
      <ArmGroup side={-1}>
        <mesh position={[0, -0.33, 0.056]}><boxGeometry args={[0.055, 0.075, 0.02]} /><Cloth hex={hex} rough={0.65} /></mesh>
        <mesh position={[0, -0.33, 0.068]}><boxGeometry args={[0.045, 0.008, 0.006]} /><Cloth hex={hex} rough={0.5} /></mesh>
      </ArmGroup>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} r1={0.063} r2={0.055} r3={0.055} r4={0.048} rc={0.05} rs={0.077} />
    </group>
  )
}

// ============ 下装 ============
function Pants({ item, cargo = false, tex = 'twill' }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={PANTS_HIP} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.88} side={DS} tex={tex} /></mesh>
      {/* 门襟缝线 */}
      <mesh position={[0, 0.93, 0.136]}><boxGeometry args={[0.008, 0.14, 0.006]} /><Cloth hex={hex} rough={0.7} /></mesh>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <mesh position={[0, 0.02, 0]}><sphereGeometry args={[0.104, 18, 18]} /><Cloth hex={hex} rough={0.88} tex={tex} /></mesh>
          <mesh position={[0, -0.195, 0]}><cylinderGeometry args={[0.104, 0.080, 0.42, 28]} /><Cloth hex={hex} rough={0.88} tex={tex} /></mesh>
          <mesh position={[0, -0.41, 0]}><sphereGeometry args={[0.079, 24, 24]} /><Cloth hex={hex} rough={0.88} tex={tex} /></mesh>
          <mesh position={[0, -0.60, 0]}><cylinderGeometry args={[0.079, 0.061, 0.38, 28]} /><Cloth hex={hex} rough={0.88} tex={tex} /></mesh>
          <mesh position={[0, -0.775, 0]}><cylinderGeometry args={[0.063, 0.063, 0.045, 28]} /><Cloth hex={hex} rough={0.8} /></mesh>
          {cargo && <mesh position={[s * 0.088, -0.27, 0.055]}><boxGeometry args={[0.03, 0.11, 0.09]} /><Cloth hex={hex} rough={0.92} tex={tex} /></mesh>}
        </LegGroup>
      ))}
    </group>
  )
}
function Shorts({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={PANTS_HIP} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.88} side={DS} tex="jersey" /></mesh>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <mesh position={[0, -0.145, 0]}><cylinderGeometry args={[0.106, 0.092, 0.32, 28]} /><Cloth hex={hex} rough={0.88} tex="jersey" /></mesh>
          <mesh position={[0, -0.31, 0]}><cylinderGeometry args={[0.094, 0.094, 0.035, 28]} /><Cloth hex={hex} rough={0.8} /></mesh>
        </LegGroup>
      ))}
    </group>
  )
}

// ============ 鞋 ============
function Laces({ y = -0.815 }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, y - i * 0.014, 0.095 + i * 0.018]}><boxGeometry args={[0.05, 0.007, 0.012]} /><meshStandardMaterial color="#e8e6df" roughness={0.8} /></mesh>
      ))}
    </group>
  )
}
function Sneaker({ item }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <RoundedBox args={[0.115, 0.05, 0.28]} radius={0.02} smoothness={4} position={[0, -0.878, 0.05]}><Cloth hex={item.hex} rough={0.5} /></RoundedBox>
          <RoundedBox args={[0.105, 0.07, 0.25]} radius={0.03} smoothness={4} position={[0, -0.845, 0.045]}><Cloth hex={item.hex} rough={0.85} tex="jersey" repeat={3} /></RoundedBox>
          <mesh position={[0, -0.833, 0.155]} scale={[0.9, 0.62, 1]}><sphereGeometry args={[0.052, 18, 18]} /><Cloth hex={item.hex} rough={0.85} /></mesh>
          <Laces />
        </LegGroup>
      ))}
    </>
  )
}
function Runner({ item }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          {/* AJ Legacy 312 风格：厚底 + 可视气垫 + 绑带 */}
          <RoundedBox args={[0.135, 0.045, 0.31]} radius={0.02} smoothness={4} position={[0, -0.882, 0.05]}><Cloth hex="#222326" rough={0.55} /></RoundedBox>
          <RoundedBox args={[0.128, 0.045, 0.30]} radius={0.02} smoothness={4} position={[0, -0.842, 0.05]}><Cloth hex="#e9e7e0" rough={0.5} /></RoundedBox>
          <mesh position={[0, -0.842, -0.118]} scale={[1, 0.55, 0.85]}><sphereGeometry args={[0.05, 14, 14]} /><Cloth hex="#2a2b2e" rough={0.35} /></mesh>
          <RoundedBox args={[0.118, 0.07, 0.26]} radius={0.035} smoothness={4} position={[0, -0.795, 0.04]}><Cloth hex={item.hex} rough={0.85} /></RoundedBox>
          <mesh position={[0, -0.782, 0.165]} scale={[0.9, 0.62, 1]}><sphereGeometry args={[0.055, 18, 18]} /><Cloth hex={item.hex} rough={0.85} /></mesh>
          <mesh position={[0, -0.772, 0.105]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.112, 0.024, 0.02]} /><Cloth hex={item.hex2 || '#222326'} rough={0.7} /></mesh>
          <Laces y={-0.752} />
        </LegGroup>
      ))}
    </>
  )
}
function Chelsea({ item }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <RoundedBox args={[0.11, 0.12, 0.27]} radius={0.035} smoothness={4} position={[0, -0.835, 0.045]}><Cloth hex={item.hex} rough={0.35} tex="leather" repeat={2} /></RoundedBox>
          <RoundedBox args={[0.115, 0.04, 0.285]} radius={0.015} smoothness={4} position={[0, -0.888, 0.05]}><Cloth hex={item.hex} rough={0.3} /></RoundedBox>
          <mesh position={[0, -0.79, 0.045]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.068, 0.013, 10, 24]} /><Cloth hex={item.hex} rough={0.3} /></mesh>
        </LegGroup>
      ))}
    </>
  )
}
function Derby({ item }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <RoundedBox args={[0.1, 0.075, 0.27]} radius={0.025} smoothness={4} position={[0, -0.852, 0.05]}><Cloth hex={item.hex} rough={0.25} tex="leather" repeat={2} /></RoundedBox>
          <RoundedBox args={[0.105, 0.028, 0.285]} radius={0.012} smoothness={4} position={[0, -0.889, 0.05]}><Cloth hex={item.hex} rough={0.2} /></RoundedBox>
          <mesh position={[0, -0.832, 0.115]}><boxGeometry args={[0.06, 0.008, 0.02]} /><Cloth hex={item.hex} rough={0.3} /></mesh>
        </LegGroup>
      ))}
    </>
  )
}
function CanvasShoe({ item }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          {/* Converse 1970s 风格：硫化底 + 橡胶鞋头 + 侧标 */}
          <RoundedBox args={[0.105, 0.04, 0.275]} radius={0.015} smoothness={4} position={[0, -0.883, 0.05]}><Cloth hex="#e8e0d0" rough={0.6} /></RoundedBox>
          <RoundedBox args={[0.096, 0.062, 0.245]} radius={0.025} smoothness={4} position={[0, -0.852, 0.045]}><Cloth hex={item.hex} rough={0.95} tex="twill" repeat={3} /></RoundedBox>
          <mesh position={[0, -0.848, 0.152]} scale={[0.88, 0.52, 1]}><sphereGeometry args={[0.05, 18, 18]} /><Cloth hex={item.hex2 || '#d9d2c0'} rough={0.8} /></mesh>
          <mesh position={[s * 0.049, -0.838, 0.02]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, 0.006, 16]} /><meshStandardMaterial color="#8c2f39" roughness={0.6} /></mesh>
          <Laces y={-0.828} />
        </LegGroup>
      ))}
    </>
  )
}

// ============ 配饰 ============
function Watch({ item }) {
  return (
    <ArmGroup side={-1}>
      <group position={[0, -0.28, 0]} rotation={[ARM.bend, 0, 0]}>
        <mesh position={[0, -0.305, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.05, 0.011, 10, 28]} /><Metal hex={item.hex} /></mesh>
        <mesh position={[0, -0.305, 0.052]}><boxGeometry args={[0.038, 0.014, 0.038]} /><Metal hex={item.hex} /></mesh>
      </group>
    </ArmGroup>
  )
}
function Necklace({ item }) {
  return (
    <group>
      <mesh position={[0, 1.475, 0.095]} rotation={[0.95, 0, 0]}><torusGeometry args={[0.062, 0.0065, 8, 40]} /><Metal hex={item.hex} /></mesh>
      <mesh position={[0, 1.418, 0.148]}><sphereGeometry args={[0.016, 12, 12]} /><Metal hex={item.hex} /></mesh>
    </group>
  )
}
function Cap({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[0, 1.745, 0.005]} scale={[1.03, 0.8, 1.03]}><sphereGeometry args={[0.126, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><Cloth hex={hex} rough={0.9} /></mesh>
      <mesh position={[0, 1.752, 0.112]} scale={[1.22, 1, 1.45]}><cylinderGeometry args={[0.085, 0.085, 0.012, 24]} /><Cloth hex={hex} rough={0.9} /></mesh>
    </group>
  )
}
function Glasses({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[-0.043, 1.712, 0.108]}><torusGeometry args={[0.034, 0.005, 8, 24]} /><meshStandardMaterial color={hex} roughness={0.4} /></mesh>
      <mesh position={[0.043, 1.712, 0.108]}><torusGeometry args={[0.034, 0.005, 8, 24]} /><meshStandardMaterial color={hex} roughness={0.4} /></mesh>
      <mesh position={[0, 1.718, 0.11]}><boxGeometry args={[0.026, 0.005, 0.006]} /><meshStandardMaterial color={hex} roughness={0.4} /></mesh>
      <mesh position={[-0.082, 1.712, 0.062]} rotation={[0, 0.45, 0]}><boxGeometry args={[0.095, 0.005, 0.005]} /><meshStandardMaterial color={hex} roughness={0.4} /></mesh>
      <mesh position={[0.082, 1.712, 0.062]} rotation={[0, -0.45, 0]}><boxGeometry args={[0.095, 0.005, 0.005]} /><meshStandardMaterial color={hex} roughness={0.4} /></mesh>
    </group>
  )
}
function Bag({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[0.02, 1.3, 0.152]} rotation={[0, 0, -0.6]}><boxGeometry args={[0.02, 0.46, 0.008]} /><Cloth hex={hex} rough={0.7} tex="twill" repeat={3} /></mesh>
      <RoundedBox args={[0.2, 0.15, 0.07]} radius={0.025} smoothness={4} position={[0.17, 0.97, 0.1]}><Cloth hex={hex} rough={0.7} tex="twill" repeat={3} /></RoundedBox>
      <mesh position={[0.17, 1.045, 0.1]}><boxGeometry args={[0.14, 0.015, 0.02]} /><Cloth hex={hex} rough={0.9} /></mesh>
    </group>
  )
}
function Scarf({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[0, 1.548, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.088, 0.028, 12, 32]} /><Cloth hex={hex} rough={0.98} tex="woolknit" /></mesh>
      <mesh position={[0.045, 1.40, 0.14]} rotation={[0.06, 0, 0.08]}><boxGeometry args={[0.055, 0.24, 0.02]} /><Cloth hex={hex} rough={0.98} tex="woolknit" /></mesh>
    </group>
  )
}

// ============ 新网格（16 个，补齐旧版 default 分支导致的「衣服消失」）============

// 1) 条纹T恤：Tee 造型 + 4 条真正绕躯干一圈的深色横条
function TeeStripe({ item }) {
  const hex = item.hex
  const stripe = '#2f3138' // 功能性深色副色（条纹），不参与主题
  return (
    <group>
      <mesh geometry={G.tee} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="jersey" repeat={6} /></mesh>
      <HemTorus geo={HEM.tee} hex={hex} y={0.97} />
      {/* 条带半径取自 G.tee 在各高度的剖面半径 + 0.002，保证包住躯干且不悬空 */}
      <BandRing r={0.176} y={1.06} h={0.026} hex={stripe} rough={0.7} />
      <BandRing r={0.164} y={1.16} h={0.026} hex={stripe} rough={0.7} />
      <BandRing r={0.177} y={1.26} h={0.026} hex={stripe} rough={0.7} />
      <BandRing r={0.204} y={1.36} h={0.026} hex={stripe} rough={0.7} />
      <NeckRib hex={hex} />
      <ShortSleeves hex={hex} tex="jersey" />
    </group>
  )
}

// 2) 圆领厚卫衣：比 Tee 略宽松，fleece 绒面 + 罗纹下摆 + 罗纹袖口，无帽子
function Sweatshirt({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.sweatshirt} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.9} side={DS} tex="fleece" /></mesh>
      {/* 罗纹下摆：比下摆环更宽的收口带 */}
      <BandRing r={0.192} y={0.978} h={0.05} hex={hex} rough={0.94} />
      <HemTorus geo={HEM.sweatshirt} hex={hex} y={0.965} rough={0.92} />
      <mesh position={[0, 1.05, 0.152]}><boxGeometry args={[0.16, 0.09, 0.012]} /><Cloth hex={hex} rough={0.9} tex="fleece" /></mesh>
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} r1={0.063} r2={0.055} r3={0.055} r4={0.048} rc={0.05} rs={0.075} tex="fleece" rough={0.9} />
    </group>
  )
}

// 3) 长袖T恤：Tee 的躯干 + 无罗纹袖口的长袖
function LongsleeveTee({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.tee} scale={[1, 1, 0.75]}><Cloth hex={hex} side={DS} tex="jersey" /></mesh>
      <HemTorus geo={HEM.tee} hex={hex} y={0.97} />
      <NeckRib hex={hex} />
      <LongSleeves hex={hex} cuff={false} r1={0.06} r2={0.052} r3={0.052} r4={0.045} rs={0.062} tex="jersey" />
    </group>
  )
}

// 4) 哈林顿夹克：短下摆（卡腰线）+ 罗纹收口带 + 立领 + 斜插袋
function Harrington({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.harrington} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.72} side={DS} tex="twill" /></mesh>
      {/* 下摆罗纹收口带（哈林顿的标志性结构） */}
      <BandRing r={0.190} y={1.028} h={0.058} hex={hex} rough={0.95} />
      <HemTorus geo={HEM.harrington} hex={hex} y={1.00} rough={0.95} />
      {/* 立领：竖直领筒，比贴脖罗纹环高，高约 0.055 */}
      <StandCollar hex={hex} y={1.532} h={0.058} r={0.076} rough={0.72} />
      {/* 拉链：前中一条窄带 */}
      <mesh position={[0, 1.25, 0.133]}><boxGeometry args={[0.016, 0.44, 0.008]} /><Cloth hex={hex} rough={0.5} /></mesh>
      <mesh position={[-0.075, 1.20, 0.126]} rotation={[0, 0.25, 0.06]}><boxGeometry args={[0.07, 0.02, 0.01]} /><Cloth hex={hex} rough={0.6} /></mesh>
      <mesh position={[0.075, 1.20, 0.126]} rotation={[0, -0.25, -0.06]}><boxGeometry args={[0.07, 0.02, 0.01]} /><Cloth hex={hex} rough={0.6} /></mesh>
      <LongSleeves hex={hex} r1={0.061} r2={0.053} r3={0.053} r4={0.046} rc={0.048} rs={0.074} tex="twill" rough={0.72} />
    </group>
  )
}

// 5) 轻薄羽绒服：横向绗缝（6 条蓬松环）+ 立领，秋冬主力外套
function Puffer({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.puffer} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.72} side={DS} /></mesh>
      {/* 绗缝环：环心略小于躯干剖面半径，tube 0.022 让它向外鼓成「面包圈」 */}
      <QuiltRing r={0.196} y={1.05} hex={hex} />
      <QuiltRing r={0.182} y={1.13} hex={hex} />
      <QuiltRing r={0.178} y={1.21} hex={hex} />
      <QuiltRing r={0.198} y={1.29} hex={hex} />
      <QuiltRing r={0.220} y={1.37} hex={hex} />
      <QuiltRing r={0.250} y={1.43} tube={0.02} hex={hex} />
      <StandCollar hex={hex} y={1.538} h={0.07} r={0.078} rough={0.72} />
      {/* 前中拉链 */}
      <mesh position={[0, 1.26, 0.152]}><boxGeometry args={[0.018, 0.42, 0.01]} /><Cloth hex={hex} rough={0.5} /></mesh>
      <LongSleeves hex={hex} r1={0.065} r2={0.058} r3={0.058} r4={0.05} rc={0.052} rs={0.08} rough={0.72} />
    </group>
  )
}

// 6) 长风衣：下摆过膝（0.55）+ 腰带与方扣 + 双排扣 + 翻领
function Trench({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.trench} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.7} side={DS} tex="twill" /></mesh>
      <HemTorus geo={hemTorus(0.211)} hex={hex} y={0.55} rough={0.75} />
      {/* 双排扣前襟 */}
      <mesh position={[0.028, 1.14, 0.152]}><boxGeometry args={[0.09, 0.86, 0.008]} /><Cloth hex={hex} rough={0.68} /></mesh>
      {[1.30, 1.20, 1.10, 1.00, 0.90, 0.80, 0.70, 0.60].map((y) => (
        <mesh key={y} position={[0.062, y, 0.152]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.011, 0.011, 0.006, 12]} /><Metal hex="#7d6a4f" /></mesh>
      ))}
      {/* 腰带：腰部一圈扁环 + 方形带扣 */}
      <BandRing r={0.198} y={1.03} h={0.055} hex={hex} rough={0.78} />
      <mesh position={[0, 1.03, 0.152]}><boxGeometry args={[0.062, 0.062, 0.02]} /><meshStandardMaterial color="#2a2b2e" metalness={0.3} roughness={0.55} /></mesh>
      {/* 翻领：两片薄板从领口斜向下展开 */}
      <mesh position={[-0.062, 1.45, 0.140]} rotation={[0.1, 0.32, 0.34]}><boxGeometry args={[0.085, 0.19, 0.018]} /><Cloth hex={hex} rough={0.7} /></mesh>
      <mesh position={[0.062, 1.45, 0.140]} rotation={[0.1, -0.32, -0.34]}><boxGeometry args={[0.085, 0.19, 0.018]} /><Cloth hex={hex} rough={0.7} /></mesh>
      <LongSleeves hex={hex} r1={0.064} r2={0.056} r3={0.056} r4={0.049} rc={0.051} rs={0.078} tex="twill" rough={0.7} />
    </group>
  )
}

// 7) 毛呢大衣：比风衣更厚更直（下摆 0.50，收腰更少）+ 大翻领
function Coat({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={G.coat} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.85} side={DS} tex="woolknit" /></mesh>
      <HemTorus geo={hemTorus(0.225)} hex={hex} y={0.50} rough={0.88} />
      {/* 单排扣前襟 */}
      <mesh position={[0, 1.14, 0.150]}><boxGeometry args={[0.024, 0.88, 0.008]} /><Cloth hex={hex} rough={0.8} /></mesh>
      {[1.30, 1.18, 1.06, 0.94, 0.80, 0.66].map((y) => (
        <mesh key={y} position={[0.052, y, 0.150]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.013, 0.013, 0.006, 12]} /><meshStandardMaterial color="#2a2b2e" metalness={0.25} roughness={0.5} /></mesh>
      ))}
      {/* 翻领：两片薄板从领口斜向下展开（比风衣更大） */}
      <mesh position={[-0.07, 1.43, 0.142]} rotation={[0.08, 0.3, 0.42]}><boxGeometry args={[0.1, 0.24, 0.022]} /><Cloth hex={hex} rough={0.85} /></mesh>
      <mesh position={[0.07, 1.43, 0.142]} rotation={[0.08, -0.3, -0.42]}><boxGeometry args={[0.1, 0.24, 0.022]} /><Cloth hex={hex} rough={0.85} /></mesh>
      <mesh position={[0, 1.50, -0.02]} scale={[1.25, 0.55, 1.1]}><sphereGeometry args={[0.095, 20, 16]} /><Cloth hex={hex} rough={0.9} side={DS} tex="woolknit" /></mesh>
      <LongSleeves hex={hex} r1={0.066} r2={0.058} r3={0.058} r4={0.051} rc={0.053} rs={0.08} tex="woolknit" rough={0.85} />
    </group>
  )
}

// 8) 束脚卫裤：Pants 的腿型但向下明显收窄 + 脚踝罗纹束口 + 松紧腰头
function Joggers({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh geometry={PANTS_HIP} scale={[1, 1, 0.75]}><Cloth hex={hex} rough={0.9} side={DS} tex="jersey" /></mesh>
      {/* 松紧腰头（罗纹） */}
      <BandRing r={0.172} y={1.045} h={0.055} hex={hex} rough={0.94} />
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <mesh position={[0, 0.02, 0]}><sphereGeometry args={[0.104, 18, 18]} /><Cloth hex={hex} rough={0.9} tex="jersey" /></mesh>
          <mesh position={[0, -0.195, 0]}><cylinderGeometry args={[0.104, 0.086, 0.42, 28]} /><Cloth hex={hex} rough={0.9} tex="jersey" /></mesh>
          <mesh position={[0, -0.41, 0]}><sphereGeometry args={[0.085, 24, 24]} /><Cloth hex={hex} rough={0.9} tex="jersey" /></mesh>
          {/* 小腿：0.085 → 0.048（明显小于 Pants 的 0.079 → 0.061） */}
          <mesh position={[0, -0.60, 0]}><cylinderGeometry args={[0.085, 0.048, 0.38, 28]} /><Cloth hex={hex} rough={0.9} tex="jersey" /></mesh>
          {/* 脚踝罗纹束口 */}
          <mesh position={[0, -0.782, 0]}><cylinderGeometry args={[0.054, 0.05, 0.06, 28]} /><Cloth hex={hex} rough={0.95} /></mesh>
        </LegGroup>
      ))}
    </group>
  )
}

// 9) 乐福鞋：低帮无鞋带 + 马衔扣横压条 + 扁圆鞋头
function Loafer({ item }) {
  const hex = item.hex
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          {/* 鞋身比 Derby 更矮（口更低） */}
          <RoundedBox args={[0.098, 0.058, 0.25]} radius={0.022} smoothness={4} position={[0, -0.858, 0.045]}><Cloth hex={hex} rough={0.25} tex="leather" repeat={2} /></RoundedBox>
          <RoundedBox args={[0.104, 0.026, 0.275]} radius={0.012} smoothness={4} position={[0, -0.889, 0.05]}><Cloth hex={hex} rough={0.2} /></RoundedBox>
          {/* 扁圆鞋头 */}
          <mesh position={[0, -0.856, 0.150]} scale={[0.9, 0.48, 1]}><sphereGeometry args={[0.05, 18, 18]} /><Cloth hex={hex} rough={0.25} /></mesh>
          {/* 鞋口横压条（便士乐福的带状饰片） */}
          <mesh position={[0, -0.831, 0.083]} rotation={[0.12, 0, 0]}><boxGeometry args={[0.086, 0.012, 0.028]} /><Cloth hex={hex} rough={0.35} /></mesh>
          {/* 马衔扣（金属小横杆） */}
          <mesh position={[0, -0.826, 0.088]}><boxGeometry args={[0.03, 0.007, 0.01]} /><Metal /></mesh>
          {/* 后跟 */}
          <mesh position={[0, -0.877, -0.075]}><boxGeometry args={[0.09, 0.03, 0.045]} /><Cloth hex={hex} rough={0.3} /></mesh>
        </LegGroup>
      ))}
    </>
  )
}

// 10) 高帮系带工装靴：鞋筒高于脚踝 + 两段鞋带 + 加厚鞋底
function Boot({ item }) {
  const hex = item.hex
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          {/* 加厚鞋底（功能性深色橡胶） */}
          <RoundedBox args={[0.126, 0.052, 0.30]} radius={0.016} smoothness={4} position={[0, -0.876, 0.05]}><Cloth hex="#2a2b2e" rough={0.55} /></RoundedBox>
          <mesh position={[0, -0.855, 0.05]}><boxGeometry args={[0.122, 0.014, 0.295]} /><Cloth hex={hex} rough={0.45} /></mesh>
          {/* 鞋面 */}
          <RoundedBox args={[0.112, 0.085, 0.275]} radius={0.028} smoothness={4} position={[0, -0.836, 0.045]}><Cloth hex={hex} rough={0.32} tex="leather" repeat={2} /></RoundedBox>
          {/* 鞋筒：向上延伸到脚踝以上（比 Chelsea 更高） */}
          <mesh position={[0, -0.752, 0.03]}><cylinderGeometry args={[0.068, 0.074, 0.135, 20]} /><Cloth hex={hex} rough={0.32} tex="leather" repeat={2} /></mesh>
          <mesh position={[0, -0.686, 0.03]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.068, 0.009, 10, 24]} /><Cloth hex={hex} rough={0.4} /></mesh>
          {/* 两段鞋带：脚背 + 鞋筒 */}
          <Laces y={-0.816} />
          <Laces y={-0.742} />
        </LegGroup>
      ))}
    </>
  )
}

// 11) 针织帽：包住头顶的半球（无帽檐）+ 罗纹边 + 顶部球穗
function Beanie({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[0, 1.745, 0.005]} scale={[1.06, 1.0, 1.06]}><sphereGeometry args={[0.124, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><Cloth hex={hex} rough={0.95} side={DS} tex="woolknit" /></mesh>
      {/* 罗纹口边：水平一圈（torus 绕 X 转 90°） */}
      <mesh position={[0, 1.746, 0.005]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.131, 0.012, 10, 32]} /><Cloth hex={hex} rough={0.95} tex="woolknit" /></mesh>
      {/* 顶部球穗 */}
      <mesh position={[0, 1.878, 0.004]}><sphereGeometry args={[0.03, 14, 14]} /><Cloth hex={hex} rough={0.98} tex="woolknit" /></mesh>
    </group>
  )
}

// 12) 墨镜：与 Glasses 同镜框位置，但镜框更粗更大、镜片是不透明深色且覆盖更满
function Sunglasses({ item }) {
  const frame = item.hex
  const lens = '#1a1a1c' // 功能性镜片色
  return (
    <group>
      {/* 镜框：Glasses 为 r0.034/tube0.005，这里整体加大加粗 */}
      <mesh position={[-0.046, 1.712, 0.108]}><torusGeometry args={[0.042, 0.008, 10, 28]} /><meshStandardMaterial color={frame} roughness={0.38} /></mesh>
      <mesh position={[0.046, 1.712, 0.108]}><torusGeometry args={[0.042, 0.008, 10, 28]} /><meshStandardMaterial color={frame} roughness={0.38} /></mesh>
      {/* 镜片：扁圆柱（轴沿 Z）压成薄片，不透明深色，盖满镜框内圈（不传 tex） */}
      <mesh position={[-0.046, 1.712, 0.104]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.039, 0.039, 0.007, 22]} /><meshStandardMaterial color={lens} roughness={0.35} /></mesh>
      <mesh position={[0.046, 1.712, 0.104]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.039, 0.039, 0.007, 22]} /><meshStandardMaterial color={lens} roughness={0.35} /></mesh>
      {/* 鼻梁横档 */}
      <mesh position={[0, 1.716, 0.11]}><boxGeometry args={[0.03, 0.009, 0.009]} /><meshStandardMaterial color={frame} roughness={0.38} /></mesh>
      {/* 镜腿：从镜框两侧向后伸展，比 Glasses 更厚更长 */}
      <mesh position={[-0.086, 1.712, 0.062]} rotation={[0, 0.45, 0]}><boxGeometry args={[0.1, 0.009, 0.009]} /><meshStandardMaterial color={frame} roughness={0.38} /></mesh>
      <mesh position={[0.086, 1.712, 0.062]} rotation={[0, -0.45, 0]}><boxGeometry args={[0.1, 0.009, 0.009]} /><meshStandardMaterial color={frame} roughness={0.38} /></mesh>
    </group>
  )
}

// 13) 托特包：方形大手提袋 + 两条竖直提手带。
// 挂在身体另一侧（Bag 在 x=+0.17），且比 Bag（0.20×0.15×0.07）更大更方，避免两包穿模。
function Tote({ item }) {
  const hex = item.hex
  return (
    <group>
      <RoundedBox args={[0.22, 0.24, 0.08]} radius={0.014} smoothness={4} position={[-0.19, 0.88, 0.115]}><Cloth hex={hex} rough={0.75} tex="twill" repeat={3} /></RoundedBox>
      {/* 袋口加固条 */}
      <mesh position={[-0.19, 1.001, 0.115]}><boxGeometry args={[0.216, 0.014, 0.082]} /><Cloth hex={hex} rough={0.9} /></mesh>
      {/* 两条竖直提手带：从袋口向上（托特包的手提带，非 Bag 的斜挎带） */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.19 + s * 0.07, 1.1, 0.115]}><boxGeometry args={[0.018, 0.2, 0.012]} /><Cloth hex={hex} rough={0.8} tex="twill" repeat={2} /></mesh>
      ))}
    </group>
  )
}

// 14) 腰带：竖直扁环 —— torus 默认就在 XY 平面（竖直立着），不要绕 X 转 90°，
// 那会变成 BandRing 那种「绕躯干一圈的横向束带」。z×0.72 压扁以贴合椭圆躯干截面。
function Belt({ item }) {
  const hex = item.hex
  return (
    <group>
      <mesh position={[0, 1.08, 0]} scale={[1, 1, 0.72]}><torusGeometry args={[0.155, 0.014, 10, 44]} /><Cloth hex={hex} rough={0.45} /></mesh>
      {/* 方扣：正前方腹位（z 正向前），金属件用中性银色 */}
      <mesh position={[0, 1.08, 0.118]}><boxGeometry args={[0.035, 0.035, 0.012]} /><Metal /></mesh>
    </group>
  )
}

// 15) 戒指：右手（side=1）手指处的小金属环。
// 定位沿用 Watch 的 ArmGroup 内相对坐标（手腕约在 -0.585），再往外一点放到手指处；
// torus 绕 X 转 90° 让环平面垂直于肢体轴（手指沿 -Y）。
function Ring({ item }) {
  return (
    <ArmGroup side={1}>
      <group position={[0, -0.28, 0]} rotation={[ARM.bend, 0, 0]}>
        <mesh position={[0, -0.638, 0.006]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.009, 0.0025, 8, 20]} /><Metal hex={item.hex} /></mesh>
      </group>
    </ArmGroup>
  )
}

// 16) 长袜：脚踝到小腿下部的开口筒（开口 cylinder + 双面，免得从筒内看不见）。
// 半径必须压过同高度裤腿（-0.74 处约 0.0634、-0.58 处约 0.0710），否则裤腿会从袜筒里穿出来，
// 故上口（小腿）取 0.0755、下口（脚踝）取 0.0695，比裤腿同高度各大约 0.004。
function Socks({ item }) {
  const hex = item.hex
  return (
    <>
      {[-1, 1].map((s) => (
        <LegGroup key={s} side={s}>
          <mesh position={[0, -0.66, 0]}><cylinderGeometry args={[0.0755, 0.0695, 0.16, 28, 1, true]} /><Cloth hex={hex} rough={0.9} side={DS} tex="jersey" /></mesh>
        </LegGroup>
      ))}
    </>
  )
}

// ============ mesh 键 → 网格组件注册表 ============
// 契约见 docs/CONTRACT.md 第 3 节：Mannequin 只认 MESH_KEYS / GarmentMesh，不 import REGISTRY。
export const MESH_KEYS = [
  'bag', 'beanie', 'belt', 'blazer', 'bomber', 'boot', 'canvas', 'cap', 'chelsea', 'coat',
  'derby', 'glasses', 'harrington', 'hoodie', 'joggers', 'loafer', 'longsleeve-tee', 'necklace',
  'none', 'overshirt', 'pants-cargo', 'pants-denim', 'pants-twill', 'polo', 'puffer', 'ring',
  'runner', 'scarf', 'shirt', 'shorts', 'sneaker', 'socks', 'sunglasses', 'sweater', 'sweatshirt',
  'tee', 'tee-stripe', 'tote', 'trench', 'watch',
]

// 每个网格组件只接收 { item } 一个 prop，色一律由组件自己从 item.hex 取。
// 'none' 刻意不在表内：GarmentMesh 会提前 return null。
const REGISTRY = {
  bag: Bag,
  beanie: Beanie,
  belt: Belt,
  blazer: Blazer,
  bomber: Bomber,
  boot: Boot,
  canvas: CanvasShoe,
  cap: Cap,
  chelsea: Chelsea,
  coat: Coat,
  derby: Derby,
  glasses: Glasses,
  harrington: Harrington,
  hoodie: Hoodie,
  joggers: Joggers,
  loafer: Loafer,
  'longsleeve-tee': LongsleeveTee,
  necklace: Necklace,
  overshirt: Overshirt,
  polo: Polo,
  puffer: Puffer,
  ring: Ring,
  runner: Runner,
  scarf: Scarf,
  shirt: Shirt,
  shorts: Shorts,
  sneaker: Sneaker,
  socks: Socks,
  sunglasses: Sunglasses,
  sweater: Sweater,
  sweatshirt: Sweatshirt,
  tee: Tee,
  'tee-stripe': TeeStripe,
  tote: Tote,
  trench: Trench,
  watch: Watch,
  // Pants 的签名是 ({ item, cargo, tex }) —— 三条裤子在这里包一层固定纹样/版型
  'pants-twill': ({ item }) => <Pants item={item} tex="twill" />,
  'pants-denim': ({ item }) => <Pants item={item} tex="denim" />,
  // 迷彩纹理本身带色，再乘单品色会脏，沿用旧版 Mannequin 的约定强制白色材质
  'pants-cargo': ({ item }) => <Pants item={{ ...item, hex: '#ffffff' }} cargo tex="camo" />,
}

// 未知 mesh：只警告一次（同一个 key），不抛异常、不白屏
const warned = new Set()
function warnOnce(key) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[garments] 未注册的 mesh 键：${key}（catalog.js 的 mesh 字段没有对应网格组件）`)
}

export function GarmentMesh({ mesh, item }) {
  if (!item) return null
  const key = mesh ?? item.mesh
  if (!key || key === 'none') return null
  const C = REGISTRY[key]
  if (!C) { warnOnce(key); return null }
  return <C item={item} />
}
