import * as THREE from 'three'

import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop'
import { createLandscapeSegment } from './landscape-segment'
import { groundHeightForPoint } from './landscape-surfaces'
import {
  parseLandscapeMap,
  type LandscapeMap,
  type VegetationPoint,
} from './landscape-schema'
import {
  type VegetationHit,
  type VegetationInstanceBinding,
} from './landscape-vegetation'
import {
  configureInstanceBoundsProxy,
  prepareStaticInstance,
  type StaticInstanceTemplate,
} from '../models/static-instancing'
import { resolveModelPath, resolveVegetation, type ResolvedVegetation } from './vegetation-layout'
import { disposeObjectResources } from '../models/resource-lifecycle'

export type PreparedLandscape = {
  map: LandscapeMap
  root: THREE.Group
  segments: Map<number, THREE.Group>
  vegetationTemplates: Map<string, StaticInstanceTemplate>
  resolvedVegetation: ResolvedVegetation[]
}

export class Landscape {
  private readonly world: THREE.Group
  private root: THREE.Group | null = null
  private readonly segmentCache = new Map<number, THREE.Group>()
  private currentMap: LandscapeMap | null = null

  private readonly editableMeshCache: THREE.Mesh[] = []
  private readonly vegetationRoots = new Map<string, THREE.Object3D[]>()
  private vegetationByObject = new WeakMap<THREE.Object3D, { id: string; root: THREE.Object3D }>()
  private vegetationByInstance = new WeakMap<THREE.InstancedMesh, VegetationHit[]>()
  private readonly vegetationInstances = new Map<string, VegetationInstanceBinding[]>()
  private vegetationTemplates = new Map<string, StaticInstanceTemplate>()
  private resolvedVegetationCache = new Map<string, ReturnType<typeof resolveVegetation>[number]>()

  constructor(world: THREE.Group) {
    this.world = world
  }

