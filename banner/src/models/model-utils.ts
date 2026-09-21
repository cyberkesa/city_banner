import * as THREE from 'three'

export type ModelTransform = {
  scale?: number
  rotationY?: number
}


const _box = new THREE.Box3()
const _center = new THREE.Vector3()


export function centerModelOnGround(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)

  _box.setFromObject(root)
  if (_box.isEmpty()) return 

  _box.getCenter(_center)
  const minY = _box.min.y

  
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    child.position.x -= _center.x
    child.position.z -= _center.z
    child.position.y -= minY
  }

  
  root.updateMatrixWorld(true)
}


export function setupModelShadows(
  root: THREE.Object3D,
  castShadow = true,
  receiveShadow = true,
  ignoreTransparent = true
): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    
    if (ignoreTransparent) {
      const mat = object.material
      const isTransparent = Array.isArray(mat)
        ? mat.some((m) => m.transparent && m.opacity < 0.9)
        : mat.transparent && mat.opacity < 0.9

      if (isTransparent) {
        object.castShadow = false
        object.receiveShadow = receiveShadow
        return
      }
    }

    object.castShadow = castShadow
    object.receiveShadow = receiveShadow
  })
}


export function applyModelTransform(
  root: THREE.Object3D,
  transform: ModelTransform
): void {
  if (transform.scale !== undefined) {
    root.scale.setScalar(transform.scale)
  }

  if (transform.rotationY !== undefined) {
    root.rotation.y = THREE.MathUtils.degToRad(transform.rotationY)
  }
}