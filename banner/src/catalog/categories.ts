import * as THREE from 'three'
import { installObjectHighlight } from '../models/object-highlight'

import type { CategoryConfig } from './categories.config'
import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop'
import type { SceneObject } from './scene-objects'
import { mapWithConcurrency } from '../core/frame-scheduler'
import { loadModel } from '../models/model-loader'
import { scheduleRaycastGeometry } from '../models/raycast-scheduler'
import {
  applyModelTransform,
  centerModelOnGround,
  setupModelShadows,
} from '../models/model-utils'
import {
  configureInstanceBoundsProxy,
  createStaticInstanceTemplate,
  instanceBoundsGeometry,
  instanceBoundsMaterial,
  prepareStaticInstance,
  staticModelSupportsInstancing,
  type StaticInstanceTemplate,
} from '../models/static-instancing'
import { freezeStaticTransforms } from '../core/static-transforms'
import { disposeObjectResources } from '../models/resource-lifecycle'
import { createLanternGlass, createLanternHalo, installInstancedLanternGlow, isLanternGlass, isLanternModel, setInstancedLanternGlow } from '../models/lantern-glow'

const GEOMETRY_OPTIMIZATION_DENYLIST = new Set(['/models/bike-parking-1.glb'])

type InstanceBinding = {
  mesh: THREE.InstancedMesh
  instanceId: number
}

type InstancedCategory = {
  template: StaticInstanceTemplate
  bindings: InstanceBinding[]
  boundsProxy: THREE.Mesh
}

type LoadedCategoryGroup = {
  path: string
  configs: CategoryConfig[]
  template: THREE.Group | null
  error: Error | null
}

export type PreparedCategoryLoad = readonly LoadedCategoryGroup[]

export type Category = {
  id: string
  name: string
  url: string
  root: THREE.Group
  meshes: THREE.Mesh[]
  labelAnchor: THREE.Vector3
  instanced?: InstancedCategory
  isLantern?: boolean
  lanternHalos?: THREE.Mesh[]
  lanternGlass?: { material: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }[]
  setSurfaceHighlight?: (enabled: boolean) => void
  getHighlightMeshes(): readonly THREE.Mesh[]
  getWorldLabelPosition(target?: THREE.Vector3): THREE.Vector3
}

const _defaultColor = new THREE.Color(0xd0d0d0)

const prepInstance = (template: StaticInstanceTemplate, cfg: CategoryConfig) =>
  prepareStaticInstance(template, {
    position: cfg.position,
    scale: cfg.scale,
    rotationY: cfg.rotationY ?? 0,
    groundOffset: 0.03,
  })

export class CategoryManager {
  readonly categories: Category[] = []
  readonly meshes: THREE.Mesh[] = []
  readonly clickableMeshes: THREE.Mesh[] = []
  readonly loadErrors: Error[] = []

  private readonly world: THREE.Group
  private readonly categoryByRoot = new Map<THREE.Object3D, Category>()
  private readonly categoryById = new Map<string, Category>()
  private categoryByInstance = new WeakMap<THREE.InstancedMesh, Category[]>()
  private readonly renderedRoots = new Set<THREE.Object3D>()
  private readonly bounds = new THREE.Box3()

  constructor(world: THREE.Group) {
    this.world = world
  }

