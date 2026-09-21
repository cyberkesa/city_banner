import { describe, expect, it } from 'vitest'
import { CITY_LAYOUT, ROAD_BOUNDS } from '../core/city-layout'
import { walkerRouteAt } from './walker-route'

describe('walker crossing route', () => {
  it('stays in the centre of the zebra throughout the road crossing', () => {
    for (let x = ROAD_BOUNDS.side.minX; x <= ROAD_BOUNDS.side.maxX; x += 0.1) {
      const route = walkerRouteAt(x)
      expect(route.z).toBe(CITY_LAYOUT.crosswalks.side.centerZ)
      expect(route.slope).toBe(0)
      expect(route.y).toBeLessThan(0)
    }
  })

  it('turns smoothly toward the crossing and returns to the sidewalk', () => {
    const left = ROAD_BOUNDS.side.minX - 0.45
    const right = ROAD_BOUNDS.side.maxX + 0.45
    expect(walkerRouteAt(left - 5).z).toBe(1.8)
    expect(walkerRouteAt(right + 5).z).toBe(1.8)
    expect(walkerRouteAt(left - 2).slope).toBeLessThan(0)
    expect(walkerRouteAt(right + 2).slope).toBeGreaterThan(0)
    for (const x of [left - 4, left, right, right + 4]) {
      const before = walkerRouteAt(x - 0.0001)
      const after = walkerRouteAt(x + 0.0001)
      expect(before.z).toBeCloseTo(after.z, 6)
      expect(before.slope).toBeCloseTo(after.slope, 3)
    }
  })
})
