import { CITY_LAYOUT, ROAD_BOUNDS } from '../core/city-layout'
import { STREET } from '../street/street-config'

const SIDEWALK_Z = 1.8
const APPROACH_LENGTH = 4
const CROSSING_MARGIN = 0.45
const left = ROAD_BOUNDS.side.minX - CROSSING_MARGIN
const right = ROAD_BOUNDS.side.maxX + CROSSING_MARGIN
const offset = SIDEWALK_Z - CITY_LAYOUT.crosswalks.side.centerZ

const smooth = (t: number) => t * t * (3 - 2 * t)

export function walkerRouteAt(x: number): { z: number; y: number; slope: number } {
  let z = SIDEWALK_Z
  let slope = 0
  if (x >= left && x <= right) {
    z = CITY_LAYOUT.crosswalks.side.centerZ
  } else if (x > left - APPROACH_LENGTH && x < left) {
    const t = (x - left + APPROACH_LENGTH) / APPROACH_LENGTH
    z -= offset * smooth(t)
    slope = -offset * 6 * t * (1 - t) / APPROACH_LENGTH
  } else if (x > right && x < right + APPROACH_LENGTH) {
    const t = (x - right) / APPROACH_LENGTH
    z = CITY_LAYOUT.crosswalks.side.centerZ + offset * smooth(t)
    slope = offset * 6 * t * (1 - t) / APPROACH_LENGTH
  }

  // Blend between sidewalk and road height across each curb.
  const roadInset = Math.min(x - ROAD_BOUNDS.side.minX, ROAD_BOUNDS.side.maxX - x)
  const roadBlend = smooth(Math.max(0, Math.min(1, (roadInset + 0.15) / 0.3)))
  const y = (STREET.roadTopY - STREET.sidewalkSurfaceY) * roadBlend
  return { z, y, slope }
}
