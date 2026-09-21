import { CITY_LAYOUT } from '../core/city-layout'
import { LOOP_WIDTH } from '../core/loop'

export const STREET = {
  sidewalkDepth: CITY_LAYOUT.depth,
  sidewalkThickness: 0.12,
  sidewalkEdgeWidth: 0.42,
  sidewalkSurfaceY: 0.003,
  roadWidth: CITY_LAYOUT.mainRoad.width,
  roadCenterZ: CITY_LAYOUT.mainRoad.centerZ,
  roadTopY: -0.045,
  roadThickness: 0.08,
  sideRoadX: CITY_LAYOUT.sideRoad.centerX,
  sideRoadWidth: CITY_LAYOUT.sideRoad.width,
  junctionRadius: CITY_LAYOUT.junctionRadius,
  curbWidth: 0.15,
  curbTopY: 0.025,
  curbBlockLength: 0.75,
  curbGap: 0.018,
  curbBevelSize: 0.004,
  curbCurveBlocks: 3,
  curbCurveSegments: 4,
  edgeLineWidth: 0.06,
  edgeLineInset: 0.14,
  crosswalkEdgeGap: 0.1,
  crosswalkStripeRadius: 0.008,
  mainCrosswalkX: CITY_LAYOUT.crosswalks.main.centerX,
  mainCrosswalkWidth: CITY_LAYOUT.crosswalks.main.width,
  sideCrosswalkZ: CITY_LAYOUT.crosswalks.side.centerZ,
  sideCrosswalkDepth: CITY_LAYOUT.crosswalks.side.depth,
  mainDashLength: 1.2,
  mainDashPeriod: LOOP_WIDTH / 32,
  mainDashWidth: 0.09,
  sideDashLength: 0.88,
  sideDashPeriod: 1.7,
  sideDashWidth: 0.1,
} as const

export const HALF_LOOP = LOOP_WIDTH / 2
export const SCENE_BACK_Z = -STREET.sidewalkDepth / 2
export const SCENE_FRONT_Z = STREET.sidewalkDepth / 2
export const ROAD_BACK_Z = STREET.roadCenterZ - STREET.roadWidth / 2
export const ROAD_FRONT_Z = STREET.roadCenterZ + STREET.roadWidth / 2
export const SIDE_LEFT_X = STREET.sideRoadX - STREET.sideRoadWidth / 2
export const SIDE_RIGHT_X = STREET.sideRoadX + STREET.sideRoadWidth / 2
export const CURB_HEIGHT = STREET.curbTopY - STREET.roadTopY
export const MARKING_Y = STREET.roadTopY + 0.004

export type StreetSide = 'left' | 'right'
export type StreetAxis = 'x' | 'z'
