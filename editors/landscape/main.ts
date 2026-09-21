import './style.css'

import {
  CITY_LAYOUT,
  MAP_HALF_DEPTH,
  MAP_HALF_WIDTH,
} from '../../banner/src/core/city-layout'
import {
  lineIntersectsRoad,
  pointOnRoad,
  polygonIntersectsRoad,
  snapPointOutsideRoad,
} from '../../banner/src/landscape/landscape-geometry'
import {
  BUSH_MODELS,
  SURFACE_MATERIALS,
  TREE_MODELS,
  cloneLandscapeMap,
  createEmptyLandscapeMap,
  parseLandscapeMap,
  surfaceMaterial,
} from '../../banner/src/landscape/landscape-schema'
import type {
  LandscapeMap,
  BezierHandles,
  LandscapePath,
  LandscapePoint,
  LandscapeSurface,
  SurfaceMaterialId,
  VegetationArea,
  VegetationKind,
  VegetationLine,
  VegetationModel,
  VegetationPoint,
} from '../shared/banner-api'
import {
  SCENE_OBJECT_CATALOG,
  type SceneObject,
} from '../../banner/src/catalog/scene-objects'
import { latestSavedMap, publishSavedMap, subscribeSavedMap } from '../shared/map-sync'
import { SnapshotHistory } from './history'

type Tool =
  | 'select'
  | 'surface'
  | 'path'
  | 'tree'
  | 'bush'
  | 'object'
  | 'tree-line'
  | 'bush-line'
  | 'tree-area'
  | 'bush-area'

type SelectionKind =
  | 'surface'
  | 'path'
  | 'vegetation'
  | 'vegetation-line'
  | 'vegetation-area'
  | 'object'

type Selection = {
  kind: SelectionKind
  id: string
}

type DragState = {
  mode: 'point' | 'object' | 'bezier'
  before: string
  index?: number
  handle?: 'incoming' | 'outgoing'
  lastPoint: LandscapePoint
  moved: boolean
}

type MarqueeState = {
  start: LandscapePoint
  current: LandscapePoint
  moved: boolean
  additive: boolean
  initialSelections: Selection[]
}

type Viewport = {
  x: number
  y: number
  width: number
  height: number
}

type PanState = {
  pointerId: number
  clientX: number
  clientY: number
  viewport: Viewport
  moved: boolean
}

type PenGesture = {
  anchor: LandscapePoint
  current: LandscapePoint
  moved: boolean
}

type StatusTone =
  | 'normal'
  | 'success'
  | 'error'

const PIXELS_PER_UNIT = 20
const SVG_WIDTH =
  CITY_LAYOUT.width * PIXELS_PER_UNIT
const SVG_HEIGHT =
  CITY_LAYOUT.depth * PIXELS_PER_UNIT
const DRAFT_STORAGE_KEY =
  'city-landscape-editor-draft-v2'

const root =
  document.querySelector<HTMLDivElement>(
    '#landscape-editor'
  )!

root.innerHTML = `
  <div class="editor-shell">
    <header class="editor-topbar">
      <div class="editor-title-row">
        <h1 class="editor-title">Редактор сцены ${CITY_LAYOUT.width} × ${CITY_LAYOUT.depth}</h1>
        <span id="save-status" class="save-status">Загрузка карты…</span>
      </div>

      <div class="editor-actions">
        <button id="undo-button" class="button" type="button">↶ Назад</button>
        <button id="redo-button" class="button" type="button">↷ Вперёд</button>
        <button id="import-button" class="button" type="button">Импорт</button>
        <button id="export-button" class="button" type="button">Скачать JSON</button>
        <button id="preview-button" class="button" type="button">Открыть 3D</button>
        <button id="save-button" class="button primary" type="button">Сохранить карту</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="tool-panel" aria-label="Инструменты">
        <h2 class="panel-heading">Рисование</h2>

        <div class="tool-list">
          <button class="tool-button" data-tool="select" type="button">
            <span class="tool-icon">↖</span><span>Выбор</span>
          </button>
          <button class="tool-button" data-tool="surface" type="button">
            <span class="tool-icon">✒</span><span>Перо зоны</span>
          </button>
          <button class="tool-button" data-tool="path" type="button">
            <span class="tool-icon">╱</span><span>Дорожка</span>
          </button>
          <button class="tool-button" data-tool="tree" type="button">
            <span class="tool-icon">♠</span><span>Дерево</span>
          </button>
          <button class="tool-button" data-tool="bush" type="button">
            <span class="tool-icon">●</span><span>Куст</span>
          </button>
          <button class="tool-button" data-tool="object" type="button">
            <span class="tool-icon">◆</span><span>Объект</span>
          </button>
        </div>

        <div class="panel-divider"></div>
        <h2 class="panel-heading">Автозаполнение</h2>

        <div class="tool-list">
          <button class="tool-button" data-tool="tree-line" type="button">
            <span class="tool-icon">⋮</span><span>Деревья линией</span>
          </button>
          <button class="tool-button" data-tool="bush-line" type="button">
            <span class="tool-icon">•••</span><span>Кусты линией</span>
          </button>
          <button class="tool-button" data-tool="tree-area" type="button">
            <span class="tool-icon">⁙</span><span>Деревья зоной</span>
          </button>
          <button class="tool-button" data-tool="bush-area" type="button">
            <span class="tool-icon">⠿</span><span>Кусты зоной</span>
          </button>
        </div>

        <div class="panel-divider"></div>

        <button id="clear-button" class="button danger" type="button">Очистить сцену</button>

        <div class="panel-divider"></div>
        <h2 class="panel-heading">Клавиши</h2>
        <div class="tool-list-shortcuts">
          <p class="field-note"><strong>Enter</strong> — закончить фигуру</p>
          <p class="field-note"><strong>Shift</strong> — ровная линия</p>
          <p class="field-note"><strong>Alt</strong> — без привязки</p>
          <p class="field-note"><strong>Esc</strong> — отменить рисование</p>
          <p class="field-note"><strong>⌫</strong> — убрать последнюю точку</p>
          <p class="field-note"><strong>Delete</strong> — удалить выбранное</p>
          <p class="field-note"><strong>Shift + клик</strong> — добавить к выбору</p>
          <p class="field-note"><strong>⌘ Z</strong> — отменить действие</p>
          <p class="field-note"><strong>⌘ D</strong> — копировать выбранное</p>
          <p class="field-note"><strong>Пробел + мышь</strong> — двигать карту</p>
          <p class="field-note"><strong>Колесо</strong> — масштаб карты</p>
        </div>
      </aside>

      <main class="canvas-panel">
        <div class="viewport-controls" aria-label="Масштаб и навигация карты">
          <button id="zoom-out-button" class="button compact" type="button" aria-label="Уменьшить масштаб">−</button>
          <button id="fit-view-button" class="button compact" type="button">Вся карта</button>
          <button id="zoom-in-button" class="button compact" type="button" aria-label="Увеличить масштаб">+</button>
          <span id="zoom-value" class="zoom-value">100%</span>
          <label class="seam-control">
            <input id="seam-preview" type="checkbox" checked />
            <span>Показывать бесшовный стык</span>
          </label>
        </div>

        <div class="map-frame" style="aspect-ratio: ${CITY_LAYOUT.width} / ${CITY_LAYOUT.depth}">
          <svg
            id="landscape-map"
            viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"
            role="application"
            aria-label="Карта ландшафта, вид сверху"
            tabindex="0"
          ></svg>
        </div>

        <div class="draft-actions" id="draft-actions" hidden>
          <button id="remove-draft-point-button" class="button" type="button">Убрать точку</button>
          <button id="cancel-draft-button" class="button" type="button">Отменить</button>
          <button id="finish-draft-button" class="button primary" type="button">Завершить</button>
        </div>

        <div id="canvas-hint" class="canvas-hint"></div>
      </main>

      <aside class="property-panel" aria-label="Параметры">
        <h2 class="panel-heading">Параметры</h2>
        <div id="property-content"></div>
        <div class="panel-divider"></div>
        <h2 class="panel-heading">Слои</h2>
        <p class="field-note">Верхние зоны перекрывают нижние. Нажмите по строке, чтобы выбрать зону; ▲ — поднять вперёд, ▼ — опустить назад.</p>
        <div id="layers-content"></div>
      </aside>
    </div>
  </div>

  <input
    id="import-input"
    type="file"
    accept="application/json,.json"
    hidden
  />

  <div id="toast" class="toast" role="status"></div>
`

function elementById<T extends Element>(
  id: string
): T {
  const element =
    document.getElementById(id)

  if (!element) {
    throw new Error(`Элемент #${id} не найден`)
  }

  return element as unknown as T
}

const svg =
  elementById<SVGSVGElement>('landscape-map')

const propertyContent =
  elementById<HTMLDivElement>('property-content')

const saveStatus =
  elementById<HTMLSpanElement>('save-status')

const canvasHint =
  elementById<HTMLDivElement>('canvas-hint')

const toast =
  elementById<HTMLDivElement>('toast')

const importInput =
  elementById<HTMLInputElement>('import-input')

const zoomValue =
  elementById<HTMLSpanElement>('zoom-value')

const draftActions =
  elementById<HTMLDivElement>('draft-actions')

const seamPreview =
  elementById<HTMLInputElement>('seam-preview')

let map: LandscapeMap =
  createEmptyLandscapeMap()

let tool: Tool = 'select'
let selection: Selection | null = null
let additionalSelections: Selection[] = []
let draftPoints: LandscapePoint[] = []
let draftHandles: BezierHandles[] = []
let hoverPoint: LandscapePoint | null = null
let dragState: DragState | null = null
let panState: PanState | null = null
let penGesture: PenGesture | null = null
let marqueeState: MarqueeState | null = null
let spacePressed = false
let ignoreNextClick = false
let dirty = false
let lastLocalChangeAt = 0
let toastTimer = 0
let idCounter = 0
let mapRenderFrame: number | null = null
let lastLandscapeMarkup = ''
let landscapeLayer: SVGGElement | null = null
let overlayLayer: SVGGElement | null = null
let seamCopiesLayer: SVGGElement | null = null

const viewport: Viewport = {
  x: 0,
  y: 0,
  width: SVG_WIDTH,
  height: SVG_HEIGHT,
}

const history = new SnapshotHistory()

const settings = {
  material: 'grass' as SurfaceMaterialId,
  cornerRadius: 0.35,
  pathWidth: 1.4,
  pathSmooth: true,
  treeModel: 'random-tree' as VegetationModel,
  bushModel: '/models/shrub-07-green.glb' as VegetationModel,
  treeScale: 0.8,
  bushScale: 0.66,
  treeSpacing: 3.2,
  bushSpacing: 1.4,
  treeCount: 6,
  bushCount: 12,
  treeMinDistance: 2.5,
  bushMinDistance: 1,
  objectModel: SCENE_OBJECT_CATALOG[0]?.model ?? '',
  snap: true,
}

const toolHints: Record<Tool, string> = {
  select:
    'Протяните рамку по карте, чтобы выбрать несколько объектов. Тяните любой выбранный объект — группа переместится целиком. Shift добавляет к выбору.',
  surface:
    'Перо: ставьте узлы контура кликами. Shift — строго горизонтальный или вертикальный сегмент. Enter или двойной клик — замкнуть.',
  path:
    'Проведите дорожку кликами. Конец на асфальте автоматически встанет точно к бордюру.',
  tree:
    'Кликните в свободном месте, чтобы поставить дерево.',
  bush:
    'Кликните в свободном месте, чтобы поставить куст.',
  object:
    'Выберите модель и кликните по карте, чтобы поставить объект.',
  'tree-line':
    'Нарисуйте линию, вдоль которой автоматически появятся деревья.',
  'bush-line':
    'Нарисуйте линию живой изгороди. Enter или двойной клик — закончить.',
  'tree-area':
    'Обведите область, внутри которой будут распределены деревья.',
  'bush-area':
    'Обведите область, внутри которой будут распределены кусты.',
}

function serializeMap(): string {
  return JSON.stringify(map)
}

