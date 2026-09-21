import * as THREE from 'three'
import type { Category, CategoryManager } from '../catalog/categories'
import { normalizeHttpUrl } from '../core/safe-url'

const KEEP_WITH_NEXT = new Set([
  'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'обо', 'от', 'ото',
  'до', 'из', 'изо', 'за', 'по', 'под', 'подо', 'над', 'надо', 'при', 'про',
  'для', 'без', 'безо', 'через', 'между', 'перед', 'около', 'возле', 'после',
  'и', 'а', 'но', 'или', 'да', 'не', 'ни',
])

function formatTitle(text: string): string {
  const words = text.trim().split(/\s+/u)
  return words.map((word, i) => {
    if (i === words.length - 1) return word
    return word + (KEEP_WITH_NEXT.has(word.toLocaleLowerCase('ru')) ? '\u00a0' : ' ')
  }).join('')
}

export class CategoryCallout {
  private hovered: Category | null = null
  private automatic: Category | null = null
  private displayed: Category | null = null
  private pending: Category | null = null
  private pendingSince = 0
  private nextScan = 0

  private x = NaN
  private y = NaN
  private anchorX = NaN
  private anchorY = NaN
  private width = 0
  private height = 0
  private cWidth = 1
  private cHeight = 1

  private readonly root = document.getElementById('category-callout') as HTMLDivElement
  private readonly link = document.getElementById('category-callout-link') as HTMLAnchorElement
  private readonly title = document.getElementById('category-callout-title') as HTMLElement
  private readonly line = document.getElementById('category-callout-line') as unknown as SVGPathElement
  private readonly dot = document.getElementById('category-callout-dot') as unknown as SVGCircleElement
  private readonly ripple = document.getElementById('category-callout-ripple') as unknown as SVGCircleElement
  private readonly clickCue = document.getElementById('category-callout-click-cue') as unknown as SVGGElement
  private readonly label = document.getElementById('label') as HTMLDivElement

  private readonly worldPos = new THREE.Vector3()
  private readonly screenPos = new THREE.Vector3()

  private readonly container: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly camera: THREE.Camera
  private readonly categories: CategoryManager

  constructor(
    container: HTMLDivElement,
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    categories: CategoryManager
  ) {
    this.container = container
    this.canvas = canvas
    this.camera = camera
    this.categories = categories
    this.resize()
  }

  get current(): Category | null {
    return this.hovered
  }

  hover(category: Category | null): void {
    if (category === this.hovered) return
    if (this.hovered) this.categories.setColor(this.hovered, false)

    this.hovered = category
    const hasUrl = !!category && normalizeHttpUrl(category.url) !== null

    if (category && hasUrl) {
      this.categories.setColor(category, true)
      this.label.textContent = category.name
    }

    this.canvas.style.cursor = hasUrl ? 'pointer' : 'default'
    this.label.classList.toggle('visible', false)
  }

