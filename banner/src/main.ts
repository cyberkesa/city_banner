import * as THREE from 'three'
import '@fontsource-variable/inter/wght.css'
import './style.css'

import { Walker } from './actors/walker'
import { DogRunner } from './actors/dog-runner'
import { cloneLandscapeMap, parseLandscapeMap, type LandscapeMap } from './landscape/landscape-schema'
import { expandSceneObjects } from './catalog/scene-objects'
import { CategoryManager } from './catalog/categories'
import type { Category } from './catalog/categories'
import { Environment } from './environment/environment'
import { Landscape } from './landscape/landscape'
import { createStreet } from './street/street'
import { CategoryCallout } from './ui/category-callout'
import { AdaptiveRenderQuality } from './core/render-quality'
import { createSceneRuntime } from './core/scene-runtime'
import { BannerNavigation } from './core/banner-navigation'
import { EngineEventBus } from './core/engine-events'
import { yieldToMainThread } from './core/frame-scheduler'
import { freezeStaticTransforms } from './core/static-transforms'
import { SerialTaskQueue } from './core/serial-task-queue'
import { normalizeHttpUrl } from './core/safe-url'





const container = document.querySelector<HTMLDivElement>('#scene')!
let handleSceneResize = (): void => {}
const sceneRuntime = createSceneRuntime(container, () => handleSceneResize())
const { scene, world, camera, renderer, sun } = sceneRuntime
const HEMISPHERE_BASE = 1.5
const HEMISPHERE_HOVER = 0.15
const SUN_BASE = 3.1
const SUN_HOVER = 0.15
const HIGHLIGHT_COLOR = 0xfff5e6
const highlightLight = new THREE.PointLight(HIGHLIGHT_COLOR, 0, 30, 1.5)
highlightLight.position.set(0, 4, 0)
scene.add(highlightLight)
const engineEvents = new EngineEventBus()

const renderQuality = new AdaptiveRenderQuality(renderer, (quality) =>
  engineEvents.emit('quality:change', { quality })
)

const street = createStreet(world)
freezeStaticTransforms(street)
const environment = new Environment(world)
const landscape = new Landscape(world)
const categoryManager = new CategoryManager(world)
const categoryCallout = new CategoryCallout(container, renderer.domElement, camera, categoryManager)
handleSceneResize = () => categoryCallout.resize()

const walker = new Walker()
const dogRunner = new DogRunner()
world.add(walker.root, dogRunner.root)

let sceneMap: LandscapeMap | null = null
const sceneMapApplyQueue = new SerialTaskQueue()





function syncDogRunnerToEquipment(): void {
  if (!sceneMap) return

  let sumX = 0
  let sumZ = 0
  let count = 0

  
  for (let i = 0; i < sceneMap.objects.length; i++) {
    const obj = sceneMap.objects[i]
    if (obj.id.startsWith('category-23-dog-barrier-') || obj.id.startsWith('category-23-dog-slide-')) {
      sumX += obj.position[0]
      sumZ += obj.position[1]
      count++
    }
  }

  if (count > 0) {
    dogRunner.setCourseAnchor(sumX / count, sumZ / count)
  }
}

function handleCategorySelect(category: Category | null): void {
  if (!category?.url) return
  const url = normalizeHttpUrl(category.url)
  if (!url) {
    console.warn(`[NAV] Skip invalid URL: ${category.url}`)
    return
  }
  window.location.href = url
}





type SceneEditorController = {
  readonly active: boolean
  readonly dragging: boolean
  clearSelection: () => void
  handlePointerMove: (event: PointerEvent) => boolean
  handlePointerDown: (event: PointerEvent) => boolean
  handlePointerUp: () => void
}

type SceneEditorContext = {
  container: HTMLDivElement
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  scene: THREE.Scene
  world: THREE.Group
  categoryManager: CategoryManager
  landscape: Landscape
  getSceneMap: () => LandscapeMap | null
  applySceneMap: (map: LandscapeMap) => void
  syncDogRunnerToEquipment: () => void
  clearCategoryHover: () => void
}