function setStatus(
  message: string,
  tone: StatusTone = 'normal'
): void {
  saveStatus.textContent = message
  saveStatus.dataset.tone = tone
}

function showToast(
  message: string,
  tone: 'normal' | 'error' = 'normal'
): void {
  window.clearTimeout(toastTimer)

  toast.textContent = message
  toast.classList.toggle('error', tone === 'error')
  toast.classList.add('visible')

  toastTimer = window.setTimeout(() => {
    toast.classList.remove('visible')
  }, 2800)
}

function suppressNextMapClick(): void {
  ignoreNextClick = true

  window.setTimeout(() => {
    ignoreNextClick = false
  }, 0)
}

function storeDraft(): void {
  lastLocalChangeAt = Date.now()
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      savedAt: lastLocalChangeAt,
      map,
    })
  )
}

function markDirty(): void {
  dirty = true
  storeDraft()
  setStatus('Есть несохранённые изменения')
}

function uniqueId(
  prefix: string
): string {
  idCounter += 1

  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

function commitMutation(
  mutate: () => void,
  before = serializeMap()
): void {
  mutate()
  history.record(before)
  markDirty()
  render()
}

function restoreSnapshot(
  snapshot: string
): void {
  map = parseLandscapeMap(
    JSON.parse(snapshot) as unknown
  )
}

function undo(): void {
  const previous = history.undo(serializeMap())

  if (!previous) {
    return
  }

  restoreSnapshot(previous)
  clearSelection()
  draftPoints = []
  draftHandles = []
  markDirty()
  render()
}

function redo(): void {
  const next = history.redo(serializeMap())

  if (!next) {
    return
  }

  restoreSnapshot(next)
  clearSelection()
  draftPoints = []
  draftHandles = []
  markDirty()
  render()
}

const MIN_ZOOM = 1
const MAX_ZOOM = 8

function currentZoom(): number {
  return SVG_WIDTH / viewport.width
}

function clampViewport(): void {
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, currentZoom())
  )

  viewport.width = SVG_WIDTH / zoom
  viewport.height = SVG_HEIGHT / zoom
  viewport.x = Math.max(
    0,
    Math.min(SVG_WIDTH - viewport.width, viewport.x)
  )
  viewport.y = Math.max(
    0,
    Math.min(SVG_HEIGHT - viewport.height, viewport.y)
  )
}

function applyViewport(): void {
  clampViewport()
  svg.setAttribute(
    'viewBox',
    `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`
  )
  zoomValue.textContent =
    `${Math.round(currentZoom() * 100)}%`
  svg.classList.toggle('is-pan-enabled', currentZoom() > MIN_ZOOM)
}

function startPan(event: PointerEvent): void {
  panState = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    viewport: { ...viewport },
    moved: false,
  }
  svg.classList.add('is-panning')
  event.preventDefault()
}

function fitViewport(): void {
  Object.assign(viewport, {
    x: 0,
    y: 0,
    width: SVG_WIDTH,
    height: SVG_HEIGHT,
  })
  applyViewport()
}

function zoomViewport(
  multiplier: number,
  clientX?: number,
  clientY?: number
): void {
  const rect = svg.getBoundingClientRect()
  const ratioX =
    clientX === undefined
      ? 0.5
      : Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width)
        )
  const ratioY =
    clientY === undefined
      ? 0.5
      : Math.max(
          0,
          Math.min(1, (clientY - rect.top) / rect.height)
        )
  const focusX = viewport.x + ratioX * viewport.width
  const focusY = viewport.y + ratioY * viewport.height
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, currentZoom() * multiplier)
  )
  const width = SVG_WIDTH / zoom
  const height = SVG_HEIGHT / zoom

  viewport.x = focusX - ratioX * width
  viewport.y = focusY - ratioY * height
  viewport.width = width
  viewport.height = height
  applyViewport()
}

function worldToSvg(
  point: LandscapePoint
): [number, number] {
  return [
    (point[0] + MAP_HALF_WIDTH) * PIXELS_PER_UNIT,
    (point[1] + MAP_HALF_DEPTH) * PIXELS_PER_UNIT,
  ]
}

function svgToWorld(
  event: MouseEvent | PointerEvent
): LandscapePoint {
  const rect =
    svg.getBoundingClientRect()

  const rawX =
    (
      viewport.x +
      (
        (event.clientX - rect.left) /
        rect.width
      ) * viewport.width
    ) /
    PIXELS_PER_UNIT -
    MAP_HALF_WIDTH

  const rawZ =
    (
      viewport.y +
      (
        (event.clientY - rect.top) /
        rect.height
      ) * viewport.height
    ) /
    PIXELS_PER_UNIT -
    MAP_HALF_DEPTH

  const snap =
    settings.snap && !event.altKey
      ? 0.25
      : 0.01

  return [
    Math.max(
      -MAP_HALF_WIDTH,
      Math.min(
        MAP_HALF_WIDTH,
        Math.round(rawX / snap) * snap
      )
    ),
    Math.max(
      -MAP_HALF_DEPTH,
      Math.min(
        MAP_HALF_DEPTH,
        Math.round(rawZ / snap) * snap
      )
    ),
  ]
}

function pathPoint(
  point: LandscapePoint,
  width = settings.pathWidth
): {
  point: LandscapePoint
  snapped: boolean
} {
  return snapPointOutsideRoad(
    point,
    width / 2 + 0.1
  )
}

function drawingPoint(
  event: MouseEvent | PointerEvent
): LandscapePoint {
  let point = svgToWorld(event)

  if (event.shiftKey && draftPoints.length > 0) {
    const anchor = draftPoints[draftPoints.length - 1]
    const deltaX = Math.abs(point[0] - anchor[0])
    const deltaZ = Math.abs(point[1] - anchor[1])

    point = deltaX >= deltaZ
      ? [point[0], anchor[1]]
      : [anchor[0], point[1]]
  }

  return tool === 'path'
    ? pathPoint(point).point
    : point
}

function pointsAttribute(
  points: LandscapePoint[]
): string {
  return points
    .map((point) => worldToSvg(point).join(','))
    .join(' ')
}

function roundedPolygonPath(
  points: LandscapePoint[],
  radius: number
): string {
  if (points.length === 0) {
    return ''
  }

  if (radius <= 0) {
    return points
      .map((point, index) => {
        const [x, y] = worldToSvg(point)
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ') + ' Z'
  }

  const corners =
    points.map((point, index) => {
      const previous =
        points[
          (index - 1 + points.length) % points.length
        ]

      const next =
        points[(index + 1) % points.length]

      const previousDelta: LandscapePoint = [
        previous[0] - point[0],
        previous[1] - point[1],
      ]

      const nextDelta: LandscapePoint = [
        next[0] - point[0],
        next[1] - point[1],
      ]

      const previousLength =
        Math.hypot(...previousDelta)

      const nextLength =
        Math.hypot(...nextDelta)

      const distance =
        Math.min(
          radius,
          previousLength * 0.45,
          nextLength * 0.45
        )

      const start: LandscapePoint = [
        point[0] +
          previousDelta[0] /
          Math.max(previousLength, 0.0001) *
          distance,
        point[1] +
          previousDelta[1] /
          Math.max(previousLength, 0.0001) *
          distance,
      ]

      const end: LandscapePoint = [
        point[0] +
          nextDelta[0] /
          Math.max(nextLength, 0.0001) *
          distance,
        point[1] +
          nextDelta[1] /
          Math.max(nextLength, 0.0001) *
          distance,
      ]

      return {
        point: worldToSvg(point),
        start: worldToSvg(start),
        end: worldToSvg(end),
      }
    })

  const first = corners[0]
  const commands = [
    `M ${first.start[0]} ${first.start[1]}`,
  ]

  for (const corner of corners) {
    commands.push(
      `L ${corner.start[0]} ${corner.start[1]}`,
      `Q ${corner.point[0]} ${corner.point[1]} ${corner.end[0]} ${corner.end[1]}`
    )
  }

  commands.push('Z')
  return commands.join(' ')
}

function smoothPathData(
  points: LandscapePoint[],
  smooth: boolean
): string {
  if (points.length === 0) {
    return ''
  }

  const svgPoints =
    points.map(worldToSvg)

  if (
    !smooth ||
    svgPoints.length < 3
  ) {
    return svgPoints
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
      )
      .join(' ')
  }

  const commands = [
    `M ${svgPoints[0][0]} ${svgPoints[0][1]}`,
  ]

  for (
    let index = 0;
    index < svgPoints.length - 1;
    index += 1
  ) {
    const previous =
      svgPoints[Math.max(0, index - 1)]

    const current =
      svgPoints[index]

    const next =
      svgPoints[index + 1]

    const following =
      svgPoints[
        Math.min(svgPoints.length - 1, index + 2)
      ]

    const controlOne: LandscapePoint = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6,
    ]

    const controlTwo: LandscapePoint = [
      next[0] - (following[0] - current[0]) / 6,
      next[1] - (following[1] - current[1]) / 6,
    ]

    commands.push(
      `C ${controlOne[0]} ${controlOne[1]} ${controlTwo[0]} ${controlTwo[1]} ${next[0]} ${next[1]}`
    )
  }

  return commands.join(' ')
}

function bezierPathData(
  points: LandscapePoint[],
  handles: BezierHandles[],
  closed: boolean
): string {
  if (points.length === 0) return ''

  const commands = [`M ${worldToSvg(points[0]).join(' ')}`]
  const segmentCount = closed ? points.length : points.length - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % points.length
    const end = worldToSvg(points[nextIndex])
    const outgoing = handles[index]?.outgoing
    const incoming = handles[nextIndex]?.incoming

    if (outgoing || incoming) {
      const controlOne = worldToSvg(outgoing ?? points[index])
      const controlTwo = worldToSvg(incoming ?? points[nextIndex])
      commands.push(`C ${controlOne.join(' ')} ${controlTwo.join(' ')} ${end.join(' ')}`)
    } else {
      commands.push(`L ${end.join(' ')}`)
    }
  }

  if (closed) commands.push('Z')
  return commands.join(' ')
}

function sampleBezierGeometry(
  points: LandscapePoint[],
  handles: BezierHandles[],
  closed: boolean
): LandscapePoint[] {
  if (!handles.some((handle) => handle.incoming || handle.outgoing)) {
    return points
  }

  const result: LandscapePoint[] = []
  const segmentCount = closed ? points.length : points.length - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % points.length
    const start = points[index]
    const end = points[nextIndex]
    const c1 = handles[index]?.outgoing ?? start
    const c2 = handles[nextIndex]?.incoming ?? end

    for (let step = index === 0 ? 0 : 1; step <= 16; step += 1) {
      const t = step / 16
      const inverse = 1 - t
      result.push([
        inverse ** 3 * start[0] + 3 * inverse ** 2 * t * c1[0] + 3 * inverse * t ** 2 * c2[0] + t ** 3 * end[0],
        inverse ** 3 * start[1] + 3 * inverse ** 2 * t * c1[1] + 3 * inverse * t ** 2 * c2[1] + t ** 3 * end[1],
      ])
    }
  }

  if (closed) result.pop()
  return result
}

function escapeHtml(
  value: string
): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function surfaceColor(
  material: SurfaceMaterialId
): string {
  return surfaceMaterial(material).color
}

function sameSelection(a: Selection, b: Selection): boolean {
  return a.kind === b.kind && a.id === b.id
}

function selections(): Selection[] {
  return selection ? [selection, ...additionalSelections] : []
}

function setSelections(next: Selection[]): void {
  const unique = next.filter(
    (candidate, index) =>
      next.findIndex((item) => sameSelection(item, candidate)) === index
  )

  selection = unique[0] ?? null
  additionalSelections = unique.slice(1)
}

function clearSelection(): void {
  selection = null
  additionalSelections = []
}

function isSelected(kind: SelectionKind, id: string): boolean {
  return selections().some(
    (item) => item.kind === kind && item.id === id
  )
}

function selectionClass(
  kind: SelectionKind,
  id: string
): string {
  return isSelected(kind, id)
    ? ' map-selected'
    : ''
}

