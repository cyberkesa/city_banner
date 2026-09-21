import { describe, expect, it } from 'vitest'
import { createEmptyLandscapeMap } from './landscape-schema'
import { resolveModelPath, resolveVegetation } from './vegetation-layout'

describe('vegetation layout', () => {
  it('resolves random models deterministically from stable ids', () => {
    const map = createEmptyLandscapeMap()
    map.vegetation.push({
      id: 'stable-bush',
      kind: 'bush',
      model: 'random-bush',
      position: [1, 2],
      scale: 0.8,
      rotation: 15,
    })

    const first = resolveVegetation(map)
    const second = resolveVegetation(map)
    expect(second).toEqual(first)
    expect(resolveModelPath(first[0])).toBe(resolveModelPath(second[0]))
    expect(resolveModelPath(first[0])).toMatch(/^\/models\/shrub-/)
  })
})
