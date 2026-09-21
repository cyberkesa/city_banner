import * as THREE from 'three'
import { MAX_PIXEL_RATIO } from './runtime.config'

const CAMERA_FOV = 20
const CAMERA_POS = new THREE.Vector3(0, 4, 15)
const CAMERA_TARGET = new THREE.Vector3(0, 0.8, -0.35)

export type SceneRuntime = {
  scene: THREE.Scene
  world: THREE.Group
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  hemisphereLight: THREE.HemisphereLight
  shadowMapSize: number
  setSceneOffsetX: (offsetX: number) => void
  dispose: () => void
}

export function createSceneRuntime(
  container: HTMLDivElement,
  onResize?: (width: number, height: number) => void
): SceneRuntime {
  const scene = new THREE.Scene()
  const bg = new THREE.Color(0xf2f3f5)
  const world = new THREE.Group()

  scene.background = bg
  scene.fog = new THREE.Fog(bg, 28, 55)
  scene.add(world)

  const w = Math.max(1, container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1))
  const h = Math.max(1, container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1))

  
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, 1.5, 60)
  camera.position.copy(CAMERA_POS)
  camera.lookAt(CAMERA_TARGET)

  
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  })

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  renderer.setPixelRatio(Math.min(dpr, MAX_PIXEL_RATIO))
  renderer.setSize(w, h, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const NeutralToneMapping = (THREE as Record<string, any>).NeutralToneMapping
  renderer.toneMapping = NeutralToneMapping ?? THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xb5bbc4, 1.5)
  scene.add(hemisphereLight)

  const sun = new THREE.DirectionalLight(0xffffff, 3.1)
  sun.position.set(6, 14, 8)
  sun.castShadow = true
  sun.target.position.copy(CAMERA_TARGET)
  scene.add(sun, sun.target)

  const shadowMapSize = w <= 760 ? 1024 : 2048
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  sun.shadow.bias = -0.0001
  sun.shadow.normalBias = 0.025

  Object.assign(sun.shadow.camera, {
    near: 1, far: 36,
    left: -11, right: 11,
    top: 8, bottom: -6,
  }).updateProjectionMatrix()

  const setSceneOffsetX = (offsetX: number): void => {
    const viewX = -offsetX
    camera.position.x = CAMERA_POS.x + viewX
    sun.position.x = 6 + viewX
    sun.target.position.x = CAMERA_TARGET.x + viewX
  }

  
  const ro = new ResizeObserver(([entry]) => {
    if (!entry) return
    const rw = entry.contentRect.width | 0
    const rh = entry.contentRect.height | 0

    if (rw > 0 && rh > 0) {
      camera.aspect = rw / rh
      camera.updateProjectionMatrix()
      renderer.setSize(rw, rh, false)
      onResize?.(rw, rh)
    }
  })

  ro.observe(container)

  
  const dispose = () => {
    ro.disconnect()
    sun.shadow.map?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }

  return { scene, world, camera, renderer, sun, hemisphereLight, shadowMapSize, setSceneOffsetX, dispose }
}
