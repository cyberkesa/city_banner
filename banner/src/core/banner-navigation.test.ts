import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { CategoryManager, type Category } from '../catalog/categories'
import { BannerNavigation } from './banner-navigation'
import { EngineEventBus } from './engine-events'

afterEach(() => vi.unstubAllGlobals())

it('keeps scrolling with the pointer resting on the callout', () => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', new EventTarget())
  const callout = new EventTarget()
  const canvas = Object.assign(new EventTarget(), {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  })
  const container = Object.assign(new EventTarget(), { querySelector: () => callout })
  const categories = new CategoryManager(new THREE.Group())
  categories.categories.push({} as Category)
  const navigation = new BannerNavigation(
    { domElement: canvas } as unknown as THREE.WebGLRenderer,
    new THREE.PerspectiveCamera(), categories, () => null, new EngineEventBus(),
    container as unknown as HTMLElement,
  )
  try {
    callout.dispatchEvent(new Event('pointerenter'))
    let offset = 0
    for (let i = 0; i < 600; i++) offset = navigation.update(1 / 60)
    expect(offset).toBeLessThan(-1)

    container.dispatchEvent(new Event('pointerdown'))
    for (let i = 0; i < 180; i++) offset = navigation.update(1 / 60)
    const paused = offset
    for (let i = 0; i < 30; i++) offset = navigation.update(1 / 60)
    expect(offset).toBeCloseTo(paused, 5)
    for (let i = 0; i < 180; i++) offset = navigation.update(1 / 60)
    expect(offset).toBeLessThan(paused - 0.5)
  } finally {
    navigation.dispose()
  }
})
