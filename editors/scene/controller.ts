import * as THREE from 'three'

import type { Category, CategoryManager } from '../shared/banner-api'
import type { Landscape } from '../shared/banner-api'
import {
  parseLandscapeMap,
  type LandscapeMap,
  type VegetationPoint,
} from '../../banner/src/landscape/landscape-schema'
import { publishSavedMap, subscribeSavedMap } from '../shared/map-sync'
import type { SceneObject } from '../../banner/src/catalog/scene-objects'
import { wrapLoop } from '../../banner/src/core/loop'

export type SceneEditorContext = {
  container: HTMLDivElement
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera
  scene: THREE.Scene
  world: THREE.Group
  categoryManager: CategoryManager
  landscape: Landscape
  getSceneMap: () => LandscapeMap | null
  applySceneMap: (map: LandscapeMap) => Promise<void>
  syncDogRunnerToEquipment: () => void
  clearCategoryHover: () => void
}

export type SceneEditorController = {
  readonly active: boolean
  readonly dragging: boolean
  clearSelection: () => void
  handlePointerMove: (event: PointerEvent) => boolean
  handlePointerDown: (event: PointerEvent) => boolean
  handlePointerUp: () => void
}

type EditableSelection =
  | { kind: 'object'; item: SceneObject; root: THREE.Object3D }
  | { kind: 'vegetation'; item: VegetationPoint; root: THREE.Object3D }

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Не найден элемент 3D-редактора: ${selector}`)
  }
  return element
}

export function createSceneEditor(
  context: SceneEditorContext
): SceneEditorController {
  const {
    container,
    renderer,
    camera,
    scene,
    world,
    categoryManager,
    landscape,
    getSceneMap,
    applySceneMap,
    syncDogRunnerToEquipment,
    clearCategoryHover,
  } = context

  const editToggle = requiredElement<HTMLButtonElement>('#edit-3d-toggle')
  const editPanel = requiredElement<HTMLElement>('#edit-3d-panel')
  const editClose = requiredElement<HTMLButtonElement>('#edit-3d-close')
  const editStatus = requiredElement<HTMLSpanElement>('#edit-3d-status')
  const editProperties = requiredElement<HTMLDivElement>('#edit-3d-properties')
  const editSave = requiredElement<HTMLButtonElement>('#edit-3d-save')
  const openLandscapeEditor = requiredElement<HTMLAnchorElement>('#open-landscape-editor')

  let editMode = false
  let editDirty = false
  let editSelection: EditableSelection[] = []
  const dirtyObjectIds = new Set<string>()
  const dirtyVegetationIds = new Set<string>()

  const dragStartPositions = new Map<SceneObject | VegetationPoint, [number, number]>()
  const selectionBoxes: THREE.BoxHelper[] = []
  const editablePickMeshes: THREE.Object3D[] = []
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const editGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const editGroundPoint = new THREE.Vector3()
  const dragStartGround = new THREE.Vector3()

  function preparePointer(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(pointer, camera)
  }

  function pickEditableTarget(event: PointerEvent):
    | { category: Category; vegetation: null }
    | { category: null; vegetation: { item: VegetationPoint; root: THREE.Object3D } }
    | null {
    const sceneMap = getSceneMap()
    if (!sceneMap) return null

    preparePointer(event)
    editablePickMeshes.length = 0
    editablePickMeshes.push(...categoryManager.meshes)
    editablePickMeshes.push(...landscape.editableMeshes())

    for (const hit of raycaster.intersectObjects(editablePickMeshes, false)) {
      const category = categoryManager.findCategory(hit.object, hit.instanceId)
      if (category) return { category, vegetation: null }

      const vegetation = landscape.findVegetation(hit.object, hit.instanceId)
      if (!vegetation) continue

      const item = sceneMap.vegetation.find((entry) => entry.id === vegetation.id)
      if (item) return { category: null, vegetation: { item, root: vegetation.root } }
    }

    return null
  }

  function groundPoint(event: PointerEvent): THREE.Vector3 | null {
    preparePointer(event)
    if (!raycaster.ray.intersectPlane(editGround, editGroundPoint)) return null
    return world.worldToLocal(editGroundPoint)
  }

  function markEditDirty(entries: readonly EditableSelection[] = editSelection): void {
    for (const entry of entries) {
      if (entry.kind === 'object') dirtyObjectIds.add(entry.item.id)
      else dirtyVegetationIds.add(entry.item.id)
    }

    if (!editDirty) {
      editDirty = true
      editSave.disabled = false
    }
    if (editStatus.textContent !== 'Есть несохранённые изменения') {
      editStatus.textContent = 'Есть несохранённые изменения'
    }
  }

  function updateEditPosition(): void {
    const position = document.querySelector<HTMLSpanElement>('#edit-position')
    if (!position) return

    if (editSelection.length === 1) {
      const selected = editSelection[0].item
      position.textContent =
        `X ${selected.position[0].toFixed(2)} · Z ${selected.position[1].toFixed(2)}`
    } else if (editSelection.length > 1) {
      position.textContent = `Выбрано объектов: ${editSelection.length}`
    } else {
      position.textContent = ''
    }
  }

  function selectionBoxAt(index: number): THREE.BoxHelper {
    const existing = selectionBoxes[index]
    if (existing) return existing

    const box = new THREE.BoxHelper(new THREE.Group(), 0x2c8a4b)
    box.material.depthTest = false
    box.renderOrder = 100
    scene.add(box)
    selectionBoxes.push(box)
    return box
  }

  function updateSelectionBoxes(): void {
    editSelection.forEach((entry, index) => {
      const box = selectionBoxAt(index)
      box.position.set(0, 0, 0)
      box.setFromObject(entry.root)
      box.visible = true
    })

    for (let index = editSelection.length; index < selectionBoxes.length; index += 1) {
      selectionBoxes[index].visible = false
    }
  }

  function syncSelection(): void {
    for (const entry of editSelection) {
      if (entry.kind === 'object') categoryManager.updateSceneObject(entry.item)
      else landscape.updateVegetation(entry.item)
    }
    syncDogRunnerToEquipment()
    updateSelectionBoxes()
  }

  function changeSelected(
    property: 'rotation' | 'scale' | 'elevation',
    value: number
  ): void {
    if (editSelection.length === 0 || !Number.isFinite(value)) return

    for (const entry of editSelection) {
      if (property === 'elevation') {
        if (entry.kind === 'object') entry.item.elevation = value
      } else {
        entry.item[property] = value
      }
    }

    syncSelection()
    markEditDirty()
  }

  async function duplicateSelectedIn3D(): Promise<void> {
    const sceneMap = getSceneMap()
    if (!sceneMap || editSelection.length === 0) return

    const sourceEntries = [...editSelection]
    const nextMap = structuredClone(sceneMap)
    const objectCopies: SceneObject[] = []
    const vegetationCopies: VegetationPoint[] = []

    for (const entry of sourceEntries) {
      const base = structuredClone(entry.item) as SceneObject | VegetationPoint
      const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

      if (entry.kind === 'object') {
        const copy: SceneObject = {
          ...(base as SceneObject),
          id: `object-${stamp}`,
          name: entry.item.name,
          position: [entry.item.position[0] + 0.6, entry.item.position[1] + 0.6],
        }
        nextMap.objects.push(copy)
        objectCopies.push(copy)
      } else {
        const copy: VegetationPoint = {
          ...(base as VegetationPoint),
          id: `${entry.item.kind}-${stamp}`,
          position: [entry.item.position[0] + 0.6, entry.item.position[1] + 0.6],
        }
        nextMap.vegetation.push(copy)
        vegetationCopies.push(copy)
      }
    }

    editStatus.textContent = 'Дублирую…'

    try {
      await applySceneMap(nextMap)
    } catch (error) {
      editStatus.textContent = error instanceof Error
        ? `Не удалось дублировать: ${error.message}`
        : 'Не удалось дублировать объект'
      return
    }

    const committedMap = getSceneMap()
    if (!committedMap) return
    const duplicated: EditableSelection[] = []
    for (const copy of objectCopies) {
      const category = categoryManager.categories.find((item) => item.id === `${copy.id}@0`)
      const item = committedMap.objects.find((entry) => entry.id === copy.id)
      if (category && item) duplicated.push({ kind: 'object', item, root: category.root })
    }
    for (const copy of vegetationCopies) {
      const root = landscape.vegetationRoot(copy.id)
      const item = committedMap.vegetation.find((entry) => entry.id === copy.id)
      if (root && item) duplicated.push({ kind: 'vegetation', item, root })
    }

    editSelection = duplicated
    syncSelection()
    markEditDirty(duplicated)
    renderEditProperties()
  }

  function renderEditProperties(): void {
    if (editSelection.length === 0) {
      editProperties.className = 'edit-empty'
      editProperties.textContent =
        'Кликните по объекту, отдельному дереву или кусту. Зажмите Shift/Ctrl/⌘ при клике, чтобы выбрать несколько.'
      return
    }

    editProperties.className = ''
    const primary = editSelection[0]
    const hasObjects = editSelection.some((entry) => entry.kind === 'object')
    const name = editSelection.length === 1
      ? primary.kind === 'object'
        ? primary.item.name
        : primary.item.kind === 'tree' ? 'Дерево' : 'Куст'
      : `Выбрано объектов: ${editSelection.length}`

    editProperties.innerHTML = `
      <strong id="edit-selection-name"></strong>
      <span class="edit-help">Тяните по земле. Q/E поворачивают на 15°, Ctrl/⌘ D дублирует. Esc закрывает режим.</span>
      <label class="edit-field">Поворот, °
        <input id="edit-rotation" type="number" step="1" value="${primary.item.rotation}" />
      </label>
      <div class="edit-button-row">
        <button id="edit-rotate-left" type="button">↶ −15°</button>
        <button id="edit-rotate-right" type="button">↷ +15°</button>
      </div>
      <label class="edit-field">Масштаб
        <input id="edit-scale" type="number" min="0.05" max="10" step="0.05" value="${primary.item.scale}" />
      </label>
      ${hasObjects ? `<label class="edit-field">Высота, м
        <input id="edit-elevation" type="number" min="-5" max="20" step="0.05" value="${primary.kind === 'object' ? primary.item.elevation : 0}" />
      </label>` : ''}
      <button id="edit-duplicate" type="button">Дублировать выбранное</button>
      <span id="edit-position" class="edit-help"></span>
    `
    requiredElement<HTMLElement>('#edit-selection-name').textContent = name

    const bindNumber = (
      id: string,
      property: 'rotation' | 'scale' | 'elevation'
    ) => {
      document.getElementById(id)?.addEventListener('change', (event) => {
        changeSelected(property, Number((event.target as HTMLInputElement).value))
        renderEditProperties()
      })
    }

    bindNumber('edit-rotation', 'rotation')
    bindNumber('edit-scale', 'scale')
    if (hasObjects) bindNumber('edit-elevation', 'elevation')

    document.getElementById('edit-rotate-left')?.addEventListener('click', () => {
      changeSelected('rotation', primary.item.rotation - 15)
      renderEditProperties()
    })
    document.getElementById('edit-rotate-right')?.addEventListener('click', () => {
      changeSelected('rotation', primary.item.rotation + 15)
      renderEditProperties()
    })
    document.getElementById('edit-duplicate')?.addEventListener('click', () => {
      void duplicateSelectedIn3D()
    })

    updateEditPosition()
  }

  function selectionEntriesMatch(
    left: EditableSelection,
    right: EditableSelection
  ): boolean {
    return (
      left.kind === 'object' && right.kind === 'object' && left.item.id === right.item.id
    ) || (
      left.kind === 'vegetation' && right.kind === 'vegetation' && left.item.id === right.item.id
    )
  }

  function clearSelection(): void {
    editSelection = []
    dragStartPositions.clear()
    updateSelectionBoxes()
    editStatus.textContent = 'Выберите объект на сцене'
    renderEditProperties()
  }

  function selectSingle(entry: EditableSelection): void {
    editSelection = [entry]
    updateSelectionBoxes()
    editStatus.textContent = entry.kind === 'object'
      ? entry.item.name
      : entry.item.kind === 'tree' ? 'Дерево' : 'Куст'
    renderEditProperties()
  }

  function addToSelection(entry: EditableSelection): boolean {
    const existingIndex = editSelection.findIndex(
      (item) => selectionEntriesMatch(item, entry)
    )

    if (existingIndex >= 0) editSelection.splice(existingIndex, 1)
    else editSelection.push(entry)

    updateSelectionBoxes()
    editStatus.textContent = editSelection.length > 0
      ? `Выбрано объектов: ${editSelection.length}`
      : 'Выберите объект на сцене'
    renderEditProperties()
    return existingIndex < 0
  }

  function makeObjectEntry(category: Category): EditableSelection | null {
    const item = getSceneMap()?.objects.find(
      (entry) => entry.id === categoryManager.baseId(category)
    ) ?? null
    return item ? { kind: 'object', item, root: category.root } : null
  }

  function setEditMode(enabled: boolean): void {
    editMode = enabled
    editPanel.hidden = !enabled
    editToggle.classList.toggle('active', enabled)
    editToggle.setAttribute('aria-pressed', String(enabled))
    container.classList.toggle('is-editing', enabled)
    clearCategoryHover()
    clearSelection()
  }

  async function saveSceneMap(): Promise<boolean> {
    const sceneMap = getSceneMap()
    if (!sceneMap) return false

    editSave.disabled = true
    editStatus.textContent = 'Сохраняю…'

    try {
      const response = await fetch('/__landscape/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sceneMap),
      })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Не удалось сохранить')
      }

      editDirty = false
      dirtyObjectIds.clear()
      dirtyVegetationIds.clear()
      publishSavedMap(sceneMap, '3d')
      editStatus.textContent = 'Изменения сохранены'
      return true
    } catch (error) {
      editSave.disabled = false
      editStatus.textContent = error instanceof Error
        ? error.message
        : 'Ошибка сохранения'
      return false
    }
  }

  editToggle.addEventListener('click', () => setEditMode(!editMode))
  editClose.addEventListener('click', () => setEditMode(false))
  editSave.addEventListener('click', () => {
    void saveSceneMap()
  })

  openLandscapeEditor.addEventListener('click', (event) => {
    if (!editDirty) return
    event.preventDefault()
    void saveSceneMap().then((saved) => {
      if (saved) window.location.href = openLandscapeEditor.href
    })
  })

  window.addEventListener('keydown', (event) => {
    if (!editMode || event.target instanceof HTMLInputElement) return

    if (event.key === 'Escape') {
      setEditMode(false)
      return
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'd' &&
      editSelection.length > 0
    ) {
      event.preventDefault()
      void duplicateSelectedIn3D()
      return
    }

    const primary = editSelection[0]
    if (primary && ['q', 'e', 'й', 'у'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      const clockwise = ['e', 'у'].includes(event.key.toLowerCase())
      changeSelected('rotation', primary.item.rotation + (clockwise ? 15 : -15))
      renderEditProperties()
    }
  })

  window.addEventListener('beforeunload', (event) => {
    if (!editDirty) return
    event.preventDefault()
  })

  subscribeSavedMap((message) => {
    const sceneMap = getSceneMap()

    if (editDirty) {
      if (message.source === 'landscape' && sceneMap) {
        const merged = parseLandscapeMap(message.map)
        const localObjects = new Map(sceneMap.objects.map((item) => [item.id, item]))
        const localVegetation = new Map(sceneMap.vegetation.map((item) => [item.id, item]))

        merged.objects = merged.objects.map((item) =>
          dirtyObjectIds.has(item.id) ? structuredClone(localObjects.get(item.id) ?? item) : item
        )
        merged.vegetation = merged.vegetation.map((item) =>
          dirtyVegetationIds.has(item.id) ? structuredClone(localVegetation.get(item.id) ?? item) : item
        )

        for (const id of dirtyObjectIds) {
          if (!merged.objects.some((item) => item.id === id)) {
            const local = localObjects.get(id)
            if (local) merged.objects.push(structuredClone(local))
          }
        }
        for (const id of dirtyVegetationIds) {
          if (!merged.vegetation.some((item) => item.id === id)) {
            const local = localVegetation.get(id)
            if (local) merged.vegetation.push(structuredClone(local))
          }
        }

        void applySceneMap(merged).then(() => {
          editStatus.textContent = 'Ландшафт обновлён; локальные правки объектов сохранены'
        }).catch((error) => {
          editStatus.textContent = error instanceof Error ? error.message : 'Не удалось объединить карты'
        })
        return
      }

      editStatus.textContent = 'В редакторе ландшафта сохранена новая карта'
      return
    }

    void applySceneMap(message.map).then(() => {
      editStatus.textContent = message.source === 'landscape'
        ? 'Изменения из редактора ландшафта загружены'
        : 'Карта обновлена'
    }).catch((error) => {
      editStatus.textContent = error instanceof Error ? error.message : 'Не удалось обновить карту'
    })
  })

  return {
    get active() {
      return editMode
    },
    get dragging() {
      return container.classList.contains('is-dragging')
    },
    clearSelection,
    handlePointerMove(event) {
      if (
        !editMode ||
        editSelection.length === 0 ||
        dragStartPositions.size === 0 ||
        !renderer.domElement.hasPointerCapture(event.pointerId)
      ) {
        return false
      }

      const point = groundPoint(event)
      if (!point) return true

      const dx = point.x - dragStartGround.x
      const dz = point.z - dragStartGround.z
      for (const entry of editSelection) {
        const start = dragStartPositions.get(entry.item)
        if (!start) continue
        entry.item.position[0] = wrapLoop(start[0] + dx)
        entry.item.position[1] = start[1] + dz
      }
      syncSelection()
      markEditDirty()
      updateEditPosition()
      container.classList.add('is-dragging')
      return true
    },
    handlePointerDown(event) {
      if (!editMode || event.button !== 0) return false

      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      const target = pickEditableTarget(event)
      const entry = target?.category
        ? makeObjectEntry(target.category)
        : target?.vegetation
          ? {
              kind: 'vegetation' as const,
              item: target.vegetation.item,
              root: target.vegetation.root,
            }
          : null

      if (entry) {
        if (additive) {
          if (!addToSelection(entry)) return true
        } else {
          selectSingle(entry)
        }
      } else if (!additive) {
        clearSelection()
        return true
      } else {
        return true
      }

      const point = groundPoint(event)
      if (!point) return true

      dragStartGround.copy(point)
      dragStartPositions.clear()
      for (const selectedEntry of editSelection) {
        dragStartPositions.set(
          selectedEntry.item,
          [selectedEntry.item.position[0], selectedEntry.item.position[1]]
        )
      }
      renderer.domElement.setPointerCapture(event.pointerId)
      event.preventDefault()
      return true
    },
    handlePointerUp() {
      dragStartPositions.clear()
      container.classList.remove('is-dragging')
    },
  }
}
