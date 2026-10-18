// ============ 舞台与人体（只保留：身体 / 组装 / 舞台）============
// 服装网格组件与基础图元（ARM/LEG/BODY_TORSO/Skin/HairM/ArmGroup/LegGroup）全部在 ./garments。
// 单品与网格的对应关系由 ./garments 的 GarmentMesh 按 item.mesh 分发，
// 因此本文件不再出现任何 item.id 分支 —— 以后新增单品无需改动 3D 代码。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, byId } from '../data/catalog'
import { ARM, BODY_TORSO, Skin, HairM, ArmGroup, LegGroup, GarmentMesh } from './garments'
import { bodyTransform, cameraTargetFor } from './bodyProfile'

// ============ 身体（最简干净版：平滑曲面，无任何叠加物）============
function Body() {
  return (
    <group>
      {/* 躯干 */}
      <mesh geometry={BODY_TORSO} scale={[1, 1, 0.72]}><Skin /></mesh>
      {/* 颈 */}
      <mesh position={[0, 1.545, 0]}><cylinderGeometry args={[0.05, 0.062, 0.16, 32]} /><Skin /></mesh>
      {/* 头 + 五官 */}
      <mesh position={[0, 1.7, 0.01]} scale={[0.92, 1.15, 0.98]}><sphereGeometry args={[0.115, 48, 32]} /><Skin /></mesh>
      <mesh position={[0, 1.645, 0.028]} scale={[0.82, 0.7, 0.85]}><sphereGeometry args={[0.085, 32, 32]} /><Skin /></mesh>
      <mesh position={[0, 1.677, 0.118]} scale={[0.72, 0.85, 1.15]}><sphereGeometry args={[0.02, 14, 14]} /><Skin /></mesh>
      <mesh position={[-0.043, 1.708, 0.111]} scale={[1, 0.75, 0.6]}><sphereGeometry args={[0.013, 16, 16]} /><meshStandardMaterial color="#3d332c" roughness={0.5} /></mesh>
      <mesh position={[0.043, 1.708, 0.111]} scale={[1, 0.75, 0.6]}><sphereGeometry args={[0.013, 16, 16]} /><meshStandardMaterial color="#3d332c" roughness={0.5} /></mesh>
      <mesh position={[-0.05, 1.735, 0.108]} rotation={[0, 0, 0.12]}><boxGeometry args={[0.052, 0.013, 0.014]} /><HairM /></mesh>
      <mesh position={[0.05, 1.735, 0.108]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.052, 0.013, 0.014]} /><HairM /></mesh>
      {/* 耳朵 */}
      <mesh position={[-0.105, 1.698, 0.005]} scale={[0.45, 1, 0.7]}><sphereGeometry args={[0.032, 16, 16]} /><Skin /></mesh>
      <mesh position={[0.105, 1.698, 0.005]} scale={[0.45, 1, 0.7]}><sphereGeometry args={[0.032, 16, 16]} /><Skin /></mesh>
      {/* 头发 */}
      <mesh position={[0, 1.752, -0.012]} scale={[0.97, 0.92, 1.04]}><sphereGeometry args={[0.118, 28, 28]} /><HairM /></mesh>
      <mesh position={[0, 1.69, -0.062]} scale={[0.88, 1.0, 0.6]}><sphereGeometry args={[0.095, 24, 24]} /><HairM /></mesh>
      <mesh position={[0, 1.755, 0.078]} scale={[1.5, 0.42, 0.85]}><sphereGeometry args={[0.05, 20, 20]} /><HairM /></mesh>
      {/* 腿（锥形，干净无叠加） */}
      {[-1, 1].map((s) => (
        <LegGroup key={'leg' + s} side={s}>
          <mesh position={[0, 0, 0]}><sphereGeometry args={[0.096, 18, 18]} /><Skin /></mesh>
          <mesh position={[0, -0.19, 0]}><cylinderGeometry args={[0.094, 0.072, 0.40, 28]} /><Skin /></mesh>
          <mesh position={[0, -0.395, 0]}><sphereGeometry args={[0.068, 24, 24]} /><Skin /></mesh>
          <mesh position={[0, -0.60, 0]}><cylinderGeometry args={[0.068, 0.049, 0.40, 28]} /><Skin /></mesh>
          <mesh position={[0, -0.867, 0.04]}><boxGeometry args={[0.085, 0.06, 0.24]} /><Skin /></mesh>
        </LegGroup>
      ))}
      {/* 臂（锥形，前臂微屈，干净无叠加） */}
      {[-1, 1].map((s) => (
        <ArmGroup key={'arm' + s} side={s}>
          <mesh position={[0, 0.01, 0]}><sphereGeometry args={[0.048, 24, 24]} /><Skin /></mesh>
          <mesh position={[0, -0.15, 0]}><cylinderGeometry args={[0.052, 0.046, 0.24, 28]} /><Skin /></mesh>
          <group position={[0, -0.28, 0]} rotation={[ARM.bend, 0, 0]}>
            <mesh position={[0, 0, 0]}><sphereGeometry args={[0.046, 24, 24]} /><Skin /></mesh>
            <mesh position={[0, -0.13, 0]}><cylinderGeometry args={[0.046, 0.038, 0.24, 28]} /><Skin /></mesh>
            {/* 腕→掌：渐缩圆柱，上口咬住前臂下缘（r 0.038），下口过渡到掌根（r 0.042） */}
            <mesh position={[0, -0.272, 0]}><cylinderGeometry args={[0.038, 0.042, 0.056, 20]} /><Skin /></mesh>
            {/* 掌：拉长手球（y×1.4），顶部埋进腕柱约 3mm，无穿插无缝隙 */}
            <mesh position={[0, -0.36, 0.008]} scale={[0.85, 1.4, 0.85]}><sphereGeometry args={[0.045, 24, 24]} /><Skin /></mesh>
            {/* 拇指：贴掌侧，内侧与掌重叠约 2mm */}
            <mesh position={[s * -0.042, -0.345, 0.02]} scale={[0.5, 1.4, 0.55]}><sphereGeometry args={[0.018, 14, 14]} /><Skin /></mesh>
          </group>
        </ArmGroup>
      ))}
    </group>
  )
}

