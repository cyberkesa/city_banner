import * as THREE from 'three'
import { MAX_PIXEL_RATIO } from './runtime.config'

export type RenderQuality = 'high' | 'medium' | 'low'

interface AdaptiveQualityOptions {
  cooldownMs?: number
  warmupFrames?: number
  initialQuality?: RenderQuality
}

export class AdaptiveRenderQuality {
  private _quality: RenderQuality = 'high'
  private _isManual = false
  private avgMs = 16.67
  private varMs = 0
  private targetMs = 16.67
  private minObservedMs = Infinity
  private lastChangeAt = 0
  private frames = 0
  private stableStreak = 0

  private readonly cooldownMs: number
  private readonly warmupFrames: number
  private readonly renderer: THREE.WebGLRenderer
  private readonly onChange?: (quality: RenderQuality) => void
  private readonly pixelRatios: Record<RenderQuality, number>

  constructor(
    renderer: THREE.WebGLRenderer,
    onChange?: (quality: RenderQuality) => void,
    options?: AdaptiveQualityOptions
  ) {
    this.renderer = renderer
    this.onChange = onChange
    this.cooldownMs = options?.cooldownMs ?? 3500
    this.warmupFrames = options?.warmupFrames ?? 90
    this._quality = options?.initialQuality ?? 'high'

    this.pixelRatios = {
      high: MAX_PIXEL_RATIO,
      medium: Math.min(1.25, MAX_PIXEL_RATIO),
      low: 1,
    }
  }

  get quality(): RenderQuality {
    return this._quality
  }

  get isManual(): boolean {
    return this._isManual
  }

  setQualityOverride(quality: RenderQuality | null): void {
    if (quality === null) {
      this._isManual = false
      this.lastChangeAt = performance.now()
      return
    }
    this._isManual = true
    this.apply(quality)
  }

  update(rawFrameMs: number): void {
    if (this._isManual) return
    if (typeof document !== 'undefined' && document.hidden) return

    const dt = Math.min(Math.max(rawFrameMs, 0), 100)
    this.frames++

    if (this.frames < this.warmupFrames) {
      if (dt > 4 && dt < this.minObservedMs) this.minObservedMs = dt
      if (this.frames === this.warmupFrames - 1) {
        this.targetMs = this.minObservedMs < 10 ? 8.33 : this.minObservedMs < 13.5 ? 11.11 : 16.67
        this.avgMs = this.targetMs
      }
      return
    }

    const alpha = 0.07
    const delta = dt - this.avgMs
    this.avgMs += alpha * delta
    this.varMs = (1 - alpha) * (this.varMs + alpha * delta * delta)

    const stabilityThreshold = this.targetMs * this.targetMs * 0.0484
    const isStable = dt <= this.targetMs * 1.08 && this.varMs < stabilityThreshold

    this.stableStreak = isStable ? this.stableStreak + 1 : 0

    const now = performance.now()
    if (now - this.lastChangeAt < this.cooldownMs) return

    const next = this.evaluateNextTier()
    if (next === this._quality) return

    this.lastChangeAt = now
    this.stableStreak = 0
    this.apply(next)
  }

  private evaluateNextTier(): RenderQuality {
    const curr = this._quality
    const t = this.targetMs
    const avg = this.avgMs

    if (curr === 'high' && avg > t * 1.42) return 'medium'
    if (curr === 'medium' && avg > t * 1.88) return 'low'

    const requiredStreak = t < 10 ? 240 : 160

    if (curr === 'low' && avg < t * 1.25 && this.stableStreak > requiredStreak * 0.6) {
      return 'medium'
    }

    if (curr === 'medium' && avg <= t * 1.04 && this.stableStreak > requiredStreak) {
      return 'high'
    }

    return curr
  }

  private apply(next: RenderQuality): void {
    this._quality = next
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    this.renderer.setPixelRatio(Math.min(dpr, this.pixelRatios[next]))
    this.onChange?.(this._quality)
  }
}