import { LOOP_WIDTH } from './loop'

export const CITY_LAYOUT = {
  width: LOOP_WIDTH,
  depth: 50,
  mainRoad: { centerZ: 4.53, width: 3.6 },
  sideRoad: { centerX: 20, width: 3 },
  crosswalks: {
    main: { centerX: 10, width: 1.9 },
    side: { centerZ: 0, depth: 2.5 },
  },
  junctionRadius: 0.65,
} as const

export type CityLayout = typeof CITY_LAYOUT
export type MainRoadConfig = typeof CITY_LAYOUT.mainRoad
export type SideRoadConfig = typeof CITY_LAYOUT.sideRoad

export const MAP_HALF_WIDTH = CITY_LAYOUT.width * 0.5
export const MAP_HALF_DEPTH = CITY_LAYOUT.depth * 0.5

const mHalf = CITY_LAYOUT.mainRoad.width * 0.5
const sHalf = CITY_LAYOUT.sideRoad.width * 0.5

export const ROAD_BOUNDS = {
  main: {
    minZ: CITY_LAYOUT.mainRoad.centerZ - mHalf,
    maxZ: CITY_LAYOUT.mainRoad.centerZ + mHalf,
  },
  side: {
    minX: CITY_LAYOUT.sideRoad.centerX - sHalf,
    maxX: CITY_LAYOUT.sideRoad.centerX + sHalf,
  },
} as const