type SceneEditorWindow = Window & {
  __createSceneEditor?: (ctx: SceneEditorContext) => SceneEditorController
}

const sceneEditorFactory = (window as SceneEditorWindow).__createSceneEditor
const sceneEditor: SceneEditorController | null = sceneEditorFactory?.({
  container, renderer, camera, scene, world, categoryManager, landscape,
  getSceneMap: () => sceneMap,
  applySceneMap,
  syncDogRunnerToEquipment,
  clearCategoryHover: () => categoryCallout.hover(null),
}) ?? null

const navigation = new BannerNavigation(
  renderer, camera, categoryManager, () => sceneEditor, engineEvents,
  document.querySelector<HTMLDivElement>('#app')!
)

engineEvents.on('category:hover', ({ category }) => categoryCallout.hover(category))
engineEvents.on('category:select', ({ category }) => handleCategorySelect(category))




const timer = new THREE.Timer()
timer.connect(document)

let pageIsVisible = !document.hidden
document.addEventListener('visibilitychange', () => {
  pageIsVisible = !document.hidden
  if (pageIsVisible) timer.reset()
})

function animate(): void {
  requestAnimationFrame(animate)
  timer.update()

  if (!pageIsVisible) return

  const delta = timer.getDelta()
  renderQuality.update(delta * 1000)

  sceneRuntime.setSceneOffsetX(navigation.update(delta))
  categoryCallout.update(performance.now(), sceneEditor?.active)

  const hovered = navigation.getHoveredCategory()
  if (hovered) {
    const pos = hovered.getWorldLabelPosition()
    highlightLight.position.set(pos.x, pos.y + 2, pos.z)
    highlightLight.intensity = THREE.MathUtils.lerp(highlightLight.intensity, 12, 0.1)
    sceneRuntime.hemisphereLight.intensity = THREE.MathUtils.lerp(sceneRuntime.hemisphereLight.intensity, HEMISPHERE_HOVER, 0.06)
    sun.intensity = THREE.MathUtils.lerp(sun.intensity, SUN_HOVER, 0.06)
  } else {
    highlightLight.intensity = THREE.MathUtils.lerp(highlightLight.intensity, 0, 0.06)
    sceneRuntime.hemisphereLight.intensity = THREE.MathUtils.lerp(sceneRuntime.hemisphereLight.intensity, HEMISPHERE_BASE, 0.06)
    sun.intensity = THREE.MathUtils.lerp(sun.intensity, SUN_BASE, 0.06)
  }

  environment.update(delta)
  walker.update(delta)
  dogRunner.update(delta)

  renderer.render(scene, camera)
}





async function commitSceneMap(map: LandscapeMap): Promise<void> {
  const [preparedLandscape, preparedCategories] = await Promise.all([
    landscape.prepareMap(map),
    categoryManager.prepareAll(expandSceneObjects(map.objects)),
  ])
  const stagedCategories = categoryManager.stagePrepared(preparedCategories)

  sceneEditor?.clearSelection()
  const landscapeRoot = landscape.commitPrepared(preparedLandscape)
  categoryManager.commitStaged(stagedCategories)
  sceneMap = map
  syncDogRunnerToEquipment()

  if (!sceneEditor) {
    freezeStaticTransforms(landscapeRoot)
    categoryManager.freezeStaticTransforms()
  }
}

function applySceneMap(map: LandscapeMap): Promise<void> {
  const snapshot = cloneLandscapeMap(map)
  return sceneMapApplyQueue.enqueue(() => commitSceneMap(snapshot))
}

async function loadSceneMap(): Promise<void> {
  const res = await fetch('/landscape-map.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Ошибка загрузки карты: ${res.status}`)
  const json = await res.json()
  await yieldToMainThread()
  await applySceneMap(parseLandscapeMap(json))
}


animate()


Promise.all([
  environment.load().then(() => {
    if (!sceneEditor) environment.freezeStaticTransforms()
  }),
  loadSceneMap(),
  walker.load(),
  dogRunner.load(),
]).catch((err) => console.error('Ошибка загрузки сцены:', err))