// ============ 组装 ============
// 只负责「取出四件主单品 + 配饰数组」，形状一律交给 GarmentMesh 按 mesh 分发。
// outfit 可能为 null/undefined；byId 查不到返回 undefined，缺 mesh 时 GarmentMesh 返回 null。
// transform 由 ./bodyProfile 给出（相对 175cm 匀称身材的倍数）；缺省即 1:1。
// 整身一起缩放是刻意的：身体和衣服始终同一变换，才不会穿帮。
export function Mannequin({ outfit, transform }) {
  const top = byId(TOPS, outfit?.top)
  const outer = byId(OUTERS, outfit?.outer)
  const bottom = byId(BOTTOMS, outfit?.bottom)
  const shoes = byId(SHOES, outfit?.shoes)
  const accs = Array.isArray(outfit?.accs) ? outfit.accs : []
  const scale = Array.isArray(transform?.scale) && transform.scale.length === 3
    ? transform.scale
    : [1, 1, 1]
  return (
    <group scale={scale}>
      <Body />
      <GarmentMesh mesh={top?.mesh} item={top} />
      <GarmentMesh mesh={outer?.mesh} item={outer} />
      <GarmentMesh mesh={bottom?.mesh} item={bottom} />
      <GarmentMesh mesh={shoes?.mesh} item={shoes} />
      {accs.map((id) => {
        const item = byId(ACCS, id)
        return <GarmentMesh key={id} mesh={item?.mesh} item={item} />
      })}
    </group>
  )
}

// ============ 系统「减少动效」偏好 ============
// 读初始值并监听 change，卸载时解绑；为 true 时舞台强制不自动旋转。
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event) => setReduced(event.matches)
    setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// demand 渲染循环下换装不会自动出帧：R3F 只在内部 state 真的变化或有人调 invalidate()
// 时才画一帧。这里显式在 outfit 变化后置脏阴影并请求一帧，否则用户换了上装却看不到变化。
function RedrawOnOutfit({ outfit }) {
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    if (gl) gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, outfit])
  return null
}