function selectableAttributes(
  kind: SelectionKind,
  id: string
): string {
  return `data-selection-kind="${kind}" data-id="${escapeHtml(id)}"`
}

function renderCrosswalks(): string {
  const main = CITY_LAYOUT.crosswalks.main
  const side = CITY_LAYOUT.crosswalks.side
  const mainBack =
    CITY_LAYOUT.mainRoad.centerZ -
    CITY_LAYOUT.mainRoad.width / 2 +
    0.22
  const mainFront =
    CITY_LAYOUT.mainRoad.centerZ +
    CITY_LAYOUT.mainRoad.width / 2 -
    0.22
  const sideLeft =
    CITY_LAYOUT.sideRoad.centerX -
    CITY_LAYOUT.sideRoad.width / 2 +
    0.18
  const sideRight =
    CITY_LAYOUT.sideRoad.centerX +
    CITY_LAYOUT.sideRoad.width / 2 -
    0.18
  const [mainStartX, mainStartY] =
    worldToSvg([
      main.centerX - main.width / 2,
      mainBack,
    ])
  const [, mainEndY] =
    worldToSvg([main.centerX, mainFront])
  const [sideStartX, sideStartY] =
    worldToSvg([
      sideLeft,
      side.centerZ - side.depth / 2,
    ])
  const [sideEndX] =
    worldToSvg([sideRight, side.centerZ])
  const mainStripeWidth = 0.22 * PIXELS_PER_UNIT
  const mainStripeStep = 0.34 * PIXELS_PER_UNIT
  const sideStripeHeight = 0.16 * PIXELS_PER_UNIT
  const sideStripeStep = 0.27 * PIXELS_PER_UNIT
  const stripes: string[] = []

  for (
    let x = mainStartX;
    x < mainStartX + main.width * PIXELS_PER_UNIT;
    x += mainStripeStep
  ) {
    stripes.push(
      `<rect class="road-crosswalk" x="${x}" y="${mainStartY}" width="${mainStripeWidth}" height="${mainEndY - mainStartY}" rx="2" />`
    )
  }

  for (
    let z = sideStartY;
    z < sideStartY + side.depth * PIXELS_PER_UNIT;
    z += sideStripeStep
  ) {
    stripes.push(
      `<rect class="road-crosswalk" x="${sideStartX}" y="${z}" width="${sideEndX - sideStartX}" height="${sideStripeHeight}" rx="2" />`
    )
  }

  return stripes.join('')
}

function renderRoad(): string {
  const mainBack =
    CITY_LAYOUT.mainRoad.centerZ -
    CITY_LAYOUT.mainRoad.width / 2

  const mainFront =
    CITY_LAYOUT.mainRoad.centerZ +
    CITY_LAYOUT.mainRoad.width / 2

  const sideLeft =
    CITY_LAYOUT.sideRoad.centerX -
    CITY_LAYOUT.sideRoad.width / 2

  const [sideSvgX] =
    worldToSvg([sideLeft, 0])

  const [, mainSvgY] =
    worldToSvg([0, mainBack])

  const mainHeight =
    (mainFront - mainBack) * PIXELS_PER_UNIT

  const sideWidth =
    CITY_LAYOUT.sideRoad.width * PIXELS_PER_UNIT

  const sideCenterX =
    (CITY_LAYOUT.sideRoad.centerX + MAP_HALF_WIDTH) *
    PIXELS_PER_UNIT

  const mainCenterY =
    (CITY_LAYOUT.mainRoad.centerZ + MAP_HALF_DEPTH) *
    PIXELS_PER_UNIT

  return `
    <g class="road-overlay">
      <rect class="road-edge" x="0" y="${mainSvgY}" width="${SVG_WIDTH}" height="${mainHeight}" />
      <rect class="road-edge" x="${sideSvgX}" y="0" width="${sideWidth}" height="${mainSvgY + mainHeight / 2}" />
      <rect class="road-asphalt" x="0" y="${mainSvgY}" width="${SVG_WIDTH}" height="${mainHeight}" />
      <rect class="road-asphalt" x="${sideSvgX}" y="0" width="${sideWidth}" height="${mainSvgY + mainHeight / 2}" />
      <path class="road-marking" d="M 0 ${mainCenterY} H ${SVG_WIDTH}" />
      <path class="road-marking" d="M ${sideCenterX} 0 V ${mainCenterY}" />
      ${renderCrosswalks()}
      <text class="road-lock-label" x="${sideCenterX}" y="44">ДОРОГА ЗАБЛОКИРОВАНА</text>
    </g>
  `
}

function pointsForSelection(selected: Selection): LandscapePoint[] {

  if (selected.kind === 'surface') {
    return map.surfaces.find(
      (item) => item.id === selected.id
    )?.points ?? []
  }

  if (selected.kind === 'path') {
    return map.paths.find(
      (item) => item.id === selected.id
    )?.points ?? []
  }

  if (selected.kind === 'vegetation') {
    const item =
      map.vegetation.find(
        (entry) => entry.id === selected.id
      )

    return item ? [item.position] : []
  }

  if (selected.kind === 'object') {
    const item = map.objects.find((entry) => entry.id === selected.id)
    return item ? [item.position] : []
  }

  if (selected.kind === 'vegetation-line') {
    return map.vegetationLines.find(
      (item) => item.id === selected.id
    )?.points ?? []
  }

  return map.vegetationAreas.find(
    (item) => item.id === selected.id
  )?.points ?? []
}

function selectedPoints(): LandscapePoint[] {
  return selection ? pointsForSelection(selection) : []
}

function renderHandles(): string {
  if (!selection || additionalSelections.length > 0 || tool !== 'select') {
    return ''
  }

  const points = selectedPoints()
  const item = selectedItem()
  const bezierHandles =
    item && 'handles' in item ? item.handles : []

  const controls = points.map((point, index) => {
    const anchor = worldToSvg(point)
    const handles = bezierHandles[index]

    return (['incoming', 'outgoing'] as const).map((side) => {
      const handle = handles?.[side]
      if (!handle) return ''
      const control = worldToSvg(handle)
      return `
        <line class="bezier-control-line" x1="${anchor[0]}" y1="${anchor[1]}" x2="${control[0]}" y2="${control[1]}" />
        <circle class="bezier-handle" data-bezier-index="${index}" data-bezier-side="${side}" cx="${control[0]}" cy="${control[1]}" r="${4.5 / currentZoom()}" />
      `
    }).join('')
  }).join('')

  const anchors = points
    .map((point, index) => {
      const [x, y] = worldToSvg(point)

      return `
        <circle
          class="point-handle-hit-area"
          data-handle-index="${index}"
          cx="${x}"
          cy="${y}"
          r="${15 / currentZoom()}"
        />
        <circle
          class="point-handle"
          data-handle-index="${index}"
          cx="${x}"
          cy="${y}"
          r="${8 / currentZoom()}"
        />
      `
    })
    .join('')

  return controls + anchors
}

function renderMarquee(): string {
  if (!marqueeState) return ''

  const [startX, startY] = worldToSvg(marqueeState.start)
  const [currentX, currentY] = worldToSvg(marqueeState.current)

  return `
    <rect
      class="selection-marquee"
      x="${Math.min(startX, currentX)}"
      y="${Math.min(startY, currentY)}"
      width="${Math.abs(currentX - startX)}"
      height="${Math.abs(currentY - startY)}"
    />
  `
}

function renderDraft(): string {
  if (
    draftPoints.length === 0 &&
    !hoverPoint
  ) {
    return ''
  }

  const close =
    tool === 'surface' ||
    tool === 'tree-area' ||
    tool === 'bush-area'

  const previewPoints =
    hoverPoint &&
    (
      draftPoints.length === 0 ||
      hoverPoint[0] !== draftPoints.at(-1)?.[0] ||
      hoverPoint[1] !== draftPoints.at(-1)?.[1]
    )
      ? [...draftPoints, hoverPoint]
      : [...draftPoints]

  const points = previewPoints
    .map((point, index) => {
      const [x, y] = worldToSvg(point)
      const isCursor = index >= draftPoints.length
      const isFirst = index === 0
      return `<circle class="draft-point${isCursor ? ' is-cursor' : ''}${isFirst ? ' is-first' : ''}" cx="${x}" cy="${y}" r="${4 / currentZoom()}" />`
    })
    .join('')

  const previewHandles = [
    ...draftHandles,
    ...Array.from(
      { length: Math.max(0, previewPoints.length - draftHandles.length) },
      () => ({ incoming: null, outgoing: null })
    ),
  ]

  const vectorPath = bezierPathData(
    previewPoints,
    previewHandles,
    close && previewPoints.length >= 3
  )

  const controls = draftPoints.map((anchor, index) => {
    const anchorSvg = worldToSvg(anchor)
    return (['incoming', 'outgoing'] as const).map((side) => {
      const handle = draftHandles[index]?.[side]
      if (!handle) return ''
      const handleSvg = worldToSvg(handle)
      return `
        <line class="bezier-control-line" x1="${anchorSvg[0]}" y1="${anchorSvg[1]}" x2="${handleSvg[0]}" y2="${handleSvg[1]}" />
        <circle class="bezier-handle draft-bezier-handle" cx="${handleSvg[0]}" cy="${handleSvg[1]}" r="${4 / currentZoom()}" />
      `
    }).join('')
  }).join('')

  const gestureControls = penGesture?.moved
    ? (() => {
        const anchor = worldToSvg(penGesture.anchor)
        const outgoing = worldToSvg(penGesture.current)
        const incoming = worldToSvg([
          penGesture.anchor[0] * 2 - penGesture.current[0],
          penGesture.anchor[1] * 2 - penGesture.current[1],
        ])
        return `
          <line class="bezier-control-line" x1="${incoming[0]}" y1="${incoming[1]}" x2="${outgoing[0]}" y2="${outgoing[1]}" />
          <circle class="bezier-handle draft-bezier-handle" cx="${incoming[0]}" cy="${incoming[1]}" r="${4 / currentZoom()}" />
          <circle class="bezier-handle draft-bezier-handle" cx="${outgoing[0]}" cy="${outgoing[1]}" r="${4 / currentZoom()}" />
          <circle class="draft-point is-cursor" cx="${anchor[0]}" cy="${anchor[1]}" r="${4 / currentZoom()}" />
        `
      })()
    : ''

  if (close && previewPoints.length >= 3) {
    return `
      <g class="draft-preview">
        <path
          class="draft-shape"
          d="${vectorPath}"
        />
        ${points}
        ${controls}
        ${gestureControls}
      </g>
    `
  }

  return `
    <g class="draft-preview">
      <path
        class="draft-shape"
        fill="none"
        d="${vectorPath}"
      />
      ${points}
      ${controls}
      ${gestureControls}
    </g>
  `
}

function renderSurfaces(): string {
  return map.surfaces.map((surface) => `
    <path
      class="map-surface map-selectable${selectionClass('surface', surface.id)}"
      ${selectableAttributes('surface', surface.id)}
      fill="${surfaceColor(surface.material)}"
      d="${surface.handles.some((handle) => handle.incoming || handle.outgoing)
        ? bezierPathData(surface.points, surface.handles, true)
        : roundedPolygonPath(surface.points, surface.cornerRadius)}"
    >
      <title>${escapeHtml(surface.name)}</title>
    </path>
  `).join('')
}

function renderPaths(): string {
  return map.paths.map((path) => `
    <path
      class="map-path map-selectable${selectionClass('path', path.id)}"
      ${selectableAttributes('path', path.id)}
      fill="none"
      stroke="${surfaceColor(path.material)}"
      stroke-width="${path.width * PIXELS_PER_UNIT}"
      d="${path.handles.some((handle) => handle.incoming || handle.outgoing)
        ? bezierPathData(path.points, path.handles, false)
        : smoothPathData(path.points, path.smooth)}"
    >
      <title>${escapeHtml(path.name)}</title>
    </path>
  `).join('')
}

