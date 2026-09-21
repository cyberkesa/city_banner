import { describe, expect, it } from 'vitest'
import { CITY_LAYOUT } from '../core/city-layout'
import { createEmptyLandscapeMap, parseLandscapeMap } from './landscape-schema'

describe('parseLandscapeMap', () => {
  it('normalizes legacy-width geometry into the active loop', () => {
    const raw = createEmptyLandscapeMap()
    raw.width = 90
    raw.surfaces.push({
      id: 'surface',
      name: 'Surface',
      material: 'grass',
      points: [[44, 0], [46, 0], [46, 2], [44, 2]],
      cornerRadius: 0,
      handles: Array.from({ length: 4 }, () => ({ incoming: null, outgoing: null })),
    })

    const parsed = parseLandscapeMap(raw)
    expect(parsed.width).toBe(CITY_LAYOUT.width)
    for (const [x] of parsed.surfaces[0].points) {
      expect(x).toBeGreaterThanOrEqual(-CITY_LAYOUT.width / 2)
      expect(x).toBeLessThan(CITY_LAYOUT.width / 2)
    }
  })

  it('rejects non-finite coordinates at the boundary', () => {
    const raw = createEmptyLandscapeMap()
    raw.vegetation.push({
      id: 'tree',
      kind: 'tree',
      model: '/models/tree0.glb',
      position: [Number.NaN, 0],
      scale: 1,
      rotation: 0,
    })
    expect(() => parseLandscapeMap(raw)).toThrow('pos')
  })
})