// ============ 舞台 ============
// active：舞台是否在视口附近。滚出视口后切到 demand 渲染循环，一帧都不再画
// （修复前滚出视口后实测仍有 4.6 万次 draw call/秒，移动端持续发热耗电）。
// 『always』只在「看得见 + 正在自动旋转」时开启——那是唯一需要连续出帧的情形；
// 其余时候 demand 更省，换装/拖动/惯性阻尼都会各自 invalidate 出帧。
export function Studio({ outfit, autoRotate = false, profile, active = true }) {
  const [glLost, setGlLost] = useState(false)
  // 体型参数 → 整身缩放；profile 为 undefined 时等同基准身材（见 bodyProfile.js）。
  const transform = useMemo(() => bodyTransform(profile), [profile])
  // 卸载时的解绑函数：onCreated 里写入，避免监听器泄漏
  const unbindGlRef = useRef(null)
  const figureRef = useRef(null)
  const glRef = useRef(null)
  const reducedMotion = usePrefersReducedMotion()
  const frameloop = active && autoRotate && !reducedMotion ? 'always' : 'demand'

  // WebGL 上下文丢失降级：丢失时给可见提示，恢复后自动隐藏
  const handleCreated = ({ gl, scene }) => {
    const canvas = gl.domElement
    glRef.current = gl
    // 静态阴影：光位与模型都不动，没必要每帧重画 1024² 阴影贴图。
    // 换装时由 <RedrawOnOutfit> 置 needsUpdate 再重算一次。
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    const onLost = (event) => {
      event.preventDefault() // 阻止默认行为，允许浏览器后续恢复上下文
      setGlLost(true)
    }
    const onRestored = () => setGlLost(false)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    unbindGlRef.current = () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      unbindGlRef.current = null
      glRef.current = null
    }
    // 程序化 IBL：RoomEnvironment（无参构造，three/examples/jsm/environments/RoomEnvironment.js:17）
    // 经 PMREM 生成环境贴图；room 用完 dispose，envMap 保留；不联网、不新增资源。
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    scene.environment = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
  }

  // 身体与服装统一投影/接受投影；依赖 outfit，换装后新建网格会重新打上阴影标记
  useLayoutEffect(() => {
    figureRef.current?.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    if (glRef.current) glRef.current.shadowMap.needsUpdate = true
  }, [outfit])

  // 组件卸载：真正移除 DOM 监听（读 ref，不会拿到过期闭包）
  useEffect(() => () => { if (unbindGlRef.current) unbindGlRef.current() }, [])

  // 画布本身不产出文本：给读屏用户一段可读的造型摘要，而不是一个无名 canvas。
  const outfitNames = [
    byId(TOPS, outfit?.top)?.name,
    outfit?.outer && outfit.outer !== 'o-none' ? byId(OUTERS, outfit.outer)?.name : null,
    byId(BOTTOMS, outfit?.bottom)?.name,
    byId(SHOES, outfit?.shoes)?.name,
    ...(Array.isArray(outfit?.accs) ? outfit.accs.map((id) => byId(ACCS, id)?.name) : []),
  ].filter(Boolean)
  const canvasLabel = `3D 试衣间：${outfitNames.join('、') || '默认造型'}。可拖动旋转。`

  return (
    <div className="stage-canvas-wrap">
      <Canvas
        role="img"
        aria-label={canvasLabel}
        dpr={[1, 2]}
        shadows
        // 非「可见 + 自动旋转」时走 demand：没有 invalidate 就一帧都不画。
        frameloop={frameloop}
        camera={{ position: [0.85, 1.5, 3.85], fov: 33 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={handleCreated}
      >
        <hemisphereLight args={['#ffffff', '#c9c2ae', 1.05]} />
        <directionalLight
          position={[2.5, 4, 3]}
          intensity={1.45}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
          shadow-normalBias={0.02}
          shadow-camera-left={-0.6}
          shadow-camera-right={0.6}
          shadow-camera-top={2.1}
          shadow-camera-bottom={-0.2}
          shadow-camera-near={0.5}
          shadow-camera-far={12}
        />
        <directionalLight position={[-3, 2.5, -2.5]} intensity={0.42} color="#e8eeff" />
        <directionalLight position={[0, 1.2, -4]} intensity={0.3} />
        <directionalLight position={[0, 2.6, 3.6]} intensity={0.45} color="#ffe8d0" />
        <mesh position={[0, -0.005, 0]} receiveShadow>
          <cylinderGeometry args={[0.88, 0.94, 0.014, 56]} />
          <meshStandardMaterial color="#dcd6c5" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.001, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <torusGeometry args={[0.9, 0.006, 8, 64]} />
          <meshStandardMaterial color="#c9c2ae" roughness={0.9} />
        </mesh>
        <group ref={figureRef} position={[0, 0.003, 0]}>
          <Mannequin outfit={outfit} transform={transform} />
        </group>
        <RedrawOnOutfit outfit={outfit} />
        {/* 不传 frames：drei 默认 Infinity，但这里的 Canvas 已切到 demand 渲染循环，
            所以它只会在真正出帧时才计算（闲置时零成本），换装后也必然重算。
            刻意不用 frames={1}：那需要靠 key 重挂载才能刷新，而每次重挂载都会新建
            两个 512² RenderTarget 且 drei 卸载时不 dispose，反而漏 GPU 显存。 */}
        <ContactShadows
          position={[0, 0.012, 0]}
          scale={3.4}
          blur={2.6}
          opacity={0.26}
          far={1.6}
          resolution={512}
          color="#3a3428"
        />
        <OrbitControls
          makeDefault
          target={cameraTargetFor(transform)}
          enablePan={false}
          // 页面是 15 屏的长文，滚轮必须留给页面滚动：劫持滚轮会让用户在试衣间里卡住。
          enableZoom={false}
          minDistance={2}
          maxDistance={6.2}
          maxPolarAngle={1.62}
          // autoRotate 必须受 active 约束：three 的 autoRotate 每次 update 都会 dispatch
          // 'change'，而 drei 的 change 回调会 invalidate —— 只要自动旋转还在，
          // 即使 frameloop='demand' 也会被它一帧帧续上，等于没停下来。
          autoRotate={active && autoRotate && !reducedMotion}
          autoRotateSpeed={1.5}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
      {glLost && (
        <div className="stage-gl-lost" role="status">
          3D 预览已暂停（图形上下文丢失），请刷新页面
        </div>
      )}
    </div>
  )
}
