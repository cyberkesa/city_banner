import * as THREE from 'three'


export function freezeStaticTransforms(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    object.matrixAutoUpdate = false
    object.matrixWorldNeedsUpdate = false
  })
}
