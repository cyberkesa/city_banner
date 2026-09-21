import * as THREE from 'three'

import {
  CURB_HEIGHT,
  HALF_LOOP,
  ROAD_BACK_Z,
  ROAD_FRONT_Z,
  SCENE_BACK_Z,
  SIDE_LEFT_X,
  SIDE_RIGHT_X,
  STREET,
  type StreetSide,
} from './street-config'
import { STREET_MATERIALS } from './street-materials'
import { rectShape } from './street-shapes'

const _mat = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _rot0 = new THREE.Quaternion()
const _rot90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5)

function makeCurbGeometry(shapes: THREE.Shape | THREE.Shape[]): THREE.ExtrudeGeometry {
  const b = STREET.curbBevelSize
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: CURB_HEIGHT - b * 2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: b,
    bevelThickness: b,
    curveSegments: 4,
  })
  geo.rotateX(Math.PI * 0.5)
  geo.computeVertexNormals()
  return geo
}

function addStraightCurbs(parent: THREE.Object3D): void {
  const curveZ = ROAD_BACK_Z - STREET.junctionRadius
  const halfCurb = STREET.curbWidth * 0.5

  const runs = [
    { isX: true, fixed: ROAD_FRONT_Z + halfCurb, start: -HALF_LOOP, end: HALF_LOOP },
    { isX: true, fixed: ROAD_BACK_Z - halfCurb, start: -HALF_LOOP, end: SIDE_LEFT_X - STREET.junctionRadius },
    { isX: true, fixed: ROAD_BACK_Z - halfCurb, start: SIDE_RIGHT_X + STREET.junctionRadius, end: HALF_LOOP },
    { isX: false, fixed: SIDE_LEFT_X - halfCurb, start: SCENE_BACK_Z, end: curveZ },
    { isX: false, fixed: SIDE_RIGHT_X + halfCurb, start: SCENE_BACK_Z, end: curveZ },
  ]

  let totalCount = 0
  const preparedRuns = runs.map((r) => {
    const len = r.end - r.start
    const count = Math.max(1, Math.round(len / STREET.curbBlockLength))
    totalCount += count
    return {
      ...r,
      count,
      pitch: len / count,
      blockLen: len / count - STREET.curbGap,
    }
  })

  const baseLen = STREET.curbBlockLength - STREET.curbGap
  const blockShape = rectShape(baseLen, STREET.curbWidth - STREET.curbBevelSize * 2, 0.008)
  const curbs = new THREE.InstancedMesh(makeCurbGeometry(blockShape), STREET_MATERIALS.curb, totalCount)
  const posY = STREET.curbTopY - STREET.curbBevelSize

  let idx = 0
  for (let i = 0; i < preparedRuns.length; i++) {
    const r = preparedRuns[i]
    const q = r.isX ? _rot0 : _rot90
    _scale.set(r.blockLen / baseLen, 1, 1)

    for (let j = 0; j < r.count; j++) {
      const p = r.start + (j + 0.5) * r.pitch
      _pos.set(r.isX ? p : r.fixed, posY, r.isX ? r.fixed : p)
      _mat.compose(_pos, q, _scale)
      curbs.setMatrixAt(idx++, _mat)
    }
  }

  curbs.instanceMatrix.needsUpdate = true
  curbs.computeBoundingBox()
  curbs.computeBoundingSphere()
  curbs.castShadow = true
  curbs.receiveShadow = true
  curbs.name = 'curbs:straight'
  parent.add(curbs)
}

function curvedCurbShape(side: StreetSide, blockIndex: number): THREE.Shape {
  const isLeft = side === 'left'
  const sign = isLeft ? 1 : -1
  const baseX = isLeft ? SIDE_LEFT_X : SIDE_RIGHT_X
  const cx = baseX - sign * STREET.junctionRadius
  const cz = ROAD_BACK_Z - STREET.junctionRadius

  const rRoad = STREET.junctionRadius - STREET.curbBevelSize
  const rWalk = STREET.junctionRadius - STREET.curbWidth + STREET.curbBevelSize
  const rMid = STREET.junctionRadius - STREET.curbWidth * 0.5

  const blockAngle = (Math.PI * 0.5) / STREET.curbCurveBlocks
  const gapAngle = (STREET.curbGap + STREET.curbBevelSize * 2) / rMid
  const curveStart = isLeft ? 0 : Math.PI * 0.5

  const a0 = curveStart + blockIndex * blockAngle + gapAngle * 0.5
  const a1 = curveStart + (blockIndex + 1) * blockAngle - gapAngle * 0.5

  const shape = new THREE.Shape()
  shape.absarc(cx, cz, rRoad, a0, a1, false)
  shape.absarc(cx, cz, rWalk, a1, a0, true)
  return shape.closePath()
}

function addCurvedCurbs(parent: THREE.Object3D): void {
  const shapes: THREE.Shape[] = []

  for (const side of ['left', 'right'] as const) {
    for (let index = 0; index < STREET.curbCurveBlocks; index++) {
      shapes.push(curvedCurbShape(side, index))
    }
  }

  const curbs = new THREE.Mesh(makeCurbGeometry(shapes), STREET_MATERIALS.curb)
  curbs.position.y = STREET.curbTopY - STREET.curbBevelSize
  curbs.castShadow = true
  curbs.receiveShadow = true
  curbs.name = 'curbs:curved'
  parent.add(curbs)
}

export function addCurbs(parent: THREE.Object3D): void {
  addStraightCurbs(parent)
  addCurvedCurbs(parent)
}