function renderVegetationAreas(): string {
  return map.vegetationAreas.map((area) => `
    <polygon
      class="vegetation-area map-selectable${selectionClass('vegetation-area', area.id)}"
      ${selectableAttributes('vegetation-area', area.id)}
      points="${pointsAttribute(area.points)}"
    >
      <title>${area.kind === 'tree' ? 'Деревья' : 'Кусты'}: ${area.count}</title>
    </polygon>
  `).join('')
}

function renderVegetationLines(): string {
  return map.vegetationLines.map((line) => `
    <polyline
      class="vegetation-line map-selectable${selectionClass('vegetation-line', line.id)}"
      ${selectableAttributes('vegetation-line', line.id)}
      fill="none"
      points="${pointsAttribute(line.points)}"
    >
      <title>${line.kind === 'tree' ? 'Деревья' : 'Кусты'} через ${line.spacing} м</title>
    </polyline>
  `).join('')
}

function renderVegetation(): string {
  return map.vegetation.map((item) => {
    const [x, y] = worldToSvg(item.position)
    const invalid = pointOnRoad(item.position)

    return `
      <circle
        class="vegetation-marker ${item.kind}${invalid ? ' invalid' : ''} map-selectable${selectionClass('vegetation', item.id)}"
        ${selectableAttributes('vegetation', item.id)}
        cx="${x}"
        cy="${y}"
        r="${item.kind === 'tree' ? 9 : 6}"
      >
        <title>${item.kind === 'tree' ? 'Дерево' : 'Куст'} — ${escapeHtml(item.id)}</title>
      </circle>
    `
  }).join('')
}

function renderSceneObjects(): string {
  return map.objects.map((item) => {
    const [x, y] = worldToSvg(item.position)
    const invalid = pointOnRoad(item.position)

    return `
      <g
        class="map-selectable${selectionClass('object', item.id)}"
        ${selectableAttributes('object', item.id)}
        transform="translate(${x} ${y}) rotate(${-item.rotation})"
      >
        <rect class="scene-object-marker${invalid ? ' invalid' : ''}" x="-8" y="-8" width="16" height="16" rx="3" />
        <path class="scene-object-direction" d="M 0 -12 L 4 -6 H -4 Z" />
        <title>${escapeHtml(item.name)}</title>
      </g>
    `
  }).join('')
}

function initializeMapDom(): void {
  svg.innerHTML = `
    <defs>
      <pattern id="small-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#c9cbc5" stroke-width="1" />
      </pattern>
      <pattern id="large-grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="url(#small-grid)" />
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#b4b8b0" stroke-width="1.5" />
      </pattern>
    </defs>
    <rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#deded7" />
    <rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="url(#large-grid)" />
    <path class="seam-boundary" d="M 2 0 V ${SVG_HEIGHT} M ${SVG_WIDTH - 2} 0 V ${SVG_HEIGHT}" />
    <g id="map-seam-copies" class="seam-copy">
      <use href="#map-landscape-content" transform="translate(${-SVG_WIDTH} 0)" />
      <use href="#map-landscape-content" transform="translate(${SVG_WIDTH} 0)" />
    </g>
    <g id="map-landscape-content" class="landscape-content"></g>
    <g id="map-road">${renderRoad()}</g>
    <g id="map-overlay"></g>
  `

  landscapeLayer = elementById<SVGGElement>('map-landscape-content')
  overlayLayer = elementById<SVGGElement>('map-overlay')
  seamCopiesLayer = elementById<SVGGElement>('map-seam-copies')
}

function renderMap(): void {
  if (mapRenderFrame !== null) {
    window.cancelAnimationFrame(mapRenderFrame)
    mapRenderFrame = null
  }

  if (!landscapeLayer || !overlayLayer || !seamCopiesLayer) initializeMapDom()

  const landscapeContent = `
    ${renderSurfaces()}
    ${renderPaths()}
    ${renderVegetationAreas()}
    ${renderVegetationLines()}
    ${renderVegetation()}
    ${renderSceneObjects()}
  `

  if (landscapeContent !== lastLandscapeMarkup) {
    landscapeLayer!.innerHTML = landscapeContent
    lastLandscapeMarkup = landscapeContent
  }

  overlayLayer!.innerHTML = `
    ${renderDraft()}
    ${renderMarquee()}
    ${renderHandles()}
  `
  seamCopiesLayer!.style.display = seamPreview.checked ? '' : 'none'
  svg.dataset.tool = tool
  applyViewport()
}

function scheduleMapRender(): void {
  if (mapRenderFrame !== null) {
    return
  }

  mapRenderFrame = window.requestAnimationFrame(() => {
    mapRenderFrame = null
    renderMap()
  })
}

function optionMarkup(
  value: string,
  label: string,
  selectedValue: string
): string {
  return `
    <option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>
      ${escapeHtml(label)}
    </option>
  `
}

function materialOptions(
  selectedValue: SurfaceMaterialId
): string {
  return SURFACE_MATERIALS.map(
    (item) =>
      optionMarkup(item.id, item.label, selectedValue)
  ).join('')
}

function modelOptions(
  kind: VegetationKind,
  selectedValue: VegetationModel
): string {
  if (kind === 'tree') {
    return [
      optionMarkup('random-tree', 'Случайные деревья', selectedValue),
      ...TREE_MODELS.map(
        (model, index) =>
          optionMarkup(model, `Дерево ${index + 1}`, selectedValue)
      ),
    ].join('')
  }

  const bushLabels: Record<(typeof BUSH_MODELS)[number], string> = {
    '/models/shrub-01-white.glb': 'Белый куст',
    '/models/shrub-02-pink.glb': 'Розовый куст',
    '/models/shrub-03-yellow.glb': 'Жёлтый куст',
    '/models/shrub-04-purple.glb': 'Фиолетовый куст',
    '/models/shrub-05-cream.glb': 'Кремовый куст',
    '/models/shrub-06-coral.glb': 'Коралловый куст',
    '/models/shrub-07-green.glb': 'Зелёный куст',
    '/models/shrub-08-giant-cream.glb': 'Гигантский кремовый',
    '/models/shrub-09-giant-green.glb': 'Гигантский зелёный',
  }

  return [
    optionMarkup('random-bush', 'Случайные кусты', selectedValue),
    ...BUSH_MODELS.map((model) =>
      optionMarkup(model, bushLabels[model], selectedValue)
    ),
  ].join('')
}

function sceneObjectOptions(selectedValue: string): string {
  const groups = new Map<string, typeof SCENE_OBJECT_CATALOG>()

  for (const item of SCENE_OBJECT_CATALOG) {
    const group = item.catalogGroup ?? (
      item.categoryKey ? item.name : 'Декор и окружение'
    )
    groups.set(group, [...(groups.get(group) ?? []), item])
  }

  return [...groups.entries()].map(([group, items]) => `
    <optgroup label="${escapeHtml(group)}">
      ${items.map((item) => optionMarkup(
        item.model,
        item.model.split('/').at(-1)?.replace(/\.glb$/i, '') ?? item.name,
        selectedValue
      )).join('')}
    </optgroup>
  `).join('')
}

function itemForSelection(selected: Selection):
  | LandscapeSurface
  | LandscapePath
  | VegetationPoint
  | VegetationLine
  | VegetationArea
  | SceneObject
  | null {
  if (selected.kind === 'surface') {
    return map.surfaces.find((item) => item.id === selected.id) ?? null
  }

  if (selected.kind === 'path') {
    return map.paths.find((item) => item.id === selected.id) ?? null
  }

  if (selected.kind === 'vegetation') {
    return map.vegetation.find((item) => item.id === selected.id) ?? null
  }

  if (selected.kind === 'vegetation-line') {
    return map.vegetationLines.find((item) => item.id === selected.id) ?? null
  }

  if (selected.kind === 'object') {
    return map.objects.find((item) => item.id === selected.id) ?? null
  }

  return map.vegetationAreas.find((item) => item.id === selected.id) ?? null
}

function selectedItem(): ReturnType<typeof itemForSelection> {
  return selection ? itemForSelection(selection) : null
}

function numberField(
  id: string,
  label: string,
  value: number,
  minimum: number,
  maximum: number,
  step: number
): string {
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <input
        id="${id}"
        class="input"
        type="number"
        min="${minimum}"
        max="${maximum}"
        step="${step}"
        value="${value}"
      />
    </label>
  `
}

function textField(
  id: string,
  label: string,
  value: string
): string {
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <input
        id="${id}"
        class="input"
        type="text"
        value="${escapeHtml(value)}"
      />
    </label>
  `
}

function bindChange(
  id: string,
  handler: (element: HTMLInputElement | HTMLSelectElement) => void
): void {
  const element =
    document.getElementById(id)

  element?.addEventListener('change', () => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    ) {
      handler(element)
    }
  })
}

function currentKind(): VegetationKind {
  return tool.includes('bush')
    ? 'bush'
    : 'tree'
}

function currentModel(
  kind = currentKind()
): VegetationModel {
  return kind === 'tree'
    ? settings.treeModel
    : settings.bushModel
}

function currentScale(
  kind = currentKind()
): number {
  return kind === 'tree'
    ? settings.treeScale
    : settings.bushScale
}

function renderCurrentToolProperties(): void {
  if (
    tool === 'surface' ||
    tool === 'path'
  ) {
    propertyContent.innerHTML = `
      <div class="form-stack">
        <label class="field">
          <span class="field-label">Материал</span>
          <select id="tool-material" class="select">
            ${materialOptions(settings.material)}
          </select>
        </label>

        ${
          tool === 'surface'
            ? numberField('tool-radius', 'Скругление углов, м', settings.cornerRadius, 0, 2, 0.05)
            : `
              ${numberField('tool-width', 'Ширина дорожки, м', settings.pathWidth, 0.3, 6, 0.1)}
              <label class="checkbox-row">
                <input id="tool-smooth" type="checkbox"${settings.pathSmooth ? ' checked' : ''} />
                <span>Плавные повороты</span>
              </label>
            `
        }

        <label class="checkbox-row">
          <input id="tool-snap" type="checkbox"${settings.snap ? ' checked' : ''} />
          <span>Привязка к сетке 25 см</span>
        </label>

        <p class="field-note">Можно ставить сколько угодно точек. Зона не обязана быть прямоугольной.</p>
      </div>
    `

    bindChange('tool-material', (element) => {
      settings.material = element.value as SurfaceMaterialId
    })

    bindChange('tool-radius', (element) => {
      settings.cornerRadius = Number(element.value)
    })

    bindChange('tool-width', (element) => {
      settings.pathWidth = Number(element.value)
    })

    bindChange('tool-smooth', (element) => {
      settings.pathSmooth =
        element instanceof HTMLInputElement && element.checked
    })

    bindChange('tool-snap', (element) => {
      settings.snap =
        element instanceof HTMLInputElement && element.checked
    })

    return
  }

  if (tool === 'object') {
    propertyContent.innerHTML = `
      <div class="form-stack">
        <label class="field">
          <span class="field-label">Объект</span>
          <select id="tool-object-model" class="select">
            ${sceneObjectOptions(settings.objectModel)}
          </select>
        </label>
        <p class="field-note">В каталоге ${SCENE_OBJECT_CATALOG.length} моделей. Поставьте объект кликом на карту; поворот и масштаб меняются после выбора.</p>
      </div>
    `

    bindChange('tool-object-model', (element) => {
      settings.objectModel = element.value
    })
    return
  }

  if (tool !== 'select') {
    const kind = currentKind()
    const isLine = tool.endsWith('-line')
    const isArea = tool.endsWith('-area')
    const scale = currentScale(kind)

    propertyContent.innerHTML = `
      <div class="form-stack">
        <label class="field">
          <span class="field-label">Модель</span>
          <select id="tool-model" class="select">
            ${modelOptions(kind, currentModel(kind))}
          </select>
        </label>

        ${numberField('tool-scale', 'Масштаб', scale, 0.1, 2, 0.02)}

        ${
          isLine
            ? numberField(
                'tool-spacing',
                'Расстояние между объектами, м',
                kind === 'tree' ? settings.treeSpacing : settings.bushSpacing,
                0.4,
                8,
                0.1
              )
            : ''
        }

        ${
          isArea
            ? `
              ${numberField(
                'tool-count',
                'Количество',
                kind === 'tree' ? settings.treeCount : settings.bushCount,
                1,
                60,
                1
              )}
              ${numberField(
                'tool-distance',
                'Минимальное расстояние, м',
                kind === 'tree' ? settings.treeMinDistance : settings.bushMinDistance,
                0,
                8,
                0.1
              )}
            `
            : ''
        }

        <label class="checkbox-row">
          <input id="tool-snap" type="checkbox"${settings.snap ? ' checked' : ''} />
          <span>Привязка к сетке 25 см</span>
        </label>
      </div>
    `

    bindChange('tool-model', (element) => {
      if (kind === 'tree') {
        settings.treeModel = element.value as VegetationModel
      } else {
        settings.bushModel = element.value as VegetationModel
      }
    })

    bindChange('tool-scale', (element) => {
      if (kind === 'tree') {
        settings.treeScale = Number(element.value)
      } else {
        settings.bushScale = Number(element.value)
      }
    })

    bindChange('tool-spacing', (element) => {
      if (kind === 'tree') {
        settings.treeSpacing = Number(element.value)
      } else {
        settings.bushSpacing = Number(element.value)
      }
    })

    bindChange('tool-count', (element) => {
      if (kind === 'tree') {
        settings.treeCount = Number(element.value)
      } else {
        settings.bushCount = Number(element.value)
      }
    })

    bindChange('tool-distance', (element) => {
      if (kind === 'tree') {
        settings.treeMinDistance = Number(element.value)
      } else {
        settings.bushMinDistance = Number(element.value)
      }
    })

    bindChange('tool-snap', (element) => {
      settings.snap =
        element instanceof HTMLInputElement && element.checked
    })

    return
  }

  propertyContent.innerHTML = `
    <div class="form-stack">
      <div class="selection-summary">
        <strong>Карта ${CITY_LAYOUT.width} × ${CITY_LAYOUT.depth} м</strong>
        <span>Зон: ${map.surfaces.length}</span>
        <span>Дорожек: ${map.paths.length}</span>
        <span>Отдельных растений: ${map.vegetation.length}</span>
        <span>Объектов: ${map.objects.length}</span>
        <span>Линий и областей: ${map.vegetationLines.length + map.vegetationAreas.length}</span>
      </div>
      <p class="field-note">Протяните рамку по пустому месту для группового выбора. Shift + клик добавляет или убирает отдельный объект.</p>
      <label class="checkbox-row">
        <input id="tool-snap" type="checkbox"${settings.snap ? ' checked' : ''} />
        <span>Привязка к сетке 25 см</span>
      </label>
    </div>
  `

  bindChange('tool-snap', (element) => {
    settings.snap =
      element instanceof HTMLInputElement && element.checked
  })
}

