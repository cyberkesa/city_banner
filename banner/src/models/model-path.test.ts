import { describe, expect, it } from 'vitest'

import { resolveModelPath } from './model-path'

describe('resolveModelPath', () => {
  it('maps legacy numbered models to the available semantic assets', () => {
    expect(resolveModelPath('/models/25.glb')).toBe('/models/locker-bench.glb')
    expect(resolveModelPath('/models/(17) tehno.glb')).toBe('/models/bike-parking-1.glb')
  })

  it('keeps building paths in the canonical model directory', () => {
    expect(resolveModelPath('/models/building-city-a.glb')).toBe('/models/building-city-a.glb')
  })

  it('keeps current model paths unchanged', () => {
    expect(resolveModelPath('/models/skam.glb')).toBe('/models/skam.glb')
  })
})
