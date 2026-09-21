import * as THREE from 'three'

import type { Category, CategoryManager } from '../catalog/categories'
import type { EngineEventBus } from './engine-events'
import { wrapLoop } from './loop'
import { AutoScroll } from './auto-scroll'
import { SCROLL_SMOOTHING, WHEEL_SENSITIVITY, TOUCH_TAP_THRESHOLD_MS, TOUCH_VELOCITY_MULTIPLIER, TOUCH_VELOCITY_SMOOTHING, TOUCH_VELOCITY_REACTIVE, TOUCH_SCROLL_FACTOR, POINTER_DEADZONE_PX, WHEEL_DELTA_LINEAR, WHEEL_DELTA_PAGE, KEYBOARD_SCROLL_STEP } from './runtime.config'

export type SceneEditorNavigation = {
  readonly active: boolean
  readonly dragging: boolean
  handlePointerMove: (event: PointerEvent) => boolean
  handlePointerDown: (event: PointerEvent) => boolean
  handlePointerUp: () => void
}

export class BannerNavigation {
  private scrollX = 0
  private targetScrollX = 0
  private readonly autoScroll = new AutoScroll()
  private calloutFocused = false

  private touchId: number | null = null
  private touchStartX = 0
  private touchStartY = 0
  private touchLastX = 0
  private touchActive = false
  private touchVelocity = 0
  private touchTime = 0
  private suppressClick = false

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly intersects: THREE.Intersection[] = []
  private domRect: DOMRect

  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.Camera
  private readonly categories: CategoryManager
  private readonly getEditor: () => SceneEditorNavigation | null
  private readonly events: EngineEventBus
  private readonly wheelTarget: HTMLElement
  private hoveredCategory: Category | null = null
  private lastHoverTime = 0
  private _lastPickX = 0
  private _lastPickY = 0
  private _lastPickedCategory: Category | null = null
  private _firstPick = true

