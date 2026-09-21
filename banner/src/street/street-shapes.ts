import * as THREE from 'three'

import {
  HALF_LOOP,
  MARKING_Y,
  ROAD_BACK_Z,
  ROAD_FRONT_Z,
  SCENE_BACK_Z,
  SIDE_LEFT_X,
  SIDE_RIGHT_X,
  STREET,
  type StreetSide,
} from './street-config'
import { STREET_MATERIALS } from './street-materials'

const makeShapeMesh = (
  shape: THREE.Shape,
  material: THREE.Material,
  y: number,
  receiveShadow = false,
  castShadow = false
): THREE.Mesh => {
  const geometry = new THREE.ShapeGeometry(shape, 16)
  geometry.rotateX(Math.PI * 0.5)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = y
  mesh.receiveShadow = receiveShadow
  mesh.castShadow = castShadow
  return mesh
}

export function makeExtrudedMesh(
  shape: THREE.Shape,
  depth: number,
  topY: number,
  material: THREE.Material,
  castShadow = false
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  geometry.rotateX(Math.PI * 0.5)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = topY
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

export const makeFlatMesh = (shape: THREE.Shape, material: THREE.Material): THREE.Mesh =>
  makeShapeMesh(shape, material, MARKING_Y)

export const makeSidewalkSurfaceMesh = (shape: THREE.Shape, material: THREE.Material): THREE.Mesh =>
  makeShapeMesh(shape, material, STREET.sidewalkSurfaceY, true)

export function rectShape(width: number, depth: number, radius = 0): THREE.Shape {
  const hw = width * 0.5, hd = depth * 0.5
  const r = Math.min(radius, hw, hd)
  const shape = new THREE.Shape()

  if (r <= 0) {
    return shape.moveTo(-hw, -hd).lineTo(hw, -hd).lineTo(hw, hd).lineTo(-hw, hd).closePath()
  }

  return shape
    .moveTo(-hw + r, -hd)
    .lineTo(hw - r, -hd).quadraticCurveTo(hw, -hd, hw, -hd + r)
    .lineTo(hw, hd - r).quadraticCurveTo(hw, hd, hw - r, hd)
    .lineTo(-hw + r, hd).quadraticCurveTo(-hw, hd, -hw, hd - r)
    .lineTo(-hw, -hd + r).quadraticCurveTo(-hw, -hd, -hw + r, -hd)
    .closePath()
}

export function addRectMarking(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  x: number,
  z: number,
  radius = 0,
  paint: THREE.Material = STREET_MATERIALS.marking
): void {
  const mesh = makeFlatMesh(rectShape(width, depth, radius), paint)
  mesh.position.set(x, MARKING_Y, z)
  parent.add(mesh)
}

export function boundary(side: StreetSide, offset: number, arcSegments = 16): THREE.Vector2[] {
  const radius = STREET.junctionRadius + offset
  if (radius <= 0) throw new Error('Invalid street offset')

  const isLeft = side === 'left'
  const sign = isLeft ? 1 : -1
  const baseX = isLeft ? SIDE_LEFT_X : SIDE_RIGHT_X
  const centerX = baseX - sign * STREET.junctionRadius
  const centerZ = ROAD_BACK_Z - STREET.junctionRadius
  const sideX = baseX + sign * offset
  const mainZ = ROAD_BACK_Z + offset
  const endX = isLeft ? -HALF_LOOP : HALF_LOOP

  const points: THREE.Vector2[] = [
    new THREE.Vector2(sideX, SCENE_BACK_Z),
    new THREE.Vector2(sideX, centerZ),
  ]

  const startAngle = isLeft ? 0 : Math.PI
  const angleStep = (isLeft ? 0.5 : -0.5) * Math.PI / arcSegments

  for (let i = 0; i <= arcSegments; i++) {
    const a = startAngle + i * angleStep
    points.push(new THREE.Vector2(centerX + Math.cos(a) * radius, centerZ + Math.sin(a) * radius))
  }

  points.push(new THREE.Vector2(endX, mainZ))
  return points
}

export function polygon(points: readonly THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y)
  return shape.closePath()
}

export function boundaryBand(side: StreetSide, outerOffset: number, innerOffset: number): THREE.Shape {
  const out = boundary(side, outerOffset)
  const inn = boundary(side, innerOffset)
  const shape = new THREE.Shape()

  shape.moveTo(out[0].x, out[0].y)
  for (let i = 1; i < out.length; i++) shape.lineTo(out[i].x, out[i].y)
  for (let i = inn.length - 1; i >= 0; i--) shape.lineTo(inn[i].x, inn[i].y)

  return shape.closePath()
}

export function roadShape(): THREE.Shape {
  const left = boundary('left', 0)
  const right = boundary('right', 0)
  const shape = new THREE.Shape()

  shape.moveTo(-HALF_LOOP, ROAD_FRONT_Z)
  shape.lineTo(HALF_LOOP, ROAD_FRONT_Z)
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y)
  shape.lineTo(SIDE_LEFT_X, SCENE_BACK_Z)
  for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y)

  return shape.closePath()
}

export function backSidewalkShape(side: StreetSide): THREE.Shape {
  const outside = boundary(side, -STREET.curbWidth)
  const shape = new THREE.Shape()

  if (side === 'left') {
    shape.moveTo(-HALF_LOOP, SCENE_BACK_Z)
    for (let i = 0; i < outside.length; i++) shape.lineTo(outside[i].x, outside[i].y)
  } else {
    shape.moveTo(outside[0].x, outside[0].y)
    for (let i = 1; i < outside.length; i++) shape.lineTo(outside[i].x, outside[i].y)
    shape.lineTo(HALF_LOOP, ROAD_BACK_Z - STREET.curbWidth)
    shape.lineTo(HALF_LOOP, SCENE_BACK_Z)
  }

  return shape.closePath()
}