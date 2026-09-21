import { AUTO_SCROLL_DELAY, AUTO_SCROLL_SPEED } from './runtime.config'

export class AutoScroll {
  private remainingPause = AUTO_SCROLL_DELAY
  private speed = 0

  pause(): void {
    this.remainingPause = AUTO_SCROLL_DELAY
    this.speed = 0
  }

  update(delta: number, blocked = false): number {
    if (blocked) {
      this.pause()
      return 0
    }
    const dt = Math.max(0, Math.min(delta, 0.1))
    const movingTime = Math.max(0, dt - this.remainingPause)
    this.remainingPause = Math.max(0, this.remainingPause - dt)
    if (!movingTime) return 0

    const decay = Math.exp(-2 * movingTime)
    const distance = AUTO_SCROLL_SPEED * movingTime + (this.speed - AUTO_SCROLL_SPEED) * (1 - decay) / 2
    this.speed = AUTO_SCROLL_SPEED + (this.speed - AUTO_SCROLL_SPEED) * decay
    return distance
  }
}
