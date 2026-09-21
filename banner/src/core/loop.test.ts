import { describe, expect, it } from 'vitest'
import { LOOP_HALF, LOOP_WIDTH, wrapLoop } from './loop'

describe('wrapLoop', () => {
  it.each([-10000, -71, -35, 0, 35, 71, 10000])('keeps %s inside the canonical segment', (value) => {
    const wrapped = wrapLoop(value)
    expect(wrapped).toBeGreaterThanOrEqual(-LOOP_HALF)
    expect(wrapped).toBeLessThan(LOOP_HALF)
  })

  it('is periodic across loop copies', () => {
    const value = 12.345
    expect(wrapLoop(value + LOOP_WIDTH * 17)).toBeCloseTo(wrapLoop(value), 10)
    expect(wrapLoop(value - LOOP_WIDTH * 17)).toBeCloseTo(wrapLoop(value), 10)
  })
})
