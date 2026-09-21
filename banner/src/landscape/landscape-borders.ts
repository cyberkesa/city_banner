import * as THREE from 'three'
import { markSharedMaterial } from '../models/resource-lifecycle'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const GRASS_BORDER_STRAIGHT_LENGTH = 0.65
const GRASS_BORDER_CURVE_LENGTH = 0.28
const GRASS_BORDER_BLOCK_WIDTH = 0.085
const GRASS_BORDER_BLOCK_HEIGHT = 0.045


const grassBorderMaterial = new THREE.MeshStandardMaterial({
  color: 0xaaa69d,
  roughness: 0.98,
  metalness: 0,
  side: THREE.FrontSide,
})

const rubberOutlineMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3f1ed,
  roughness: 0.9,
  metalness: 0,
  side: THREE.FrontSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})

markSharedMaterial(grassBorderMaterial)
markSharedMaterial(rubberOutlineMaterial)

function createGrassBorderGeometry(
  curve: THREE.Curve<THREE.Vector2>,
  startT: number,
  endT: number,
  subdivisions: number,
  topY: number,
  width = GRASS_BORDER_BLOCK_WIDTH,
  height = GRASS_BORDER_BLOCK_HEIGHT,
  centerOffset = height * 0.12,
  addCaps = true
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2
  const centerY = topY + centerOffset
  const top = centerY + height / 2
  const bottom = centerY - height / 2

  for (let index = 0; index <= subdivisions; index += 1) {
    const localProgress = index / subdivisions
    const t = THREE.MathUtils.lerp(startT, endT, localProgress)
    const point = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    const normalX = -tangent.y
    const normalZ = tangent.x

    positions.push(
      point.x + normalX * halfWidth, top, point.y + normalZ * halfWidth,
      point.x - normalX * halfWidth, top, point.y - normalZ * halfWidth,
      point.x + normalX * halfWidth, bottom, point.y + normalZ * halfWidth,
      point.x - normalX * halfWidth, bottom, point.y - normalZ * halfWidth
    )

    
    uvs.push(
      0, localProgress,
      1, localProgress,
      0, localProgress,
      1, localProgress
    )
  }

  for (let index = 0; index < subdivisions; index += 1) {
    const current = index * 4
    const next = (index + 1) * 4

    indices.push(
      
      current, next, current + 1,
      next, next + 1, current + 1,
      
      current + 2, current + 3, next + 2,
      next + 2, current + 3, next + 3,
      
      current, current + 2, next,
      next, current + 2, next + 2,
      
      current + 1, next + 1, current + 3,
      next + 1, next + 3, current + 3
    )
  }

  if (addCaps) {
    const last = subdivisions * 4
    indices.push(
      
      0, 1, 2,
      1, 3, 2,
      
      last, last + 2, last + 1,
      last + 1, last + 2, last + 3
    )
  }

  let geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)

  
  geometry = geometry.toNonIndexed()
  geometry.computeVertexNormals()

  return geometry
}

export function createGrassBorder(
  shape: THREE.Shape,
  topY: number,
  name: string
): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = []

  for (const curve of shape.curves) {
    const curved = !(curve instanceof THREE.LineCurve)
    const curveLength = curve.getLength()
    const targetLength = curved
      ? GRASS_BORDER_CURVE_LENGTH
      : GRASS_BORDER_STRAIGHT_LENGTH
    const pieceCount = Math.max(
      curved ? 2 : 1,
      Math.ceil(curveLength / targetLength)
    )

    for (let index = 0; index < pieceCount; index += 1) {
      const geom = createGrassBorderGeometry(
        curve,
        index / pieceCount,
        (index + 1) / pieceCount,
        curved ? 6 : 1,
        topY,
        GRASS_BORDER_BLOCK_WIDTH,
        GRASS_BORDER_BLOCK_HEIGHT,
        GRASS_BORDER_BLOCK_HEIGHT * 0.12,
        true 
      )
      geometries.push(geom)
    }
  }

  const mergedGeometry = mergeGeometries(geometries, false)
  geometries.forEach((g) => g.dispose())

  if (!mergedGeometry) {
    throw new Error(`Не удалось собрать бордюр ${name}`)
  }

  const border = new THREE.Mesh(mergedGeometry, grassBorderMaterial)
  border.name = name
  border.castShadow = true
  border.receiveShadow = true

  return border
}

export function createRubberOutline(
  shape: THREE.Shape,
  topY: number,
  name: string
): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = []

  for (const curve of shape.curves) {
    const curved = !(curve instanceof THREE.LineCurve)
    
    const geom = createGrassBorderGeometry(
      curve,
      0,
      1,
      curved ? 18 : 1,
      topY,
      0.065,
      0.006,
      -0.003,
      false 
    )
    geometries.push(geom)
  }

  const mergedGeometry = mergeGeometries(geometries, false)
  geometries.forEach((g) => g.dispose())

  if (!mergedGeometry) {
    throw new Error(`Не удалось собрать обводку ${name}`)
  }

  const outline = new THREE.Mesh(mergedGeometry, rubberOutlineMaterial)
  outline.name = name
  outline.castShadow = false
  outline.receiveShadow = false

  return outline
}