  async prepareAll(configs: CategoryConfig[]): Promise<PreparedCategoryLoad> {
    const groups = new Map<string, { path: string; configs: CategoryConfig[] }>()

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]
      const cycle = cfg.id.match(/@(-?\d+)$/)?.[1] ?? '0'
      const key = `${cfg.model}#${cycle}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { path: cfg.model, configs: [] }))
      g.configs.push(cfg)
    }

    const sortedGroups = Array.from(groups.values(), (g) => {
      let minDist = Infinity
      for (let i = 0; i < g.configs.length; i++) {
        const d = Math.abs(g.configs[i].position[0])
        if (d < minDist) minDist = d
      }
      return { g, dist: minDist }
    })
      .sort((a, b) => a.dist - b.dist)
      .map((e) => e.g)

    return mapWithConcurrency(
      sortedGroups,
      3,
      async ({ path, configs }): Promise<LoadedCategoryGroup> => {
        try {
          const disableOpt = GEOMETRY_OPTIMIZATION_DENYLIST.has(path)
          const template = await loadModel(path, { disableMerge: disableOpt })

          return { path, configs, template, error: null }
        } catch (error) {
          return {
            path,
            configs,
            template: null,
            error: error instanceof Error ? error : new Error(String(error)),
          }
        }
      }
    )
  }

  commitPrepared(loaded: PreparedCategoryLoad): Category[] {
    return this.commitStaged(this.stagePrepared(loaded))
  }

  stagePrepared(loaded: PreparedCategoryLoad): CategoryManager {
    const errors = loaded
      .filter((group) => !group.template || group.error)
      .map((group) => new Error(`Не удалось загрузить модель "${group.path}"`, { cause: group.error }))

    if (errors.length > 0) {
      throw new AggregateError(errors, `Не удалось загрузить модели: ${errors.length}`)
    }

    const staged = new CategoryManager(new THREE.Group())
    try {
      staged.buildPrepared(loaded)
    } catch (error) {
      staged.dispose()
      throw error
    }
    return staged
  }

  commitStaged(staged: CategoryManager): Category[] {
    this.dispose()
    this.loadErrors.push(...staged.loadErrors)

    for (const root of staged.renderedRoots) {
      this.world.add(root)
      this.renderedRoots.add(root)
    }

    this.categories.push(...staged.categories)
    this.meshes.push(...staged.meshes)
    this.clickableMeshes.push(...staged.clickableMeshes)
    for (const [root, category] of staged.categoryByRoot) this.categoryByRoot.set(root, category)
    for (const [id, category] of staged.categoryById) this.categoryById.set(id, category)
    this.categoryByInstance = staged.categoryByInstance

    return this.categories
  }

  private buildPrepared(loaded: PreparedCategoryLoad): void {
    this.loadErrors.length = 0

    for (let i = 0; i < loaded.length; i++) {
      const group = loaded[i]
      if (!group.template || group.error) {
        throw new Error(`Неподготовленная модель "${group.path}"`, { cause: group.error })
      }

      const template = group.template
      const disableOpt = GEOMETRY_OPTIMIZATION_DENYLIST.has(group.path)
      const prepared = group.configs.length > 1 && !disableOpt && staticModelSupportsInstancing(template)
        ? this.prepareInstancedGroup(template, group.configs, group.path)
        : group.configs.map((cfg) => this.prepareFallback(template.clone(true), cfg))
      if (prepared.length === 0) throw new Error(`Модель "${group.path}" не создала объектов`)
    }
  }

  async loadAll(configs: CategoryConfig[]): Promise<Category[]> {
    return this.commitPrepared(await this.prepareAll(configs))
  }

  findCategory(object: THREE.Object3D, instanceId?: number): Category | null {
    if (object instanceof THREE.InstancedMesh && instanceId !== undefined) {
      const category = this.categoryByInstance.get(object)?.[instanceId]
      if (category) return category
    }

    // GLTF models can contain their own instances inside a category root.
    let curr: THREE.Object3D | null = object
    while (curr) {
      const cat = this.categoryByRoot.get(curr)
      if (cat) return cat
      curr = curr.parent
    }
    return null
  }

  baseId(category: Category): string {
    return category.id.replace(/@-?\d+$/, '')
  }

  updateSceneObject(item: SceneObject): void {
    for (let i = 0; i < LOOP_COPIES.length; i++) {
      const cycle = LOOP_COPIES[i]
      const category = this.categoryById.get(`${item.id}@${cycle}`)
      if (!category) continue

      const cfg: CategoryConfig = {
        id: category.id,
        categoryKey: item.categoryKey ?? 'scene-object',
        name: item.name,
        model: item.model,
        url: item.url ?? '',
        position: [item.position[0] + cycle * LOOP_WIDTH, item.elevation, item.position[1]],
        scale: item.scale,
        rotationY: item.rotation,
      }

      if (category.instanced) {
        this.updateInstancedCategory(category, cfg)
      } else {
        category.root.position.set(...cfg.position)
        const model = category.root.children[0]
        if (model) {
          model.scale.setScalar(item.scale)
          model.rotation.y = THREE.MathUtils.degToRad(item.rotation)
        }
        this.updateLabelAnchor(category)
      }
      this.updateLanternHalos(category)
    }
  }

  setColor(category: Category, colored: boolean): void {
    category.setSurfaceHighlight?.(colored)
    for (const halo of category.lanternHalos ?? []) halo.visible = colored
    if (category.lanternGlass) {
      for (const { material, emissive, intensity } of category.lanternGlass) {
        material.emissive.copy(colored ? new THREE.Color(1, 0.65, 0.28) : emissive)
        material.emissiveIntensity = colored ? 6 : intensity
      }
      return
    }
    if (!category.instanced) return

    for (let i = 0; i < category.instanced.bindings.length; i++) {
      const b = category.instanced.bindings[i]
      if (b.mesh.geometry.hasAttribute('lanternGlow')) {
        setInstancedLanternGlow(b.mesh, b.instanceId, colored)
      }
    }
  }

  freezeStaticTransforms(): void {
    for (const root of this.renderedRoots) freezeStaticTransforms(root)
  }

  dispose(): void {
    disposeObjectResources(this.renderedRoots)
    for (const root of this.renderedRoots) {
      this.world.remove(root)
    }

    this.categories.length = 0
    this.meshes.length = 0
    this.clickableMeshes.length = 0
    this.categoryByRoot.clear()
    this.categoryById.clear()
    this.categoryByInstance = new WeakMap()
    this.renderedRoots.clear()
  }

  private prepareInstancedGroup(source: THREE.Group, configs: CategoryConfig[], path: string): Category[] {
    const template = createStaticInstanceTemplate(source)
    const count = configs.length
    const prepared = new Array(count)
    for (let i = 0; i < count; i++) prepared[i] = prepInstance(template, configs[i])

    const instanceMeshes = new Array<THREE.InstancedMesh>(template.meshes.length)
    const surfaceHighlights: ReturnType<typeof installObjectHighlight>[] = []
    for (let pIdx = 0; pIdx < template.meshes.length; pIdx++) {
      const sm = template.meshes[pIdx]
      const mesh = new THREE.InstancedMesh(sm.geometry, sm.material, count)
      if (isLanternModel(path)) installInstancedLanternGlow(mesh)
      surfaceHighlights.push(installObjectHighlight(mesh, true))
      mesh.name = `category-instances:${path}:${pIdx}`
      mesh.castShadow = true
      mesh.receiveShadow = true

      for (let i = 0; i < count; i++) {
        mesh.instanceMatrix.set(prepared[i].matrices[pIdx].elements, i * 16)
        mesh.setColorAt(i, _defaultColor)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()

      this.world.add(mesh)
      this.renderedRoots.add(mesh)
      this.meshes.push(mesh)
      instanceMeshes[pIdx] = mesh
    }

    const categories = new Array<Category>(count)
    for (let i = 0; i < count; i++) {
      const cfg = configs[i]
      const root = new THREE.Group()
      const boundsProxy = new THREE.Mesh(instanceBoundsGeometry, instanceBoundsMaterial)

      root.name = `category:${cfg.id}`
      root.position.set(...cfg.position)
      root.add(boundsProxy)
      configureInstanceBoundsProxy(root, boundsProxy, prepared[i].bounds)

      this.world.add(root)
      this.renderedRoots.add(root)

      const bindings = new Array<InstanceBinding>(instanceMeshes.length)
      for (let mIdx = 0; mIdx < instanceMeshes.length; mIdx++) {
        bindings[mIdx] = { mesh: instanceMeshes[mIdx], instanceId: i }
      }

      const cat: Category = {
        id: cfg.id,
        name: cfg.name,
        url: cfg.url,
        root,
        meshes: instanceMeshes,
        labelAnchor: new THREE.Vector3(),
        instanced: { template, boundsProxy, bindings },
        isLantern: isLanternModel(path),
        setSurfaceHighlight: (enabled) => surfaceHighlights.forEach((set) => set(enabled, i)),
        getHighlightMeshes: () => instanceMeshes,
        getWorldLabelPosition: (target) => {
          const v = target ?? new THREE.Vector3()
          v.copy(cat.labelAnchor).applyMatrix4(root.matrixWorld)
          return v
        },
      }

      this.registerCategory(cat)
      this.updateLabelAnchorFromBounds(cat, prepared[i].bounds)
      this.updateLanternHalos(cat)
      categories[i] = cat
    }

    for (let i = 0; i < instanceMeshes.length; i++) {
      const mesh = instanceMeshes[i]
      this.categoryByInstance.set(mesh, categories)
      if (categories.some((c) => c.url)) {
        this.clickableMeshes.push(mesh)
        scheduleRaycastGeometry(mesh.geometry)
      }
    }

    return categories
  }

  private prepareFallback(root: THREE.Group, config: CategoryConfig): Category {
    const meshes: THREE.Mesh[] = []
    const lanternGlass: NonNullable<Category['lanternGlass']> = []
    const surfaceHighlights: ReturnType<typeof installObjectHighlight>[] = []
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      meshes.push(obj)
      surfaceHighlights.push(installObjectHighlight(obj))
      if (!isLanternModel(config.model)) return
      const cloneGlass = (source: THREE.Material): THREE.Material => {
        if (!isLanternGlass(source)) return source
        const material = createLanternGlass(source)
        lanternGlass.push({ material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity })
        return material
      }
      obj.material = Array.isArray(obj.material) ? obj.material.map(cloneGlass) : cloneGlass(obj.material)
    })

    setupModelShadows(root)
    applyModelTransform(root, { scale: config.scale, rotationY: config.rotationY })
    root.updateMatrixWorld(true)
    centerModelOnGround(root)
    root.position.y += 0.03

    const wrapper = new THREE.Group()
    wrapper.name = `category:${config.id}`
    wrapper.position.set(...config.position)
    wrapper.add(root)

    this.world.add(wrapper)
    this.renderedRoots.add(wrapper)

    const cat: Category = {
      id: config.id,
      name: config.name,
      url: config.url,
      root: wrapper,
      meshes,
      isLantern: isLanternModel(config.model),
      lanternGlass: lanternGlass.length ? lanternGlass : undefined,
      setSurfaceHighlight: (enabled) => surfaceHighlights.forEach((set) => set(enabled)),
      labelAnchor: new THREE.Vector3(),
      getHighlightMeshes: () => meshes,
      getWorldLabelPosition: (target) => {
        const v = target ?? new THREE.Vector3()
        v.copy(cat.labelAnchor).applyMatrix4(wrapper.matrixWorld)
        return v
      },
    }

    this.registerCategory(cat)
    this.meshes.push(...meshes)

    if (cat.url) {
      this.clickableMeshes.push(...meshes)
      for (let i = 0; i < meshes.length; i++) scheduleRaycastGeometry(meshes[i].geometry)
    }

    this.updateLabelAnchor(cat)
    this.updateLanternHalos(cat)
    return cat
  }

  private updateLanternHalos(category: Category): void {
    if (!category.isLantern) return
    category.root.updateWorldMatrix(true, false)
    const inverse = category.root.matrixWorld.clone().invert()
    const volumes: THREE.Box3[] = []
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < category.meshes.length; i++) {
      const mesh = category.meshes[i]
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (!materials.some(isLanternGlass)) continue
      mesh.updateWorldMatrix(true, false)
      matrix.copy(mesh.matrixWorld)
      const binding = category.instanced?.bindings[i]
      if (binding) {
        const instance = new THREE.Matrix4()
        binding.mesh.getMatrixAt(binding.instanceId, instance)
        matrix.multiply(instance)
      }
      matrix.premultiply(inverse)
      mesh.geometry.computeBoundingBox()
      const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix)
      const center = bounds.getCenter(new THREE.Vector3())
      // Some models have nested inner/outer glass shells around the same bulb.
      if (volumes.some((box) => box.getCenter(new THREE.Vector3()).distanceTo(center) < 0.02)) continue
      volumes.push(bounds)
    }
    const halos = category.lanternHalos ??= []
    volumes.forEach((bounds, i) => {
      const halo = halos[i] ?? createLanternHalo()
      if (!halos[i]) {
        halos.push(halo)
        category.root.add(halo)
      }
      bounds.getCenter(halo.position)
      const size = bounds.getSize(new THREE.Vector3())
      halo.scale.setScalar(Math.max(size.x, size.y, size.z) * 3.2)
      halo.updateMatrix()
      halo.updateMatrixWorld(true)
    })
  }

  private registerCategory(category: Category): void {
    this.categories.push(category)
    this.categoryByRoot.set(category.root, category)
    this.categoryById.set(category.id, category)
  }

  private updateInstancedCategory(category: Category, config: CategoryConfig): void {
    const instanced = category.instanced
    if (!instanced) return

    const prepared = prepInstance(instanced.template, config)

    for (let i = 0; i < instanced.bindings.length; i++) {
      const b = instanced.bindings[i]
      const m = prepared.matrices[i]
      if (b && m) {
        b.mesh.setMatrixAt(b.instanceId, m)
        b.mesh.instanceMatrix.needsUpdate = true
        b.mesh.computeBoundingBox()
        b.mesh.computeBoundingSphere()
      }
    }

    category.root.position.set(...config.position)
    configureInstanceBoundsProxy(category.root, instanced.boundsProxy, prepared.bounds)
    this.updateLabelAnchorFromBounds(category, prepared.bounds)
  }

  private updateLabelAnchorFromBounds(category: Category, bounds: THREE.Box3): void {
    const rx = category.root.position.x
    const ry = category.root.position.y
    const rz = category.root.position.z
    category.labelAnchor.set(
      (bounds.min.x + bounds.max.x) * 0.5 - rx,
      bounds.max.y - ry,
      (bounds.min.z + bounds.max.z) * 0.5 - rz
    )
  }

  private updateLabelAnchor(category: Category): void {
    category.root.updateMatrixWorld(true)
    this.bounds.setFromObject(category.root.children[0] ?? category.root)
    category.labelAnchor.set(
      (this.bounds.min.x + this.bounds.max.x) * 0.5,
      this.bounds.max.y,
      (this.bounds.min.z + this.bounds.max.z) * 0.5
    )
    category.root.worldToLocal(category.labelAnchor)
  }
}