function updateSelected(
  mutate: (
    item:
      | LandscapeSurface
      | LandscapePath
      | VegetationPoint
      | VegetationLine
      | VegetationArea
      | SceneObject
  ) => void
): void {
  const item = selectedItem()

  if (!item) {
    return
  }

  commitMutation(() => mutate(item))
}

function renderSelectedProperties(): void {
  const item = selectedItem()

  if (!selection || !item) {
    renderCurrentToolProperties()
    return
  }

  if (additionalSelections.length > 0) {
    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>Выбрано объектов: ${selections().length}</strong>
          <span>Перетащите любой выбранный объект, чтобы переместить всю группу.</span>
          <span>Shift + клик — добавить объект или убрать его из группы.</span>
        </div>
        <button id="delete-selected" class="button danger" type="button">Удалить выбранное</button>
      </div>
    `
    document
      .getElementById('delete-selected')
      ?.addEventListener('click', deleteSelected)
    return
  }

  if (selection.kind === 'object') {
    const object = item as SceneObject

    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>${escapeHtml(object.name)}</strong>
          <span>Статичный объект</span>
        </div>
        ${textField('selected-name', 'Название', object.name)}
        <label class="field">
          <span class="field-label">Модель</span>
          <select id="selected-object-model" class="select">
            ${sceneObjectOptions(object.model)}
          </select>
        </label>
        ${numberField('selected-scale', 'Масштаб', object.scale, 0.05, 10, 0.05)}
        ${numberField('selected-rotation', 'Поворот, °', object.rotation, -360, 360, 1)}
        ${numberField('selected-elevation', 'Высота, м', object.elevation, -5, 20, 0.05)}
        <div class="field-grid">
          ${numberField('selected-x', 'X, м', object.position[0], -MAP_HALF_WIDTH, MAP_HALF_WIDTH, 0.25)}
          ${numberField('selected-z', 'Z, м', object.position[1], -MAP_HALF_DEPTH, MAP_HALF_DEPTH, 0.25)}
        </div>
        ${textField('selected-url', 'Ссылка', object.url ?? '')}
        <div class="property-actions">
          <button id="duplicate-selected" class="button" type="button">Дублировать</button>
          <button id="delete-selected" class="button danger" type="button">Удалить</button>
        </div>
      </div>
    `

    bindChange('selected-name', (element) => updateSelected((selected) => {
      if ('elevation' in selected && element.value.trim()) selected.name = element.value.trim()
    }))
    bindChange('selected-object-model', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.model = element.value
    }))
    bindChange('selected-scale', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.scale = Number(element.value)
    }))
    bindChange('selected-rotation', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.rotation = Number(element.value)
    }))
    bindChange('selected-elevation', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.elevation = Number(element.value)
    }))
    bindChange('selected-x', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.position[0] = Number(element.value)
    }))
    bindChange('selected-z', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.position[1] = Number(element.value)
    }))
    bindChange('selected-url', (element) => updateSelected((selected) => {
      if ('elevation' in selected) selected.url = element.value.trim()
    }))
  } else if (selection.kind === 'surface') {
    const surface = item as LandscapeSurface

    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>${escapeHtml(surface.name)}</strong>
          <span>Зона · ${surface.points.length} точек</span>
        </div>
        ${textField('selected-name', 'Название', surface.name)}
        <label class="field">
          <span class="field-label">Материал</span>
          <select id="selected-material" class="select">
            ${materialOptions(surface.material)}
          </select>
        </label>
        ${numberField('selected-radius', 'Скругление углов, м', surface.cornerRadius, 0, 2, 0.05)}
        <div class="property-actions">
          <button id="duplicate-selected" class="button" type="button">Дублировать</button>
          <button id="delete-selected" class="button danger" type="button">Удалить зону</button>
        </div>
      </div>
    `

    bindChange('selected-name', (element) => {
      const name = element.value.trim()

      if (name) {
        updateSelected((selected) => {
          if ('cornerRadius' in selected) {
            selected.name = name
          }
        })
      }
    })

    bindChange('selected-material', (element) => {
      updateSelected(
        (selected) => {
          if ('material' in selected) {
            selected.material = element.value as SurfaceMaterialId
          }
        }
      )
    })

    bindChange('selected-radius', (element) => {
      updateSelected(
        (selected) => {
          if ('cornerRadius' in selected) {
            selected.cornerRadius = Number(element.value)
          }
        }
      )
    })
  } else if (selection.kind === 'path') {
    const path = item as LandscapePath

    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>${escapeHtml(path.name)}</strong>
          <span>Дорожка · ${path.points.length} точек</span>
        </div>
        ${textField('selected-name', 'Название', path.name)}
        <label class="field">
          <span class="field-label">Материал</span>
          <select id="selected-material" class="select">
            ${materialOptions(path.material)}
          </select>
        </label>
        ${numberField('selected-width', 'Ширина, м', path.width, 0.3, 6, 0.1)}
        <label class="checkbox-row">
          <input id="selected-smooth" type="checkbox"${path.smooth ? ' checked' : ''} />
          <span>Плавные повороты</span>
        </label>
        <button id="delete-selected" class="button danger" type="button">Удалить дорожку</button>
      </div>
    `

    bindChange('selected-name', (element) => {
      const name = element.value.trim()

      if (name) {
        updateSelected((selected) => {
          if ('smooth' in selected) {
            selected.name = name
          }
        })
      }
    })

    bindChange('selected-material', (element) => {
      updateSelected(
        (selected) => {
          if ('material' in selected) {
            selected.material = element.value as SurfaceMaterialId
          }
        }
      )
    })

    bindChange('selected-width', (element) => {
      updateSelected(
        (selected) => {
          if ('width' in selected) {
            selected.width = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-smooth', (element) => {
      updateSelected(
        (selected) => {
          if (
            'smooth' in selected &&
            element instanceof HTMLInputElement
          ) {
            selected.smooth = element.checked
          }
        }
      )
    })
  } else if (selection.kind === 'vegetation') {
    const vegetation = item as VegetationPoint

    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>${vegetation.kind === 'tree' ? 'Дерево' : 'Куст'}</strong>
          <span>${escapeHtml(vegetation.id)}</span>
        </div>
        <label class="field">
          <span class="field-label">Модель</span>
          <select id="selected-model" class="select">
            ${modelOptions(vegetation.kind, vegetation.model)}
          </select>
        </label>
        ${numberField('selected-scale', 'Масштаб', vegetation.scale, 0.1, 2, 0.02)}
        ${numberField('selected-rotation', 'Поворот, °', vegetation.rotation, 0, 360, 1)}
        <button id="delete-selected" class="button danger" type="button">Удалить объект</button>
      </div>
    `

    bindChange('selected-model', (element) => {
      updateSelected(
        (selected) => {
          if ('position' in selected) {
            selected.model = element.value as VegetationModel
          }
        }
      )
    })

    bindChange('selected-scale', (element) => {
      updateSelected(
        (selected) => {
          if ('position' in selected) {
            selected.scale = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-rotation', (element) => {
      updateSelected(
        (selected) => {
          if ('position' in selected) {
            selected.rotation = Number(element.value)
          }
        }
      )
    })
  } else {
    const isLine =
      selection.kind === 'vegetation-line'

    const vegetation =
      item as VegetationLine | VegetationArea

    propertyContent.innerHTML = `
      <div class="form-stack">
        <div class="selection-summary">
          <strong>${vegetation.kind === 'tree' ? 'Деревья' : 'Кусты'} ${isLine ? 'линией' : 'зоной'}</strong>
          <span>${vegetation.points.length} точек</span>
        </div>
        <label class="field">
          <span class="field-label">Модель</span>
          <select id="selected-model" class="select">
            ${modelOptions(vegetation.kind, vegetation.model)}
          </select>
        </label>
        ${
          isLine
            ? numberField(
                'selected-spacing',
                'Расстояние, м',
                (vegetation as VegetationLine).spacing,
                0.4,
                8,
                0.1
              )
            : `
              ${numberField(
                'selected-count',
                'Количество',
                (vegetation as VegetationArea).count,
                1,
                60,
                1
              )}
              ${numberField(
                'selected-distance',
                'Минимальное расстояние, м',
                (vegetation as VegetationArea).minDistance,
                0,
                8,
                0.1
              )}
            `
        }
        ${numberField('selected-scale-min', 'Минимальный масштаб', vegetation.scaleMin, 0.1, 2, 0.02)}
        ${numberField('selected-scale-max', 'Максимальный масштаб', vegetation.scaleMax, 0.1, 2, 0.02)}
        <button id="delete-selected" class="button danger" type="button">Удалить заполнение</button>
      </div>
    `

    bindChange('selected-model', (element) => {
      updateSelected(
        (selected) => {
          if ('scaleMin' in selected) {
            selected.model = element.value as VegetationModel
          }
        }
      )
    })

    bindChange('selected-spacing', (element) => {
      updateSelected(
        (selected) => {
          if ('spacing' in selected) {
            selected.spacing = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-count', (element) => {
      updateSelected(
        (selected) => {
          if ('count' in selected) {
            selected.count = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-distance', (element) => {
      updateSelected(
        (selected) => {
          if ('minDistance' in selected) {
            selected.minDistance = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-scale-min', (element) => {
      updateSelected(
        (selected) => {
          if ('scaleMin' in selected) {
            selected.scaleMin = Number(element.value)
          }
        }
      )
    })

    bindChange('selected-scale-max', (element) => {
      updateSelected(
        (selected) => {
          if ('scaleMax' in selected) {
            selected.scaleMax = Number(element.value)
          }
        }
      )
    })
  }

  document
    .getElementById('delete-selected')
    ?.addEventListener('click', deleteSelected)

  document
    .getElementById('duplicate-selected')
    ?.addEventListener('click', duplicateSelected)
}

function renderProperties(): void {
  if (selection && tool === 'select') {
    renderSelectedProperties()
  } else {
    renderCurrentToolProperties()
  }
}

function minimumDraftPoints(): number {
  return (
    tool === 'surface' ||
    tool === 'tree-area' ||
    tool === 'bush-area'
  )
    ? 3
    : 2
}

function renderToolbar(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-tool]')
    .forEach((button) => {
      const active =
        button.dataset.tool === tool

      button.classList.toggle('active', active)
      button.setAttribute(
        'aria-pressed',
        String(active)
      )
    })

  elementById<HTMLButtonElement>('undo-button').disabled =
    !history.canUndo

  elementById<HTMLButtonElement>('redo-button').disabled =
    !history.canRedo

  const isDrawing =
    tool !== 'select' &&
    tool !== 'tree' &&
    tool !== 'bush' &&
    tool !== 'object'

  draftActions.hidden = !isDrawing
  elementById<HTMLButtonElement>(
    'finish-draft-button'
  ).disabled =
    draftPoints.length < minimumDraftPoints()
  elementById<HTMLButtonElement>(
    'remove-draft-point-button'
  ).disabled = draftPoints.length === 0

  canvasHint.textContent =
    draftPoints.length > 0
      ? `${toolHints[tool]} Точек: ${draftPoints.length}.`
      : toolHints[tool]
}

function renderLayers(): void {
  const layersContent = elementById<HTMLDivElement>('layers-content')

  if (map.surfaces.length === 0) {
    layersContent.innerHTML = '<p class="layer-empty">Зон пока нет. Создайте зону инструментом «Перо зоны» — порядок созданных зон и есть порядок слоёв.</p>'
    return
  }

  const layersCount = map.surfaces.length

  layersContent.innerHTML = `
    <div class="layer-list">
      ${map.surfaces.map((surface, index) => {
        const selectedClass =
          isSelected('surface', surface.id)
            ? ' selected'
            : ''
        const material = surfaceMaterial(surface.material)

        return `
          <div class="layer-row${selectedClass}">
            <button class="layer-swatch layer-select" type="button" data-layer-surface="${surface.id}"
              style="background:${material.color}" title="Выбрать зону «${escapeHtml(surface.name)}»"></button>
            <button class="layer-name layer-select" type="button" data-layer-surface="${surface.id}">
              <span class="layer-name-text">${escapeHtml(surface.name)}</span>
              <span class="layer-material">${escapeHtml(material.label)}</span>
            </button>
            <span class="layer-controls">
              <button class="layer-arrow" type="button" data-layer-move="${surface.id}" data-direction="front"
                title="Поднять вперёд (перекрывает)"${index === layersCount - 1 ? ' disabled' : ''}>▲</button>
              <button class="layer-arrow" type="button" data-layer-move="${surface.id}" data-direction="back"
                title="Опустить назад (позади)"${index === 0 ? ' disabled' : ''}>▼</button>
            </span>
          </div>
        `
      }).join('')}
    </div>
    <p class="field-note">Слой 1 — самый нижний, перекрывается всеми остальными.</p>
  `
}

function bindLayers(): void {
  const layersPanel = document.querySelector<HTMLDivElement>('#layers-content')
  if (!layersPanel) return

  layersPanel.querySelectorAll<HTMLButtonElement>('[data-layer-surface]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.layerSurface
      if (!id) return
      tool = 'select'
      setSelections([{ kind: 'surface', id }])
      render()
    })
  })

  layersPanel.querySelectorAll<HTMLButtonElement>('[data-layer-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.layerMove
      const direction = button.dataset.direction
      if (!id || (direction !== 'front' && direction !== 'back')) return
      moveSurfaceLayer(id, direction)
    })
  })
}

function moveSurfaceLayer(id: string, direction: 'front' | 'back'): void {
  const index = map.surfaces.findIndex((surface) => surface.id === id)
  if (index < 0) return

  const target = direction === 'front' ? index + 1 : index - 1
  if (target < 0 || target >= map.surfaces.length) return

  commitMutation(() => {
    const [surface] = map.surfaces.splice(index, 1)
    map.surfaces.splice(target, 0, surface)
  })

  const surface = map.surfaces[target]
  showToast(
    direction === 'front'
      ? `Зона «${surface.name}» поднята вперёд`
      : `Зона «${surface.name}» опущена назад`
  )
}

function render(): void {
  renderMap()
  renderProperties()
  renderToolbar()
  renderLayers()
  bindLayers()
}

function setTool(
  nextTool: Tool
): void {
  tool = nextTool
  clearSelection()
  draftPoints = []
  draftHandles = []
  hoverPoint = null
  render()
  svg.focus()
}

function cancelDraft(): void {
  draftPoints = []
  draftHandles = []
  hoverPoint = null
  render()
}

function removeLastDraftPoint(): void {
  if (draftPoints.length === 0) {
    return
  }

  draftPoints.pop()
  draftHandles.pop()
  render()
}

function selectFromTarget(
  target: EventTarget | null,
  additive = false
): void {
  if (!(target instanceof SVGElement)) {
    if (!additive) clearSelection()
    render()
    return
  }

  const selectable =
    target.closest<SVGElement>('[data-selection-kind]')

  if (!selectable) {
    if (!additive) clearSelection()
    render()
    return
  }

  const next: Selection = {
    kind:
      selectable.dataset.selectionKind as SelectionKind,
    id: selectable.dataset.id ?? '',
  }

  if (additive) {
    const current = selections()
    setSelections(
      current.some((item) => sameSelection(item, next))
        ? current.filter((item) => !sameSelection(item, next))
        : [...current, next]
    )
  } else {
    setSelections([next])
  }

  render()
}

function allSelectableSelections(): Selection[] {
  return [
    ...map.surfaces.map((item) => ({ kind: 'surface' as const, id: item.id })),
    ...map.paths.map((item) => ({ kind: 'path' as const, id: item.id })),
    ...map.vegetationAreas.map((item) => ({ kind: 'vegetation-area' as const, id: item.id })),
    ...map.vegetationLines.map((item) => ({ kind: 'vegetation-line' as const, id: item.id })),
    ...map.vegetation.map((item) => ({ kind: 'vegetation' as const, id: item.id })),
    ...map.objects.map((item) => ({ kind: 'object' as const, id: item.id })),
  ]
}

function selectionsInMarquee(start: LandscapePoint, end: LandscapePoint): Selection[] {
  const left = Math.min(start[0], end[0])
  const right = Math.max(start[0], end[0])
  const top = Math.min(start[1], end[1])
  const bottom = Math.max(start[1], end[1])

  return allSelectableSelections().filter((candidate) => {
    const points = pointsForSelection(candidate)
    if (points.length === 0) return false

    let padding = 0
    const item = itemForSelection(candidate)
    if (candidate.kind === 'path' && item && 'width' in item) padding = item.width / 2
    if (candidate.kind === 'vegetation') padding = 0.45
    if (candidate.kind === 'object') padding = 0.6

    const xs = points.map((point) => point[0])
    const zs = points.map((point) => point[1])
    const itemLeft = Math.min(...xs) - padding
    const itemRight = Math.max(...xs) + padding
    const itemTop = Math.min(...zs) - padding
    const itemBottom = Math.max(...zs) + padding

    return itemRight >= left && itemLeft <= right && itemBottom >= top && itemTop <= bottom
  })
}

function addVegetationPoint(
  point: LandscapePoint,
  kind: VegetationKind
): void {
  if (pointOnRoad(point)) {
    showToast('На дороге ставить растительность нельзя', 'error')
    return
  }

  const scale = currentScale(kind)

  commitMutation(() => {
    map.vegetation.push({
      id: uniqueId(kind),
      kind,
      model: currentModel(kind),
      position: point,
      scale,
      rotation: Math.round(Math.random() * 360),
    })
  })
}

function addSceneObject(point: LandscapePoint): void {
  if (pointOnRoad(point)) {
    showToast('Объект нельзя поставить на дорогу', 'error')
    return
  }

  const catalogItem = SCENE_OBJECT_CATALOG.find(
    (item) => item.model === settings.objectModel
  )

  if (!catalogItem) {
    showToast('Выберите модель объекта', 'error')
    return
  }

  commitMutation(() => {
    map.objects.push({
      id: uniqueId('object'),
      name: catalogItem.name,
      model: catalogItem.model,
      position: point,
      elevation: 0,
      scale: catalogItem.defaultScale,
      rotation: 0,
      categoryKey: catalogItem.categoryKey,
      url: catalogItem.url,
    })
  })
}

function completeDraft(): void {
  if (tool === 'surface') {
    if (draftPoints.length < 3) {
      showToast('Для зоны нужно минимум три точки', 'error')
      return
    }

    if (polygonIntersectsRoad(
      sampleBezierGeometry(draftPoints, draftHandles, true),
      0.08
    )) {
      showToast('Зона пересекает дорогу', 'error')
      return
    }

    const points = [...draftPoints]
    const handles = structuredClone(draftHandles)

    commitMutation(() => {
      const number = map.surfaces.length + 1

      map.surfaces.push({
        id: uniqueId('surface'),
        name: `Зона ${number}`,
        material: settings.material,
        points,
        cornerRadius: settings.cornerRadius,
        handles,
      })

      draftPoints = []
      draftHandles = []
      hoverPoint = null
    })

    return
  }

  if (tool === 'path') {
    if (draftPoints.length < 2) {
      showToast('Для дорожки нужно минимум две точки', 'error')
      return
    }

    if (
      lineIntersectsRoad(
        sampleBezierGeometry(draftPoints, draftHandles, false),
        settings.pathWidth / 2 + 0.08
      )
    ) {
      showToast('Дорожка пересекает автомобильную дорогу', 'error')
      return
    }

    const points = [...draftPoints]
    const handles = structuredClone(draftHandles)

    commitMutation(() => {
      const number = map.paths.length + 1

      map.paths.push({
        id: uniqueId('path'),
        name: `Дорожка ${number}`,
        material: settings.material,
        points,
        width: settings.pathWidth,
        smooth: settings.pathSmooth,
        handles,
      })

      draftPoints = []
      draftHandles = []
      hoverPoint = null
    })

    return
  }

  if (
    tool === 'tree-line' ||
    tool === 'bush-line'
  ) {
    if (draftPoints.length < 2) {
      showToast('Для линии нужно минимум две точки', 'error')
      return
    }

    if (lineIntersectsRoad(draftPoints, 0.15)) {
      showToast('Линия пересекает дорогу', 'error')
      return
    }

    const kind = currentKind()
    const scale = currentScale(kind)
    const points = [...draftPoints]

    commitMutation(() => {
      map.vegetationLines.push({
        id: uniqueId(`${kind}-line`),
        kind,
        model: currentModel(kind),
        points,
        spacing:
          kind === 'tree'
            ? settings.treeSpacing
            : settings.bushSpacing,
        scaleMin: scale * 0.9,
        scaleMax: scale * 1.1,
        seed: Math.floor(Math.random() * 1_000_000),
      })

      draftPoints = []
      draftHandles = []
      hoverPoint = null
    })

    return
  }

  if (
    tool === 'tree-area' ||
    tool === 'bush-area'
  ) {
    if (draftPoints.length < 3) {
      showToast('Для области нужно минимум три точки', 'error')
      return
    }

    if (polygonIntersectsRoad(draftPoints, 0.15)) {
      showToast('Область пересекает дорогу', 'error')
      return
    }

    const kind = currentKind()
    const scale = currentScale(kind)
    const points = [...draftPoints]

    commitMutation(() => {
      map.vegetationAreas.push({
        id: uniqueId(`${kind}-area`),
        kind,
        model: currentModel(kind),
        points,
        count:
          kind === 'tree'
            ? settings.treeCount
            : settings.bushCount,
        minDistance:
          kind === 'tree'
            ? settings.treeMinDistance
            : settings.bushMinDistance,
        scaleMin: scale * 0.9,
        scaleMax: scale * 1.1,
        seed: Math.floor(Math.random() * 1_000_000),
      })

      draftPoints = []
      draftHandles = []
      hoverPoint = null
    })
  }
}

function updateSelectedPoint(
  index: number,
  point: LandscapePoint
): void {
  if (!selection) {
    return
  }

  const selected = selection

  if (selected.kind === 'surface') {
    const item = map.surfaces.find(
      (entry) => entry.id === selected.id
    )

    if (item?.points[index]) {
      const previous = item.points[index]
      const dx = point[0] - previous[0]
      const dz = point[1] - previous[1]
      item.points[index] = point
      for (const handle of [item.handles[index]?.incoming, item.handles[index]?.outgoing]) {
        if (handle) {
          handle[0] += dx
          handle[1] += dz
        }
      }
    }

    return
  }

  if (selected.kind === 'path') {
    const item = map.paths.find(
      (entry) => entry.id === selected.id
    )

    if (item?.points[index]) {
      const next = pathPoint(point, item.width).point
      const previous = item.points[index]
      const dx = next[0] - previous[0]
      const dz = next[1] - previous[1]
      item.points[index] = next
      for (const handle of [item.handles[index]?.incoming, item.handles[index]?.outgoing]) {
        if (handle) {
          handle[0] += dx
          handle[1] += dz
        }
      }
    }

    return
  }

  if (selected.kind === 'vegetation') {
    const item = map.vegetation.find(
      (entry) => entry.id === selected.id
    )

    if (item) {
      item.position = point
    }

    return
  }

  if (selected.kind === 'object') {
    const item = map.objects.find(
      (entry) => entry.id === selected.id
    )

    if (item) {
      item.position = point
    }

    return
  }

  if (selected.kind === 'vegetation-line') {
    const item = map.vegetationLines.find(
      (entry) => entry.id === selected.id
    )

    if (item?.points[index]) {
      item.points[index] = point
    }

    return
  }

  const item = map.vegetationAreas.find(
    (entry) => entry.id === selected.id
  )

  if (item?.points[index]) {
    item.points[index] = point
  }
}

function updateSelectedBezierHandle(
  index: number,
  side: 'incoming' | 'outgoing',
  point: LandscapePoint,
  breakPair: boolean
): void {
  const item = selectedItem()
  if (!item || !('handles' in item) || !item.handles[index]) return

  item.handles[index][side] = point

  if (!breakPair) {
    const opposite = side === 'incoming' ? 'outgoing' : 'incoming'
    const anchor = item.points[index]
    item.handles[index][opposite] = [
      anchor[0] * 2 - point[0],
      anchor[1] * 2 - point[1],
    ]
  }
}

function translateSelected(
  deltaX: number,
  deltaZ: number
): void {
  const items = selections()
    .map(itemForSelection)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const points = items.flatMap((item) =>
    'position' in item ? [item.position] : item.points
  )
  if (points.length === 0) return

  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const safeDeltaX = Math.max(
    -MAP_HALF_WIDTH - Math.min(...xs),
    Math.min(
      MAP_HALF_WIDTH - Math.max(...xs),
      deltaX
    )
  )
  const safeDeltaZ = Math.max(
    -MAP_HALF_DEPTH - Math.min(...zs),
    Math.min(
      MAP_HALF_DEPTH - Math.max(...zs),
      deltaZ
    )
  )

  for (const point of points) {
    point[0] += safeDeltaX
    point[1] += safeDeltaZ
  }

  for (const item of items) {
    if ('handles' in item) {
      for (const handles of item.handles) {
        for (const handle of [handles.incoming, handles.outgoing]) {
          if (handle) {
            handle[0] += safeDeltaX
            handle[1] += safeDeltaZ
          }
        }
      }
    }
  }
}

function selectionGeometryIsValid(selected: Selection): boolean {
  const points = pointsForSelection(selected)

  if (selected.kind === 'vegetation' || selected.kind === 'object') {
    return !pointOnRoad(points[0])
  }

  if (selected.kind === 'surface') {
    const surface = itemForSelection(selected) as LandscapeSurface | null
    return !polygonIntersectsRoad(
      surface
        ? sampleBezierGeometry(surface.points, surface.handles, true)
        : points,
      0.08
    )
  }

  if (selected.kind === 'vegetation-area') {
    return !polygonIntersectsRoad(points, 0.15)
  }

  if (selected.kind === 'path') {
    const path = itemForSelection(selected) as LandscapePath | null

    return !lineIntersectsRoad(
      path
        ? sampleBezierGeometry(path.points, path.handles, false)
        : points,
      (path?.width ?? 0) / 2 + 0.08
    )
  }

  return !lineIntersectsRoad(points, 0.15)
}

function selectedGeometryIsValid(): boolean {
  return selections().every(selectionGeometryIsValid)
}

function deleteSelected(): void {
  if (!selection) {
    return
  }

  const selectedKeys = new Set(
    selections().map((item) => `${item.kind}:${item.id}`)
  )

  commitMutation(() => {
    const keep = (kind: SelectionKind, id: string) =>
      !selectedKeys.has(`${kind}:${id}`)

    map.surfaces = map.surfaces.filter((item) => keep('surface', item.id))
    map.paths = map.paths.filter((item) => keep('path', item.id))
    map.vegetation = map.vegetation.filter((item) => keep('vegetation', item.id))
    map.objects = map.objects.filter((item) => keep('object', item.id))
    map.vegetationLines = map.vegetationLines.filter((item) => keep('vegetation-line', item.id))
    map.vegetationAreas = map.vegetationAreas.filter((item) => keep('vegetation-area', item.id))
    clearSelection()
  })
}

function duplicateSelected(): void {
  if (!selection) {
    return
  }

  const current = selection

  if (current.kind === 'surface') {
    const sourceIndex = map.surfaces.findIndex(
      (item) => item.id === current.id
    )
    const source = map.surfaces[sourceIndex]

    if (!source) return

    commitMutation(() => {
      const copy = structuredClone(source)
      const xs = copy.points.map(([x]) => x)
      const zs = copy.points.map(([, z]) => z)
      const duplicateOffset = (
        values: number[],
        minimum: number,
        maximum: number
      ): number => {
        const roomAfter = maximum - Math.max(...values)
        const roomBefore = Math.min(...values) - minimum

        if (roomAfter >= 0.5) return 0.5
        if (roomBefore >= 0.5) return -0.5

        return roomAfter >= roomBefore ? roomAfter : -roomBefore
      }
      const offsetX = duplicateOffset(
        xs,
        -MAP_HALF_WIDTH,
        MAP_HALF_WIDTH
      )
      const offsetZ = duplicateOffset(
        zs,
        -MAP_HALF_DEPTH,
        MAP_HALF_DEPTH
      )

      copy.id = uniqueId('surface')
      copy.name = `${source.name} — копия`

      for (const point of copy.points) {
        point[0] += offsetX
        point[1] += offsetZ
      }

      for (const handles of copy.handles) {
        for (const handle of [handles.incoming, handles.outgoing]) {
          if (handle) {
            handle[0] += offsetX
            handle[1] += offsetZ
          }
        }
      }

      map.surfaces.splice(sourceIndex + 1, 0, copy)
      setSelections([{ kind: 'surface', id: copy.id }])
    })

    showToast('Зона скопирована')
    return
  }

  if (current.kind !== 'object') {
    return
  }

  const source = map.objects.find((item) => item.id === current.id)
  if (!source) return

  commitMutation(() => {
    const copy: SceneObject = {
      ...structuredClone(source),
      id: uniqueId('object'),
      name: source.name,
      position: [
        Math.min(MAP_HALF_WIDTH, source.position[0] + 0.5),
        Math.min(MAP_HALF_DEPTH, source.position[1] + 0.5),
      ],
    }

    map.objects.push(copy)
    setSelections([{ kind: 'object', id: copy.id }])
  })

  showToast('Объект скопирован')
}

async function saveToProject(): Promise<boolean> {
  setStatus('Сохраняю карту…')

  try {
    const response =
      await fetch('/__landscape/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(map),
      })

    const result =
      await response.json() as {
        ok?: boolean
        error?: string
      }

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ?? 'Сервер не сохранил карту'
      )
    }

    dirty = false
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    publishSavedMap(map, 'landscape')
    setStatus('Карта сохранена в проект', 'success')
    showToast('Карта сохранена. Можно открыть 3D-предпросмотр.')
    return true
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось сохранить карту'

    setStatus(message, 'error')
    showToast(
      'Автосохранение недоступно. Скачайте JSON вручную.',
      'error'
    )
    return false
  }
}

function downloadMap(): void {
  const blob =
    new Blob(
      [`${JSON.stringify(map, null, 2)}\n`],
      {
        type: 'application/json',
      }
    )

  const url =
    URL.createObjectURL(blob)

  const link =
    document.createElement('a')

  link.href = url
  link.download = 'landscape-map.json'
  link.click()

  URL.revokeObjectURL(url)
}

async function importMap(
  file: File
): Promise<void> {
  try {
    const imported =
      parseLandscapeMap(
        JSON.parse(await file.text()) as unknown
      )

    const before = serializeMap()

    commitMutation(() => {
      map = cloneLandscapeMap(imported)
      clearSelection()
      draftPoints = []
      draftHandles = []
    }, before)

    showToast('Карта импортирована')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Не удалось прочитать JSON',
      'error'
    )
  } finally {
    importInput.value = ''
  }
}

async function loadInitialMap(): Promise<void> {
  const draftValue = localStorage.getItem(DRAFT_STORAGE_KEY)
  const latest = latestSavedMap()
  let draft: { map: LandscapeMap; savedAt: number } | null = null

  if (draftValue) {
    try {
      const parsed = JSON.parse(draftValue) as {
        map?: unknown
        savedAt?: number
      }
      draft = {
        map: parseLandscapeMap(parsed.map),
        savedAt: parsed.savedAt ?? 0,
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  }

  try {
    const response =
      await fetch('/landscape-map.json', {
        cache: 'no-store',
      })

    if (!response.ok) {
      throw new Error(`Ошибка ${response.status}`)
    }

    const projectMap = parseLandscapeMap(await response.json())
    const projectSavedAt = Math.max(
      Date.parse(response.headers.get('last-modified') ?? '') || 0,
      latest?.savedAt ?? 0
    )

    if (draft && draft.savedAt > projectSavedAt) {
      map = draft.map
      lastLocalChangeAt = draft.savedAt
      dirty = true
      setStatus('Восстановлен несохранённый черновик')
    } else {
      map = projectMap
      dirty = false
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      setStatus('Карта загружена', 'success')
    }

  } catch (error) {
    if (draft) {
      map = draft.map
      lastLocalChangeAt = draft.savedAt
      dirty = true
      setStatus('Проект недоступен — восстановлен локальный черновик', 'error')
    } else {
      map = createEmptyLandscapeMap()
      setStatus(
        error instanceof Error
          ? `Создана пустая карта: ${error.message}`
          : 'Создана пустая карта',
        'error'
      )
    }
  }

  render()
}

document
  .querySelectorAll<HTMLButtonElement>('[data-tool]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      setTool(button.dataset.tool as Tool)
    })
  })

svg.addEventListener('click', (event) => {
  if (ignoreNextClick) {
    ignoreNextClick = false
    return
  }

  if (tool === 'select') {
    selectFromTarget(event.target, event.shiftKey)
    return
  }

  if (event.detail > 1) {
    return
  }

  const rawPoint = svgToWorld(event)
  const point = drawingPoint(event)

  if (tool === 'tree') {
    addVegetationPoint(point, 'tree')
    return
  }

  if (tool === 'bush') {
    addVegetationPoint(point, 'bush')
    return
  }

  if (tool === 'object') {
    addSceneObject(point)
    return
  }

  if (
    tool === 'surface' &&
    draftPoints.length >= 3 &&
    Math.hypot(
      point[0] - draftPoints[0][0],
      point[1] - draftPoints[0][1]
    ) * PIXELS_PER_UNIT * currentZoom() <= 12
  ) {
    completeDraft()
    return
  }

  if (
    tool === 'path' &&
    (
      rawPoint[0] !== point[0] ||
      rawPoint[1] !== point[1]
    )
  ) {
    showToast(
      'Точка дорожки привязана к бордюру. Асфальт остаётся без изменений.'
    )
  }

  draftPoints.push(point)
  draftHandles.push({ incoming: null, outgoing: null })
  hoverPoint = point
  render()
})

svg.addEventListener('dblclick', (event) => {
  if (tool === 'select') {
    return
  }

  event.preventDefault()
  completeDraft()
})

svg.addEventListener('pointerdown', (event) => {
  if (
    event.button === 1 ||
    (event.button === 0 && spacePressed)
  ) {
    startPan(event)
    return
  }

  if (
    event.button === 0 &&
    (tool === 'surface' || tool === 'path')
  ) {
    const anchor = drawingPoint(event)
    penGesture = { anchor, current: anchor, moved: false }
    return
  }

  if (
    event.button !== 0 ||
    tool !== 'select' ||
    !(event.target instanceof SVGElement)
  ) {
    return
  }

  const rawIndex =
    event.target.dataset.handleIndex

  const bezierIndex = event.target.dataset.bezierIndex
  const bezierSide = event.target.dataset.bezierSide as
    | 'incoming'
    | 'outgoing'
    | undefined

  if (bezierIndex !== undefined && bezierSide) {
    dragState = {
      mode: 'bezier',
      before: serializeMap(),
      index: Number(bezierIndex),
      handle: bezierSide,
      lastPoint: svgToWorld(event),
      moved: false,
    }
    event.preventDefault()
    return
  }

  if (rawIndex !== undefined) {
    dragState = {
      mode: 'point',
      before: serializeMap(),
      index: Number(rawIndex),
      lastPoint: svgToWorld(event),
      moved: false,
    }

    event.preventDefault()
    return
  }

  const selectable =
    event.target.closest<SVGElement>(
      '[data-selection-kind]'
    )

  if (!selectable) {
    const point = svgToWorld(event)
    marqueeState = {
      start: point,
      current: point,
      moved: false,
      additive: event.shiftKey,
      initialSelections: event.shiftKey ? selections() : [],
    }
    event.preventDefault()
    return
  }

  const clicked: Selection = {
    kind:
      selectable.dataset.selectionKind as SelectionKind,
    id: selectable.dataset.id ?? '',
  }

  if (event.shiftKey) {
    const current = selections()
    if (current.some((item) => sameSelection(item, clicked))) {
      setSelections(current.filter((item) => !sameSelection(item, clicked)))
      suppressNextMapClick()
      render()
      return
    }
    setSelections([...current, clicked])
  } else if (!isSelected(clicked.kind, clicked.id)) {
    setSelections([clicked])
  }

  dragState = {
    mode: 'object',
    before: serializeMap(),
    lastPoint: svgToWorld(event),
    moved: false,
  }

  event.preventDefault()
  render()
})

document.addEventListener('pointermove', (event) => {
  if (panState) {
    const rect = svg.getBoundingClientRect()
    const deltaX =
      event.clientX - panState.clientX
    const deltaY =
      event.clientY - panState.clientY

    panState.moved = panState.moved || Math.hypot(deltaX, deltaY) > 3

    viewport.x =
      panState.viewport.x -
      deltaX * panState.viewport.width / rect.width
    viewport.y =
      panState.viewport.y -
      deltaY * panState.viewport.height / rect.height
    applyViewport()
    return
  }

  if (penGesture) {
    let current = svgToWorld(event)

    if (event.shiftKey) {
      const dx = current[0] - penGesture.anchor[0]
      const dz = current[1] - penGesture.anchor[1]
      const length = Math.hypot(dx, dz)
      const angle = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4)
      current = [
        penGesture.anchor[0] + Math.cos(angle) * length,
        penGesture.anchor[1] + Math.sin(angle) * length,
      ]
    }

    penGesture.current = current
    penGesture.moved =
      Math.hypot(
        current[0] - penGesture.anchor[0],
        current[1] - penGesture.anchor[1]
      ) * PIXELS_PER_UNIT * currentZoom() > 4
    hoverPoint = penGesture.anchor
    scheduleMapRender()
    return
  }

  if (marqueeState) {
    marqueeState.current = svgToWorld(event)
    marqueeState.moved = marqueeState.moved ||
      Math.hypot(
        marqueeState.current[0] - marqueeState.start[0],
        marqueeState.current[1] - marqueeState.start[1]
      ) * PIXELS_PER_UNIT * currentZoom() > 4

    const inside = marqueeState.moved
      ? selectionsInMarquee(marqueeState.start, marqueeState.current)
      : []
    setSelections(
      marqueeState.additive
        ? [...marqueeState.initialSelections, ...inside]
        : inside
    )
    scheduleMapRender()
    return
  }

  if (!dragState) {
    return
  }

  const point = svgToWorld(event)

  if (
    dragState.mode === 'point' &&
    dragState.index !== undefined
  ) {
    updateSelectedPoint(
      dragState.index,
      point
    )
  } else if (
    dragState.mode === 'bezier' &&
    dragState.index !== undefined &&
    dragState.handle
  ) {
    updateSelectedBezierHandle(
      dragState.index,
      dragState.handle,
      point,
      event.altKey
    )
  } else {
    translateSelected(
      point[0] - dragState.lastPoint[0],
      point[1] - dragState.lastPoint[1]
    )
  }

  dragState.lastPoint = point
  dragState.moved = true
  scheduleMapRender()
})

document.addEventListener('pointerup', (event) => {
  if (penGesture) {
    const gesture = penGesture
    penGesture = null

    if (gesture.moved) {
      const incoming: LandscapePoint = [
        gesture.anchor[0] * 2 - gesture.current[0],
        gesture.anchor[1] * 2 - gesture.current[1],
      ]

      draftPoints.push(gesture.anchor)
      draftHandles.push({
        incoming: event.altKey ? null : incoming,
        outgoing: gesture.current,
      })
      hoverPoint = gesture.anchor
      suppressNextMapClick()
      render()
    }
  }

  if (panState) {
    if (panState.moved) suppressNextMapClick()
    panState = null
    svg.classList.remove('is-panning')
  }

  if (marqueeState) {
    const finished = marqueeState
    marqueeState = null
    if (finished.moved) suppressNextMapClick()
    render()
  }

  if (!dragState) {
    return
  }

  const finished = dragState
  dragState = null

  suppressNextMapClick()

  if (!finished.moved) {
    return
  }

  if (!selectedGeometryIsValid()) {
    restoreSnapshot(finished.before)
    showToast('Объект нельзя переместить на дорогу', 'error')
    render()
    return
  }

  history.record(finished.before)
  markDirty()
  render()
})

svg.addEventListener('pointermove', (event) => {
  if (
    panState ||
    dragState ||
    tool === 'select'
  ) {
    return
  }

  hoverPoint = drawingPoint(event)
  scheduleMapRender()
})

svg.addEventListener('pointerleave', () => {
  if (
    !panState &&
    !dragState &&
    hoverPoint
  ) {
    hoverPoint = null
    renderMap()
  }
})

svg.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    zoomViewport(
      event.deltaY < 0 ? 1.18 : 1 / 1.18,
      event.clientX,
      event.clientY
    )
  },
  { passive: false }
)

document.addEventListener('keydown', (event) => {
  const target = event.target

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement
  ) {
    return
  }

  if (event.code === 'Space') {
    spacePressed = true
    svg.classList.add('is-pan-ready')
    event.preventDefault()
    return
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'd' &&
    additionalSelections.length === 0 &&
    (selection?.kind === 'object' || selection?.kind === 'surface')
  ) {
    event.preventDefault()
    duplicateSelected()
    return
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'z'
  ) {
    event.preventDefault()

    if (event.shiftKey) {
      redo()
    } else {
      undo()
    }

    return
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'y'
  ) {
    event.preventDefault()
    redo()
    return
  }

  if (event.key === 'Enter') {
    completeDraft()
    return
  }

  if (event.key === 'Escape') {
    draftPoints = []
    draftHandles = []
    hoverPoint = null
    clearSelection()
    render()
    return
  }

  if (
    event.key === 'Backspace' &&
    draftPoints.length > 0
  ) {
    event.preventDefault()
    removeLastDraftPoint()
    return
  }

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    selection
  ) {
    event.preventDefault()
    deleteSelected()
  }
})

document.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') {
    return
  }

  spacePressed = false
  svg.classList.remove('is-pan-ready')
})

window.addEventListener('blur', () => {
  spacePressed = false
  panState = null
  marqueeState = null
  svg.classList.remove('is-pan-ready', 'is-panning')
})

elementById<HTMLButtonElement>('undo-button')
  .addEventListener('click', undo)

elementById<HTMLButtonElement>('redo-button')
  .addEventListener('click', redo)

elementById<HTMLButtonElement>('zoom-out-button')
  .addEventListener('click', () => {
    zoomViewport(1 / 1.35)
  })

elementById<HTMLButtonElement>('fit-view-button')
  .addEventListener('click', fitViewport)

elementById<HTMLButtonElement>('zoom-in-button')
  .addEventListener('click', () => {
    zoomViewport(1.35)
  })

seamPreview.addEventListener('change', renderMap)

elementById<HTMLButtonElement>('finish-draft-button')
  .addEventListener('click', completeDraft)

elementById<HTMLButtonElement>('cancel-draft-button')
  .addEventListener('click', cancelDraft)

elementById<HTMLButtonElement>('remove-draft-point-button')
  .addEventListener('click', removeLastDraftPoint)

elementById<HTMLButtonElement>('save-button')
  .addEventListener('click', () => {
    void saveToProject()
  })

elementById<HTMLButtonElement>('export-button')
  .addEventListener('click', downloadMap)

elementById<HTMLButtonElement>('import-button')
  .addEventListener('click', () => {
    importInput.click()
  })

importInput.addEventListener('change', () => {
  const file = importInput.files?.[0]

  if (file) {
    void importMap(file)
  }
})

elementById<HTMLButtonElement>('preview-button')
  .addEventListener('click', () => {
    const preview = window.open('about:blank', '_blank')
    if (!preview) {
      showToast('Браузер заблокировал окно 3D-предпросмотра', 'error')
      return
    }
    preview.opener = null

    void (async () => {
      if (dirty && !await saveToProject()) {
        preview.close()
        return
      }
      preview.location.href = '/editors/scene/'
    })()
  })

elementById<HTMLButtonElement>('clear-button')
  .addEventListener('click', () => {
    if (
      !window.confirm(
        'Удалить все зоны, дорожки, растения и статичные объекты? Действие можно отменить кнопкой «Назад».'
      )
    ) {
      return
    }

    commitMutation(() => {
      map = createEmptyLandscapeMap()
      clearSelection()
      draftPoints = []
      draftHandles = []
    })
  })

window.addEventListener('beforeunload', (event) => {
  if (!dirty) {
    return
  }

  event.preventDefault()
})

render()
void loadInitialMap().then(() => {
  subscribeSavedMap((message) => {
    if (dirty) {
      setStatus('В другой вкладке сохранена новая карта', 'error')
      showToast('Карта не объединена автоматически: сначала сохраните или отмените текущие изменения.', 'error')
      return
    }

    map = cloneLandscapeMap(message.map)
    clearSelection()
    draftPoints = []
    draftHandles = []
    history.clear()
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setStatus(
      message.source === '3d'
        ? 'Изменения из 3D-редактора загружены'
        : 'Карта обновлена из другой вкладки',
      'success'
    )
    render()
  })
})
