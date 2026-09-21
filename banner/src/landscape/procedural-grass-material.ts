import * as THREE from 'three'

export type ProceduralGrassOptions = {
  color?: THREE.ColorRepresentation
}

export function createProceduralGrassMaterial(
  options: ProceduralGrassOptions = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: options.color ?? 0x4a7c34,
    roughness: 0.96,
    metalness: 0,
  })
}
