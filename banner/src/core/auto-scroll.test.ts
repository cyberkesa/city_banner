import { describe, expect, it } from 'vitest'
import { AutoScroll } from './auto-scroll'
import { AUTO_SCROLL_SPEED } from './runtime.config'

function advance(scroll: AutoScroll, seconds: number, fps = 60, blocked = false): number {
  let distance = 0
  for (let i = 0; i < seconds * fps; i++) distance += scroll.update(1 / fps, blocked)
  return distance
}

describe('automatic scrolling', () => {
  it('waits before starting and accelerates gradually', () => {
    const scroll = new AutoScroll()
    expect(advance(scroll, 4)).toBeCloseTo(0)
    const first = scroll.update(1 / 60)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(AUTO_SCROLL_SPEED / 60)
    advance(scroll, 5)
    expect(scroll.update(1 / 60)).toBeCloseTo(AUTO_SCROLL_SPEED / 60, 5)
  })

  it('travels the same distance at different frame rates', () => {
    expect(advance(new AutoScroll(), 12, 30)).toBeCloseTo(advance(new AutoScroll(), 12, 120), 8)
  })

  it('stays paused during interaction and waits again after release', () => {
    const scroll = new AutoScroll()
    advance(scroll, 10)
    expect(advance(scroll, 6, 60, true)).toBe(0)
    expect(advance(scroll, 4)).toBeCloseTo(0)
    expect(advance(scroll, 1)).toBeGreaterThan(0)
    scroll.pause()
    expect(advance(scroll, 4)).toBeCloseTo(0)
  })

  it('does not jump after a suspended frame', () => {
    const scroll = new AutoScroll()
    advance(scroll, 10)
    expect(scroll.update(60)).toBeLessThanOrEqual(AUTO_SCROLL_SPEED * 0.1)
  })
})
