import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { yieldToMainThread } from '../core/frame-scheduler'
import { markSharedModelResources } from './resource-lifecycle'
import { resolveModelPath } from './model-path'
import { isLanternGlass, isLanternModel } from './lantern-glow'

const loadingManager = new THREE.LoadingManager()

const loader = new GLTFLoader(loadingManager).setMeshoptDecoder(MeshoptDecoder)

type ModelSource = {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}

export type LoadedModel = {
  model: THREE.Group
  animations: THREE.AnimationClip[]
}

export type LoadModelOptions = {
  disableMerge?: boolean
}

const modelCache = new Map<string, Promise<ModelSource>>()
const staticModelCache = new Map<string, Promise<THREE.Group>>()

const cacheKey = (path: string, options?: LoadModelOptions): string => `${path}#${options?.disableMerge ? 0 : 1}`

function geometrySignature(mesh: THREE.Mesh): string {
  const geom = mesh.geometry
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  let attrs = ''
  for (const k in geom.attributes) {
    const a = geom.attributes[k]
    attrs += `${k}:${a.itemSize}:${a.array.constructor.name};`
  }
  return `${mat.uuid}|${geom.index ? geom.index.array.constructor.name : 0}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${attrs}`
}

const isMergeableMesh = (obj: THREE.Object3D): obj is THREE.Mesh =>
  obj instanceof THREE.Mesh &&
  !(obj instanceof THREE.SkinnedMesh) &&
  !Array.isArray(obj.material) &&
  obj.visible &&
  !obj.morphTargetDictionary &&
  !Object.keys(obj.geometry.morphAttributes).length

function mergeStaticModel(source: THREE.Group, preserveLampGlass = false): THREE.Group {
  const root = source.clone(true)
  root.updateMatrixWorld(true)

  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const mat = new THREE.Matrix4()
  const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; cast: boolean; recv: boolean }>()
  const toRemove: THREE.Object3D[] = []
  const toProcess: THREE.Mesh[] = []

  root.traverse((obj) => {
    if (!isMergeableMesh(obj)) return
    if (preserveLampGlass && isLanternGlass(obj.material as THREE.Material)) return
    toProcess.push(obj)
  })

  for (const obj of toProcess) {
    const sig = geometrySignature(obj)
    let bucket = groups.get(sig)
    if (!bucket) {
      bucket = { material: obj.material as THREE.Material, geometries: [], cast: obj.castShadow, recv: obj.receiveShadow }
      groups.set(sig, bucket)
    }
    mat.multiplyMatrices(rootInv, obj.matrixWorld)
    bucket.geometries.push(obj.geometry.clone().applyMatrix4(mat))
    toRemove.push(obj)
  }

  if (!groups.size) return root

  for (let i = 0; i < toRemove.length; i++) toRemove[i].parent?.remove(toRemove[i])

  for (const b of groups.values()) {
    const merged = b.geometries.length === 1 ? b.geometries[0] : mergeGeometries(b.geometries, false)
    if (merged) {
      const mesh = new THREE.Mesh(merged, b.material)
      mesh.castShadow = b.cast
      mesh.receiveShadow = b.recv
      root.add(mesh)
      for (let i = 0; i < b.geometries.length; i++) {
        if (b.geometries[i] !== merged) b.geometries[i].dispose()
      }
    } else {
      for (let i = 0; i < b.geometries.length; i++) {
        const mesh = new THREE.Mesh(b.geometries[i], b.material)
        mesh.castShadow = b.cast
        mesh.receiveShadow = b.recv
        root.add(mesh)
      }
    }
  }

  return root
}

function loadSource(path: string): Promise<ModelSource> {
  let promise = modelCache.get(path)
  if (!promise) {
    promise = new Promise((res, rej) =>
      loader.load(path, (g) => {
        markSharedModelResources(g.scene)
        res({ scene: g.scene, animations: g.animations })
      }, undefined, rej)
    )
    modelCache.set(path, promise)
  }
  return promise
}

function loadStaticSource(path: string, options?: LoadModelOptions): Promise<THREE.Group> {
  const key = cacheKey(path, options)
  let promise = staticModelCache.get(key)
  if (!promise) {
    promise = loadSource(path).then(async ({ scene }) => {
      if (options?.disableMerge) return scene.clone(true)
      await yieldToMainThread()
      const merged = mergeStaticModel(scene, isLanternModel(path))
      markSharedModelResources(merged)
      return merged
    })
    staticModelCache.set(key, promise)
  }
  return promise
}

export async function loadModel(path: string, options?: LoadModelOptions): Promise<THREE.Group> {
  const resolvedPath = resolveModelPath(path)
  try {
    const source = await loadStaticSource(resolvedPath, options)
    return source.clone(true)
  } catch (error) {
    staticModelCache.delete(cacheKey(resolvedPath, options))
    modelCache.delete(resolvedPath)
    throw error
  }
}

export async function loadModelAsset(path: string): Promise<LoadedModel> {
  const resolvedPath = resolveModelPath(path)
  try {
    const source = await loadSource(resolvedPath)
    return {
      model: clone(source.scene) as THREE.Group,
      animations: source.animations,
    }
  } catch (error) {
    modelCache.delete(resolvedPath)
    throw error
  }
}
