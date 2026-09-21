import * as THREE from 'three'

const SHARED_RESOURCE = '__sharedResource'
const OWNED_TEXTURES = '__ownedTextures'

export function markSharedGeometry(geometry: THREE.BufferGeometry): void {
  geometry.userData[SHARED_RESOURCE] = true
}

export function markSharedMaterial(material: THREE.Material): void {
  material.userData[SHARED_RESOURCE] = true
}

export function markSharedModelResources(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    markSharedGeometry(object.geometry)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (let i = 0; i < materials.length; i++) markSharedMaterial(materials[i])
  })
}

export function registerOwnedTextures(
  material: THREE.Material,
  textures: readonly THREE.Texture[],
): void {
  material.userData[OWNED_TEXTURES] = [...textures]
}

export function disposeObjectResources(roots: Iterable<THREE.Object3D>): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const instances = new Set<THREE.InstancedMesh>()

  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
      for (let i = 0; i < meshMaterials.length; i++) materials.add(meshMaterials[i])
      if (object instanceof THREE.InstancedMesh) instances.add(object)
    })
  }

  for (const instance of instances) instance.dispose()
  for (const geometry of geometries) {
    if (geometry.userData[SHARED_RESOURCE] !== true) geometry.dispose()
  }
  for (const material of materials) {
    if (material.userData[SHARED_RESOURCE] === true) continue
    const textures = material.userData[OWNED_TEXTURES]
    if (Array.isArray(textures)) {
      for (let i = 0; i < textures.length; i++) {
        if (textures[i] instanceof THREE.Texture) textures[i].dispose()
      }
    }
    material.dispose()
  }
}
