import * as THREE from 'three'

import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop'
import {
  ROAD_FRONT_Z,
  SCENE_FRONT_Z,
  STREET,
} from './street-config'
import { addCurbs } from './street-curbs'
import { addStreetMarkings } from './street-markings'
import { STREET_MATERIALS } from './street-materials'
import {
  backSidewalkShape,
  boundaryBand,
  makeExtrudedMesh,
  makeSidewalkSurfaceMesh,
  rectShape,
  roadShape,
} from './street-shapes'

function addSidewalk(parent: THREE.Object3D): void {
  for (const side of ['left', 'right'] as const) {
    parent.add(makeExtrudedMesh(
      backSidewalkShape(side),
      STREET.sidewalkThickness,
      0,
      STREET_MATERIALS.sidewalk
    ))
  }

  const frontDepth =
    SCENE_FRONT_Z - ROAD_FRONT_Z - STREET.curbWidth
  const front = makeExtrudedMesh(
    rectShape(LOOP_WIDTH, frontDepth),
    STREET.sidewalkThickness,
    0,
    STREET_MATERIALS.sidewalk
  )
  front.position.z =
    ROAD_FRONT_Z + STREET.curbWidth + frontDepth / 2
  parent.add(front)
}

function addSidewalkEdge(parent: THREE.Object3D): void {
  const outerOffset =
    -STREET.curbWidth - STREET.sidewalkEdgeWidth
  const innerOffset = -STREET.curbWidth

  for (const side of ['left', 'right'] as const) {
    parent.add(makeSidewalkSurfaceMesh(
      boundaryBand(side, outerOffset, innerOffset),
      STREET_MATERIALS.sidewalkEdge
    ))
  }

  const front = makeSidewalkSurfaceMesh(
    rectShape(LOOP_WIDTH, STREET.sidewalkEdgeWidth),
    STREET_MATERIALS.sidewalkEdge
  )
  front.position.z =
    ROAD_FRONT_Z + STREET.curbWidth + STREET.sidewalkEdgeWidth / 2
  parent.add(front)
}

function addRoad(parent: THREE.Object3D): void {
  parent.add(makeExtrudedMesh(
    roadShape(),
    STREET.roadThickness,
    STREET.roadTopY,
    STREET_MATERIALS.road
  ))
}

function createSegment(centerX: number): THREE.Group {
  const segment = new THREE.Group()
  segment.name = `street:${centerX}`
  segment.position.x = centerX

  addSidewalk(segment)
  addSidewalkEdge(segment)
  addRoad(segment)
  addCurbs(segment)
  addStreetMarkings(segment)
  return segment
}

export function createStreet(world: THREE.Group): THREE.Group {
  const street = new THREE.Group()
  street.name = 'street'

  for (const cycle of LOOP_COPIES) {
    street.add(createSegment(cycle * LOOP_WIDTH))
  }

  world.add(street)
  return street
}
