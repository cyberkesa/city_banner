import * as THREE from 'three'
import { mapWithConcurrency } from '../core/frame-scheduler'

import type { LandscapeMap } from './landscape-schema'
import { groundHeightForPoint } from './landscape-surfaces'
import { loadModel } from '../models/model-loader'
import { applyModelTransform, centerModelOnGround, setupModelShadows } from '../models/model-utils'
import {
  configureInstanceBoundsProxy,
  createStaticInstanceTemplate,
  instanceBoundsGeometry,
  instanceBoundsMaterial,
  prepareStaticInstance,
  staticModelSupportsInstancing,
  type StaticInstanceTemplate,
} from '../models/static-instancing'
import { resolveModelPath, type ResolvedVegetation } from './vegetation-layout'
import { yieldToMainThread } from '../core/frame-scheduler'

export type VegetationInstanceBinding = {
  mesh: THREE.InstancedMesh
  instanceId: number
  partIndex: number
  root: THREE.Object3D
}

export type VegetationHit = {
  id: string
  root: THREE.Object3D
}

const VEGETATION_CHUNK_SIZE = 8

async function createVegetationObject(item: ResolvedVegetation, map: LandscapeMap): Promise<THREE.Object3D> {
  const model = await loadModel(resolveModelPath(item))
  setupModelShadows(model, item.kind === 'tree')
  applyModelTransform(model, { scale: item.scale, rotationY: item.rotation })
  model.updateMatrixWorld(true)
  centerModelOnGround(model)

  const holder = new THREE.Group()
  holder.name = `landscape:${item.kind}:${item.id}`
  holder.position.set(item.position[0], groundHeightForPoint(map, item.position), item.position[1])
  holder.add(model)
  return holder
}

function chunkVegetation(items: ResolvedVegetation[]): ResolvedVegetation[][] {
  const chunks = new Map<string, ResolvedVegetation[]>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const chunkX = Math.floor(item.position[0] / VEGETATION_CHUNK_SIZE)
    const chunkZ = Math.floor(item.position[1] / VEGETATION_CHUNK_SIZE)
    const key = `${chunkX}:${chunkZ}`
    let chunk = chunks.get(key)
    if (!chunk) chunks.set(key, (chunk = []))
    chunk.push(item)
  }

  return [...chunks.values()]
}

async function createVegetationChunk(
  path: string,
  items: ResolvedVegetation[],
  template: StaticInstanceTemplate,
  map: LandscapeMap,
): Promise<THREE.Group> {
  const count = items.length
  const prepared = new Array(count)
  const heights = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const item = items[i]
    const y = groundHeightForPoint(map, item.position)
    heights[i] = y
    prepared[i] = prepareStaticInstance(template, {
      position: [item.position[0], y, item.position[1]],
      scale: item.scale,
      rotationY: item.rotation,
    })
  }

  const group = new THREE.Group()
  group.name = `landscape:vegetation-chunk:${path}`
  const itemIds = items.map((item) => item.id)
  const castsShadow = items.some((item) => item.kind === 'tree')

  for (let partIndex = 0; partIndex < template.meshes.length; partIndex++) {
    const sourceMesh = template.meshes[partIndex]
    const mesh = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, count)

    mesh.name = `landscape:vegetation-instance-part:${partIndex}`
    mesh.castShadow = castsShadow
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.userData.vegetationIds = itemIds
    mesh.userData.vegetationModel = path
    mesh.userData.vegetationPartIndex = partIndex

      for (let i = 0; i < count; i++) {
        mesh.instanceMatrix.set(prepared[i].matrices[partIndex].elements, i * 16)
      }
      mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    group.add(mesh)

    if (partIndex + 1 < template.meshes.length) await yieldToMainThread()
  }

  for (let i = 0; i < count; i++) {
    const item = items[i]
    const root = new THREE.Group()
    const boundsProxy = new THREE.Mesh(instanceBoundsGeometry, instanceBoundsMaterial)

    root.name = `landscape:${item.kind}:${item.id}`
    root.position.set(item.position[0], heights[i], item.position[1])
    root.userData.vegetationInstanceProxy = true
    boundsProxy.userData.vegetationBoundsProxy = true
    root.add(boundsProxy)
    configureInstanceBoundsProxy(root, boundsProxy, prepared[i].bounds)
    group.add(root)
  }

  return group
}

export async function createVegetationObjects(
  map: LandscapeMap,
  resolvedItems: ResolvedVegetation[],
): Promise<{
  objects: THREE.Object3D[]
  templates: Map<string, StaticInstanceTemplate>
}> {
  const groups = new Map<string, ResolvedVegetation[]>()

  for (let i = 0; i < resolvedItems.length; i++) {
    const item = resolvedItems[i]
    const path = resolveModelPath(item)
    let group = groups.get(path)
    if (!group) groups.set(path, (group = []))
    group.push(item)
  }

  const templates = new Map<string, StaticInstanceTemplate>()
  const groupedObjects = await mapWithConcurrency(
    [...groups.entries()],
    3,
    async ([path, items]) => {
      const source = await loadModel(path)
      const count = items.length

      if (count < 2 || !staticModelSupportsInstancing(source)) {
        return mapWithConcurrency(items, 2, (item) => createVegetationObject(item, map))
      }

      const template = createStaticInstanceTemplate(source)
      templates.set(path, template)

      return mapWithConcurrency(
        chunkVegetation(items),
        2,
        (chunk) => createVegetationChunk(path, chunk, template, map),
      )
    }
  )

  return {
    objects: groupedObjects.flat(),
    templates,
  }
}