  update(now: number, paused = false): void {
    this.updateAutomatic(now, paused)

    const category = !paused ? (this.hovered?.url ? this.hovered : this.automatic) : null
    const safeUrl = category ? normalizeHttpUrl(category.url) : null
    if (!category || !safeUrl) {
      this.displayed = null
      this.root.classList.remove('visible', 'click-demo')
      return
    }

    if (this.displayed !== category) {
      this.root.classList.remove('click-demo')
      this.displayed = category
      this.setTitle(category.name)
      this.link.href = safeUrl
      this.link.setAttribute('aria-label', `${category.name} — открыть категорию`)
      this.x = this.y = this.anchorX = this.anchorY = NaN
      this.link.getAnimations().forEach((animation) => animation.cancel())
      this.link.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 360,
        easing: 'ease-out',
      })
    }

    this.worldPos.copy(category.getWorldLabelPosition(this.worldPos))
    this.screenPos.copy(this.worldPos).project(this.camera)

    const { x: sx, y: sy, z: sz } = this.screenPos
    if (sz < -1 || sz > 1 || Math.abs(sx) > 1.05 || Math.abs(sy) > 1.05) {
      this.root.classList.remove('visible', 'click-demo')
      return
    }

    const targetAnchorX = (sx * 0.5 + 0.5) * this.cWidth
    const targetAnchorY = (-sy * 0.5 + 0.5) * this.cHeight
    const cardW = this.width || Math.min(430, this.cWidth * 0.38)
    const cardH = this.height || 130
    const placeRight = targetAnchorX < this.cWidth * 0.56

    const targetX = Math.max(20, Math.min(this.cWidth - cardW - 20, placeRight ? targetAnchorX + 94 : targetAnchorX - cardW - 94))
    const targetY = Math.max(20, Math.min(this.cHeight - cardH - 20, targetAnchorY - cardH - 54))

    this.x = Number.isFinite(this.x) ? this.x + (targetX - this.x) * 0.16 : targetX
    this.y = Number.isFinite(this.y) ? this.y + (targetY - this.y) * 0.16 : targetY
    this.anchorX = Number.isFinite(this.anchorX) ? this.anchorX + (targetAnchorX - this.anchorX) * 0.18 : targetAnchorX
    this.anchorY = Number.isFinite(this.anchorY) ? this.anchorY + (targetAnchorY - this.anchorY) * 0.18 : targetAnchorY

    const endX = placeRight ? this.x : this.x + cardW
    const endY = this.y + Math.min(cardH - 24, Math.max(24, this.anchorY - this.y))
    const bendX = this.anchorX + (endX - this.anchorX) * 0.48

    const r = (n: number) => (n * 10 | 0) / 10
    const ax = r(this.anchorX), ay = r(this.anchorY)
    const bx = r(bendX), ex = r(endX), ey = r(endY)

    this.link.style.translate = `${r(this.x)}px ${r(this.y)}px`
    this.line.setAttribute('d', `M${ax} ${ay}C${bx} ${ay},${bx} ${ey},${ex} ${ey}`)
    this.dot.setAttribute('cx', `${ax}`)
    this.dot.setAttribute('cy', `${ay}`)
    this.ripple.setAttribute('cx', `${ax}`)
    this.ripple.setAttribute('cy', `${ay}`)
    this.clickCue.setAttribute('transform', `translate(${ax} ${ay})`)
    this.root.classList.toggle('click-demo', !this.hovered &&
      Math.abs(targetAnchorX - this.anchorX) < 1 && Math.abs(targetAnchorY - this.anchorY) < 1)
    this.root.classList.add('visible')
  }

  resize(): void {
    this.cWidth = this.container.clientWidth || 1
    this.cHeight = this.container.clientHeight || 1
    if (this.displayed) this.setTitle(this.displayed.name)
    this.x = this.y = this.anchorX = this.anchorY = NaN
  }

  private setTitle(text: string): void {
    this.title.textContent = formatTitle(text)
    this.title.style.removeProperty('font-size')
    this.link.style.maxWidth = `${Math.max(1, Math.min(430, this.cWidth - 40))}px`
    // Fit unbreakable word groups within the card.
    let fontSize = parseFloat(getComputedStyle(this.title).fontSize)
    while (this.title.scrollWidth > this.title.clientWidth && fontSize > 12) {
      fontSize = Math.max(12, fontSize - 1)
      this.title.style.fontSize = `${fontSize}px`
    }
    this.width = this.link.offsetWidth
    this.height = this.link.offsetHeight
  }

  private score(category: Category): number | null {
    this.worldPos.setFromMatrixPosition(category.root.matrixWorld)
    this.screenPos.copy(this.worldPos).project(this.camera)

    const { x, y, z } = this.screenPos
    if (z < -1 || z > 1 || Math.abs(x) > 0.92 || y < -0.78 || y > 0.82) return null

    return Math.abs(x) + Math.abs(y + 0.05) * 0.16
  }

  private updateAutomatic(now: number, paused: boolean): void {
    if (now < this.nextScan || paused) return
    this.nextScan = now + 90

    let best: Category | null = null
    let bestScore = Infinity

    for (const cat of this.categories.categories) {
      if (!cat.url) continue
      const s = this.score(cat)
      if (s !== null && s < bestScore) {
        best = cat
        bestScore = s
      }
    }

    const autoScore = this.automatic ? this.score(this.automatic) : null
    if (autoScore !== null && autoScore <= bestScore + 0.24) {
      this.pending = null
      return
    }

    if (best === this.automatic) {
      this.pending = null
      return
    }

    if (best !== this.pending) {
      this.pending = best
      this.pendingSince = now
      return
    }

    if (now - this.pendingSince >= (autoScore !== null ? 360 : 140)) {
      this.automatic = best
      this.pending = null
    }
  }
}
