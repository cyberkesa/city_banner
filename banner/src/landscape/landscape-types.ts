import type { SceneObject } from '../catalog/scene-objects'

export type LandscapePoint = [number, number]

export type BezierHandles = {
  incoming: LandscapePoint | null
  outgoing: LandscapePoint | null
}

export const LANDSCAPE_MAP_VERSION = 1 as const

export const SURFACE_MATERIALS = [
  { id: 'grass', label: 'Трава', color: '#64894f' },
  { id: 'soil', label: 'Земля', color: '#856a4e' },
  { id: 'paving-light', label: 'Светлая плитка', color: '#d8d8d2' },
  { id: 'paving-gray', label: 'Серая плитка', color: '#aaa9a3' },
  { id: 'paving-warm', label: 'Тёплая плитка', color: '#c9b9a4' },
  { id: 'sand', label: 'Песок', color: '#d2b477' },
  { id: 'rubber-red', label: 'Кислотно-жёлтое с серыми волнами', color: '#c7ed2b' },
  { id: 'rubber-gray', label: 'Серое резиновое покрытие', color: '#777b7d' },
] as const

export type SurfaceMaterialId = typeof SURFACE_MATERIALS[number]['id']

export const TREE_MODELS = [
  '/models/tree0.glb', '/models/tree1.glb', '/models/tree2.glb', '/models/tree3.glb', '/models/tree4.glb',
  '/models/tree5.glb', '/models/tree6.glb', '/models/tree7.glb', '/models/tree8.glb', '/models/tree9.glb',
] as const

export const BUSH_MODELS = [
  '/models/shrub-01-white.glb', '/models/shrub-02-pink.glb', '/models/shrub-03-yellow.glb',
  '/models/shrub-04-purple.glb', '/models/shrub-05-cream.glb', '/models/shrub-06-coral.glb',
  '/models/shrub-07-green.glb', '/models/shrub-08-giant-cream.glb', '/models/shrub-09-giant-green.glb',
] as const

export type VegetationKind = 'tree' | 'bush'

export type VegetationModel =
  | typeof TREE_MODELS[number]
  | typeof BUSH_MODELS[number]
  | 'random-tree'
  | 'random-bush'

export type LandscapeSurface = {
  id: string
  name: string
  material: SurfaceMaterialId
  points: LandscapePoint[]
  cornerRadius: number
  handles: BezierHandles[]
}

export type LandscapePath = {
  id: string
  name: string
  material: SurfaceMaterialId
  points: LandscapePoint[]
  width: number
  smooth: boolean
  handles: BezierHandles[]
}

export type VegetationPoint = {
  id: string
  kind: VegetationKind
  model: VegetationModel
  position: LandscapePoint
  scale: number
  rotation: number
}

export type VegetationLine = {
  id: string
  kind: VegetationKind
  model: VegetationModel
  points: LandscapePoint[]
  spacing: number
  scaleMin: number
  scaleMax: number
  seed: number
}

export type VegetationArea = {
  id: string
  kind: VegetationKind
  model: VegetationModel
  points: LandscapePoint[]
  count: number
  minDistance: number
  scaleMin: number
  scaleMax: number
  seed: number
}

export type LandscapeMap = {
  version: typeof LANDSCAPE_MAP_VERSION
  width: number
  depth: number
  surfaces: LandscapeSurface[]
  paths: LandscapePath[]
  vegetation: VegetationPoint[]
  vegetationLines: VegetationLine[]
  vegetationAreas: VegetationArea[]
  objects: SceneObject[]
}