  private readonly abort = new AbortController()

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    categories: CategoryManager,
    getEditor: () => SceneEditorNavigation | null,
    events: EngineEventBus,
    wheelTarget: HTMLElement = renderer.domElement
  ) {
    this.renderer = renderer
    this.camera = camera
    this.categories = categories
    this.getEditor = getEditor
    this.events = events
    this.wheelTarget = wheelTarget
    ;(this.raycaster as { firstHitOnly?: boolean }).firstHitOnly = true

    this.renderer.domElement.style.touchAction = 'pan-y'
    this.domRect = this.renderer.domElement.getBoundingClientRect()
    this.bindEvents()
  }

  update(delta: number): number {
    const prev = this.scrollX
    const autoDistance = this.autoScroll.update(delta,
      !!this.getEditor()?.active || this.touchId !== null ||
      this.calloutFocused || this.categories.categories.length === 0)
    this.targetScrollX -= autoDistance
    if (autoDistance > 0) this.hover(null)
    this.scrollX = THREE.MathUtils.damp(this.scrollX, this.targetScrollX, SCROLL_SMOOTHING, delta)
    if (this.scrollX !== prev) this._firstPick = true
    const sceneOffsetX = wrapLoop(this.scrollX)
    this.events.emit('scroll:change', {
      scrollX: this.scrollX,
      sceneOffsetX,
      velocity: delta > 0 ? (this.scrollX - prev) / delta : 0,
    })
    return sceneOffsetX
  }

  getHoveredCategory(): Category | null {
    return this.hoveredCategory
  }

  private hover(category: Category | null): void {
    if (category === this.hoveredCategory) return
    this.hoveredCategory = category
    this.events.emit('category:hover', { category })
  }

  private pickCategory(e: PointerEvent): Category | null {
    const dx = e.clientX - this._lastPickX
    const dy = e.clientY - this._lastPickY
    if (!this._firstPick && dx * dx + dy * dy < 4) return this._lastPickedCategory
    this._firstPick = false

    this._lastPickX = e.clientX
    this._lastPickY = e.clientY

    const r = this.domRect
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.intersects.length = 0
    this.raycaster.intersectObjects(this.categories.clickableMeshes, false, this.intersects)
    const hit = this.intersects[0]
    this._lastPickedCategory = hit ? this.categories.findCategory(hit.object, hit.instanceId) : null
    return this._lastPickedCategory
  }

  private bindEvents(): void {
    const el = this.renderer.domElement
    const { signal } = this.abort
    const updateRect = () => { this.domRect = el.getBoundingClientRect() }
    const callout = this.wheelTarget.querySelector('#category-callout-link')
    callout?.addEventListener('focus', () => { this.calloutFocused = true }, { signal })
    callout?.addEventListener('blur', () => { this.calloutFocused = false }, { signal })
    this.wheelTarget.addEventListener('pointerdown', () => this.autoScroll.pause(), { signal })
    document.addEventListener('visibilitychange', () => this.autoScroll.pause(), { signal })

    window.addEventListener('resize', updateRect, { signal })
    window.addEventListener('scroll', updateRect, { passive: true, signal })
    el.addEventListener('pointerenter', updateRect, { signal })

    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (this.getEditor()?.active) return

      const target = e.target
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )) return

      if (e.key === 'ArrowLeft') {
        this.autoScroll.pause()
        e.preventDefault()
        this.targetScrollX += KEYBOARD_SCROLL_STEP
        this.hover(null)
      } else if (e.key === 'ArrowRight') {
        this.autoScroll.pause()
        e.preventDefault()
        this.targetScrollX -= KEYBOARD_SCROLL_STEP
        this.hover(null)
      }
    }, { signal })

    el.addEventListener('pointerdown', (e) => {
      updateRect()
      const ed = this.getEditor()
      if (!ed?.active && e.pointerType === 'touch' && e.isPrimary) {
        if (Math.abs(this.targetScrollX - this.scrollX) > 0.005) {
          this.targetScrollX = this.scrollX
        }
        this.touchId = e.pointerId
        this.touchStartX = this.touchLastX = e.clientX
        this.touchStartY = e.clientY
        this.touchTime = performance.now()
        this.touchVelocity = 0
        this.touchActive = this.suppressClick = false
        return
      }
      ed?.handlePointerDown(e)
    }, { signal })

    el.addEventListener('pointermove', (e) => {
      const ed = this.getEditor()
      if (!ed?.active && e.pointerType === 'touch' && this.touchId === e.pointerId) {
        const dx = e.clientX - this.touchStartX
        const dy = e.clientY - this.touchStartY

        if (!this.touchActive && Math.abs(dx) >= POINTER_DEADZONE_PX && Math.abs(dx) > Math.abs(dy)) {
          this.touchActive = true
          el.setPointerCapture(e.pointerId)
        }

        if (this.touchActive) {
          const now = performance.now()
          const dt = Math.max(1, now - this.touchTime)
          const moveDelta = e.clientX - this.touchLastX
          this.touchVelocity = this.touchVelocity * TOUCH_VELOCITY_SMOOTHING + (moveDelta / dt) * TOUCH_VELOCITY_REACTIVE
          this.targetScrollX -= moveDelta * TOUCH_SCROLL_FACTOR
          this.touchLastX = e.clientX
          this.touchTime = now
          this.suppressClick = true
          this.hover(null)
        }
        return
      }
      if (ed?.handlePointerMove(e)) return

      const now = performance.now()
      if (now - this.lastHoverTime < 33) return
      this.lastHoverTime = now
      this.hover(this.pickCategory(e))
    }, { signal })

    const onRelease = (e: PointerEvent) => {
      if (this.touchId === e.pointerId) {
        this.autoScroll.pause()
        if (this.touchActive && performance.now() - this.touchTime < TOUCH_TAP_THRESHOLD_MS) {
          this.targetScrollX -= this.touchVelocity * TOUCH_VELOCITY_MULTIPLIER
        }
        this.touchId = null
        this.touchActive = false
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      this.getEditor()?.handlePointerUp()
    }

    el.addEventListener('pointerup', onRelease, { signal })
    el.addEventListener('pointercancel', (e) => { onRelease(e); this.suppressClick = false }, { signal })
    el.addEventListener('pointerleave', () => this.hover(null), { signal })

    el.addEventListener('click', (e) => {
      if (this.suppressClick) {
        this.suppressClick = false
        return
      }
      const cat = this.pickCategory(e) ?? this.hoveredCategory
      if (!this.getEditor()?.active && cat?.url) {
        this.events.emit('category:select', { category: cat })
      }
    }, { signal })

    this.wheelTarget.addEventListener('wheel', (e) => {
      const ed = this.getEditor()
      if (ed?.dragging) return
      this.autoScroll.pause()
      const isX = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (isX && e.cancelable) e.preventDefault()
      this.hover(null)
      const mul = e.deltaMode === 1 ? WHEEL_DELTA_LINEAR : e.deltaMode === 2 ? WHEEL_DELTA_PAGE : 1
      this.targetScrollX += (isX ? e.deltaX : e.deltaY) * mul * WHEEL_SENSITIVITY
    }, { passive: false, signal })
  }

  dispose(): void {
    this.abort.abort()
    this.intersects.length = 0
  }
}
