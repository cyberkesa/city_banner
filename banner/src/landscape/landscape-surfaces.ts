import * as THREE from 'three'

import { pointInPolygon } from './landscape-geometry'
import { sampleSurfacePoints } from './landscape-shapes'
import type {
  LandscapeMap,
  LandscapePoint,
} from './landscape-types'

const SURFACE_TOP_Y = 0.024
const SURFACE_DEPTH = 0.018
const SURFACE_LAYER_STEP = 0.003

export function surfaceLayerY(index: number): number {
  return SURFACE_TOP_Y + index * SURFACE_LAYER_STEP
}

export function groundHeightForPoint(
  map: LandscapeMap,
  point: LandscapePoint
): number {
  let height = 0.002

  map.surfaces.forEach((surface, index) => {
    if (pointInPolygon(point, sampleSurfacePoints(surface))) {
      height = surfaceLayerY(index) + 0.002
    }
  })

  return height
}

export function createSurfaceMesh(
  shape: THREE.Shape,
  material: THREE.Material,
  topY: number,
  name: string
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SURFACE_DEPTH,
    bevelEnabled: false,
    curveSegments: 12,
  })
  geometry.rotateX(Math.PI / 2)

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.y = topY
  mesh.receiveShadow = true
  return mesh
}
