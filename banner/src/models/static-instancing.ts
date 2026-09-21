import * as THREE from 'three'
import { centerModelOnGround } from './model-utils'
import { markSharedGeometry, markSharedMaterial } from './resource-lifecycle'

export type StaticInstancePart = { mesh: THREE.Mesh; localMatrix: THREE.Matrix4 }

export type StaticInstanceTemplate = {
  root: THREE.Group
  meshes: THREE.Mesh[]
  parts: StaticInstancePart[]
  baseBounds: THREE.Box3
}

export type StaticInstanceTransform = {
  position: readonly [number, number, number]
  scale: number
  rotationY: number
  groundOffset?: number
}

export type PreparedStaticInstance = {
  matrices: THREE.Matrix4[]
  bounds: THREE.Box3
}

export const instanceBoundsGeometry = new THREE.BoxGeometry(1, 1, 1)
export const instanceBoundsMaterial = new THREE.MeshBasicMaterial({ visible: false })
markSharedGeometry(instanceBoundsGeometry)
markSharedMaterial(instanceBoundsMaterial)


const _mat = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _boxHelper = new THREE.Vector3()

const DEG2RAD_HALF = Math.PI / 360 

export function staticModelSupportsInstancing(root: THREE.Object3D): boolean {
  let hasMeshes = false
  let invalid = false

  root.traverse((obj) => {
    if (invalid) return
    if (obj instanceof THREE.Mesh) {
      hasMeshes = true
      if (obj instanceof THREE.SkinnedMesh || Array.isArray(obj.material) || Object.keys(obj.morphTargetDictionary ?? {}).length > 0) {
        invalid = true
      }
    } else if (obj instanceof THREE.Line || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
      invalid = true
    }
  })

  return hasMeshes && !invalid
}

export function createStaticInstanceTemplate(source: THREE.Group): StaticInstanceTemplate {
  const root = source.clone(true)
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1)
  root.updateMatrixWorld(true)
  centerModelOnGround(root)
  root.updateMatrixWorld(true)

  const parts: StaticInstancePart[] = []
  const meshes: THREE.Mesh[] = []
  const baseBounds = new THREE.Box3().setFromObject(root)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshes.push(obj)
      parts.push({
        mesh: obj,
        localMatrix: new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld),
      })
    }
  })

  return { root, meshes, parts, baseBounds }
}

export function prepareStaticInstance(
  template: StaticInstanceTemplate,
  t: StaticInstanceTransform
): PreparedStaticInstance {
  
  const halfAngle = t.rotationY * DEG2RAD_HALF
  _quat.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle))
  _scale.setScalar(t.scale)
  _pos.set(t.position[0], t.position[1] + (t.groundOffset ?? 0), t.position[2])

  
  _mat.compose(_pos, _quat, _scale)

  
  const matrices = template.parts.map((p) => new THREE.Matrix4().multiplyMatrices(_mat, p.localMatrix))

  
  const bounds = new THREE.Box3().copy(template.baseBounds).applyMatrix4(_mat)

  return { matrices, bounds }
}

export function configureInstanceBoundsProxy(root: THREE.Object3D, proxy: THREE.Mesh, bounds: THREE.Box3): void {
  bounds.getSize(proxy.scale)
  bounds.getCenter(_boxHelper)
  proxy.position.copy(_boxHelper).sub(root.position)
  proxy.updateMatrix()
}
