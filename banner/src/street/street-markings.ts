import * as THREE from 'three'

import { LOOP_WIDTH } from '../core/loop'
import {
  HALF_LOOP,
  ROAD_BACK_Z,
  ROAD_FRONT_Z,
  SCENE_BACK_Z,
  SIDE_LEFT_X,
  SIDE_RIGHT_X,
  STREET,
  type StreetAxis,
} from './street-config'
import { STREET_MATERIALS } from './street-materials'
import { addRectMarking, boundaryBand, makeFlatMesh } from './street-shapes'

const putMarking = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  x: number,
  z: number,
  r = 0,
  isX = true,
  mat: THREE.Material = STREET_MATERIALS.marking
) => addRectMarking(parent, isX ? w : h, isX ? h : w, isX ? x : z, isX ? z : x, r, mat)

function addEdgeLines(parent: THREE.Object3D): void {
  const hw = STREET.edgeLineWidth * 0.5
  const inset = STREET.edgeLineInset

  for (const s of ['left', 'right'] as const) {
    parent.add(makeFlatMesh(boundaryBand(s, inset - hw, inset + hw), STREET_MATERIALS.marking))
  }

  addRectMarking(parent, LOOP_WIDTH, STREET.edgeLineWidth, 0, ROAD_FRONT_Z - inset, hw)
}

function addDashedCenterLine(
  parent: THREE.Object3D,
  axis: StreetAxis,
  fixed: number,
  start: number,
  end: number,
  dashLen: number,
  period: number,
  dashW: number,
  skip?: (pos: number) => boolean
): void {
  const isX = axis === 'x'
  const rad = dashW * 0.25

  for (let pos = start + period * 0.5; pos < end; pos += period) {
    if (skip?.(pos)) continue
    putMarking(parent, dashLen, dashW, pos, fixed, rad, isX)
  }
}

function addCenterLines(parent: THREE.Object3D): void {
  const mc = STREET.mainCrosswalkWidth * 0.5 + 0.3
  const jc = STREET.sideRoadWidth * 0.5 + STREET.junctionRadius + 0.2
  const sc = STREET.sideCrosswalkDepth * 0.5 + 0.22

  addDashedCenterLine(
    parent, 'x', STREET.roadCenterZ, -HALF_LOOP, HALF_LOOP,
    STREET.mainDashLength, STREET.mainDashPeriod, STREET.mainDashWidth,
    (x) => Math.abs(x - STREET.mainCrosswalkX) < mc || Math.abs(x - STREET.sideRoadX) < jc
  )

  addDashedCenterLine(
    parent, 'z', STREET.sideRoadX, SCENE_BACK_Z, ROAD_BACK_Z - STREET.junctionRadius - 0.15,
    STREET.sideDashLength, STREET.sideDashPeriod, STREET.sideDashWidth,
    (z) => Math.abs(z - STREET.sideCrosswalkZ) < sc
  )
}

function addCrosswalk(
  parent: THREE.Object3D,
  axis: StreetAxis,
  center: number,
  start: number,
  end: number,
  size: number,
  gap: number,
  len: number
): void {
  const avail = end - start
  if (avail < size) return

  const step = size + gap
  const count = ((avail + gap) / step) | 0
  const first = start + (avail - (count - 1) * step) * 0.5
  const isZ = axis === 'z'

  for (let i = 0; i < count; i++) {
    const paint = (i & 1) === 0 ? STREET_MATERIALS.marking : STREET_MATERIALS.markingYellow
    putMarking(parent, size, len, first + i * step, center, STREET.crosswalkStripeRadius, !isZ, paint)
  }
}

function addCrosswalks(parent: THREE.Object3D): void {
  const c = STREET.edgeLineInset + STREET.edgeLineWidth * 0.5 + STREET.crosswalkEdgeGap

  addCrosswalk(parent, 'z', STREET.mainCrosswalkX, ROAD_BACK_Z + c, ROAD_FRONT_Z - c, 0.26, 0.06, STREET.mainCrosswalkWidth)
  addCrosswalk(parent, 'x', STREET.sideCrosswalkZ, SIDE_LEFT_X + c, SIDE_RIGHT_X - c, 0.18, 0.05, STREET.sideCrosswalkDepth)
}

export function addStreetMarkings(parent: THREE.Object3D): void {
  addEdgeLines(parent)
  addCenterLines(parent)
  addCrosswalks(parent)
}