  async load(source = '/landscape-map.json'): Promise<THREE.Group> {
    const res = await fetch(source, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return this.loadMap(parseLandscapeMap(await res.json()))
  }

  async loadMap(map: LandscapeMap): Promise<THREE.Group> {
    return this.commitPrepared(await this.prepareMap(map))
  }

  async prepareMap(map: LandscapeMap): Promise<PreparedLandscape> {
    const created = await createLandscapeSegment(map)
    const template = created.segment

    const root = new THREE.Group()
    root.name = 'landscape'
    const segments = new Map<number, THREE.Group>()

    for (let i = 0; i < LOOP_COPIES.length; i++) {
      const cycle = LOOP_COPIES[i]
      const segment = cycle === 0 ? template : template.clone(true)
      segment.name = `landscape:segment@${cycle}`
      segment.position.x = cycle * LOOP_WIDTH
      root.add(segment)
      segments.set(cycle, segment)
    }

    return {
      map,
      root,
      segments,
      vegetationTemplates: created.vegetationTemplates,
      resolvedVegetation: created.resolvedVegetation,
    }
  }

  commitPrepared(prepared: PreparedLandscape): THREE.Group {
    this.dispose()

    this.currentMap = prepared.map
    this.vegetationTemplates = prepared.vegetationTemplates
    this.root = prepared.root
    for (const [cycle, segment] of prepared.segments) this.segmentCache.set(cycle, segment)

    this.resolvedVegetationCache.clear()
    for (let i = 0; i < prepared.resolvedVegetation.length; i++) {
      const item = prepared.resolvedVegetation[i]
      this.resolvedVegetationCache.set(item.id, item)
    }

    this.rebuildVegetationIndex()
    this.world.add(prepared.root)

    return prepared.root
  }

  editableMeshes(): readonly THREE.Mesh[] {
    return this.editableMeshCache
  }

  findVegetation(object: THREE.Object3D, instanceId?: number): VegetationHit | null {
    if (object instanceof THREE.InstancedMesh && instanceId !== undefined) {
      return this.vegetationByInstance.get(object)?.[instanceId] ?? null
    }

    let curr: THREE.Object3D | null = object
    while (curr) {
      const hit = this.vegetationByObject.get(curr)
      if (hit) return hit
      curr = curr.parent
    }
    return null
  }

  updateVegetation(item: VegetationPoint): void {
    const bindings = this.vegetationInstances.get(item.id)

    if (bindings && this.currentMap) {
      const resolved = this.resolvedVegetationCache.get(item.id)
      const path = resolved ? resolveModelPath(resolved) : null
      const template = path ? this.vegetationTemplates.get(path) : null

      if (resolved && template) {
        const posY = groundHeightForPoint(this.currentMap, item.position)
        const prepared = prepareStaticInstance(template, {
          position: [item.position[0], posY, item.position[1]],
          scale: item.scale,
          rotationY: item.rotation,
        })

        for (let i = 0; i < bindings.length; i++) {
          const b = bindings[i]
          const m = prepared.matrices[b.partIndex]
          if (m) {
            b.mesh.setMatrixAt(b.instanceId, m)
            b.mesh.instanceMatrix.needsUpdate = true
          }
        }

        const roots = this.vegetationRoots.get(item.id)
        if (roots) {
          for (let i = 0; i < roots.length; i++) {
            const r = roots[i]
            r.position.set(item.position[0], posY, item.position[1])
            const proxy = r.children.find((c) => c.userData.vegetationBoundsProxy === true)
            if (proxy instanceof THREE.Mesh) configureInstanceBoundsProxy(r, proxy, prepared.bounds)
          }
        }
        return
      }
    }

    const y = this.currentMap ? groundHeightForPoint(this.currentMap, item.position) : 0.002
    const roots = this.vegetationRoots.get(item.id)
    if (roots) {
      const rad = THREE.MathUtils.degToRad(item.rotation)
      for (let i = 0; i < roots.length; i++) {
        const r = roots[i]
        r.position.set(item.position[0], y, item.position[1])
        const model = r.children[0]
        if (model) {
          model.scale.setScalar(item.scale)
          model.rotation.y = rad
        }
      }
    }
  }

  vegetationRoot(id: string, cycle = 0): THREE.Object3D | null {
    const segment = this.segmentCache.get(cycle) ?? this.root?.getObjectByName(`landscape:segment@${cycle}`) ?? null
    return segment?.getObjectByName(`landscape:tree:${id}`) ?? segment?.getObjectByName(`landscape:bush:${id}`) ?? null
  }

  dispose(): void {
    if (!this.root) return

    disposeObjectResources([this.root])

    this.root.parent?.remove(this.root)
    this.root = null
    this.currentMap = null
    this.segmentCache.clear()
    this.editableMeshCache.length = 0
    this.vegetationRoots.clear()
    this.vegetationByObject = new WeakMap()
    this.vegetationByInstance = new WeakMap()
    this.vegetationInstances.clear()
    this.vegetationTemplates.clear()
    this.resolvedVegetationCache.clear()
  }

  private rebuildVegetationIndex(): void {
    this.editableMeshCache.length = 0
    this.vegetationRoots.clear()
    this.vegetationByObject = new WeakMap()
    this.vegetationByInstance = new WeakMap()
    this.vegetationInstances.clear()

    if (!this.root) return

    for (let s = 0; s < this.root.children.length; s++) {
      const segment = this.root.children[s]
      const segmentRoots = new Map<string, THREE.Object3D>()
      const instancedList: THREE.InstancedMesh[] = []

      segment.traverse((obj) => {
        const n = obj.name
        if (n.startsWith('landscape:tree:') || n.startsWith('landscape:bush:')) {
          const id = n.slice(15)
          const veg = { id, root: obj }
          let roots = this.vegetationRoots.get(id)
          if (!roots) this.vegetationRoots.set(id, (roots = []))
          roots.push(obj)
          segmentRoots.set(id, obj)

          obj.traverse((child) => {
            this.vegetationByObject.set(child, veg)
            if (child instanceof THREE.Mesh) this.editableMeshCache.push(child)
          })
        } else if (obj instanceof THREE.InstancedMesh) {
          instancedList.push(obj)
        }
      })

      for (let m = 0; m < instancedList.length; m++) {
        const mesh = instancedList[m]
        const ids = mesh.userData.vegetationIds
        const partIndex = mesh.userData.vegetationPartIndex

        if (!Array.isArray(ids) || typeof partIndex !== 'number') continue

        const hits: VegetationHit[] = new Array(ids.length)
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]
          if (typeof id !== 'string') continue
          const root = segmentRoots.get(id)
          if (!root) continue

          hits[i] = { id, root }
          let bindings = this.vegetationInstances.get(id)
          if (!bindings) this.vegetationInstances.set(id, (bindings = []))
          bindings.push({ mesh, instanceId: i, partIndex, root })
        }

        this.vegetationByInstance.set(mesh, hits)
        this.editableMeshCache.push(mesh)
      }
    }
  }
}
