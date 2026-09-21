import { CITY_LAYOUT } from '../core/city-layout'
import { normalizeHttpUrl } from '../core/safe-url'
import { DEFAULT_SCENE_OBJECTS } from '../catalog/scene-objects'
import { resolveModelPath } from '../models/model-path'
import {
  BUSH_MODELS,
  LANDSCAPE_MAP_VERSION,
  SURFACE_MATERIALS,
  TREE_MODELS,
  type BezierHandles,
  type VegetationPoint,
  type LandscapeMap,
  type LandscapePath,
  type LandscapePoint,
  type LandscapeSurface,
  type SurfaceMaterialId,
  type VegetationArea,
  type VegetationKind,
  type VegetationLine,
  type VegetationModel,
} from './landscape-types'

export * from './landscape-types'

const VALID_MATERIALS = new Set<string>(SURFACE_MATERIALS.map((m) => m.id))
const VALID_MODELS = new Set<string>([...TREE_MODELS, ...BUSH_MODELS, 'random-tree', 'random-bush'])
const LEGACY_WIDTHS = new Set([45, 90])

const W = CITY_LAYOUT.width
const HW = W * 0.5

export const wrapMapX = (x: number): number => x - W * Math.floor((x + HW) / W)

const MODEL_ALIASES: Record<string, string> = {
  '/models/bush.glb': '/models/shrub-07-green.glb',
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const rec = (v: unknown, k: string) => { if (!isObj(v)) throw new Error(k); return v }
const num = (v: unknown, k: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(k); return v }
const str = (v: unknown, k: string) => { if (typeof v !== 'string' || !v.trim()) throw new Error(k); return v }
const bool = (v: unknown, k: string) => { if (typeof v !== 'boolean') throw new Error(k); return v }
const arr = (v: unknown, k: string) => { if (!Array.isArray(v)) throw new Error(k); return v }

const pt = (v: unknown, k: string): LandscapePoint => {
  const a = arr(v, k)
  if (a.length !== 2) throw new Error(k)
  return [num(a[0], k), num(a[1], k)]
}

const pts = (v: unknown, k: string, min: number): LandscapePoint[] => {
  const a = arr(v, k).map((p, i) => pt(p, `${k}[${i}]`))
  if (a.length < min) throw new Error(k)
  return a
}

const matVal = (v: unknown, k: string): SurfaceMaterialId => {
  const s = str(v, k)
  if (!VALID_MATERIALS.has(s)) throw new Error(k)
  return s as SurfaceMaterialId
}

const vegKind = (v: unknown, k: string): VegetationKind => {
  if (v !== 'tree' && v !== 'bush') throw new Error(k)
  return v
}

const vegModel = (v: unknown, k: string): VegetationModel => {
  const raw = str(v, k)
  const m = MODEL_ALIASES[raw] ?? raw
  if (!VALID_MODELS.has(m)) throw new Error(k)
  return m as VegetationModel
}

function parseBezierHandles(v: unknown, count: number, k: string): BezierHandles[] {
  if (v === undefined) return Array.from({ length: count }, () => ({ incoming: null, outgoing: null }))
  const a = arr(v, k)
  if (a.length !== count) throw new Error(k)
  return a.map((raw, i) => {
    const item = rec(raw, `${k}[${i}]`)
    return {
      incoming: item.incoming === null ? null : pt(item.incoming, `${k}[${i}].in`),
      outgoing: item.outgoing === null ? null : pt(item.outgoing, `${k}[${i}].out`),
    }
  })
}

function normalizeGeometryX(item: LandscapeSurface | LandscapePath | VegetationLine | VegetationArea): void {
  const n = item.points.length
  if (n === 0) return
  let sum = 0
  for (let i = 0; i < n; i++) sum += item.points[i][0]
  const cx = sum / n
  const dx = wrapMapX(cx) - cx
  if (Math.abs(dx) < 1e-6) return

  for (let i = 0; i < n; i++) item.points[i][0] += dx
  if ('handles' in item) {
    for (let i = 0; i < item.handles.length; i++) {
      const h = item.handles[i]
      if (h.incoming) h.incoming[0] += dx
      if (h.outgoing) h.outgoing[0] += dx
    }
  }
}

function assertMapStructure(value: unknown): void {
  const root = rec(value, 'map')
  if (root.version !== LANDSCAPE_MAP_VERSION) throw new Error('version')

  const width = num(root.width, 'width')
  const depth = num(root.depth, 'depth')
  if ((width !== CITY_LAYOUT.width && !LEGACY_WIDTHS.has(width)) || depth !== CITY_LAYOUT.depth) {
    throw new Error('size')
  }
}

function buildVegetation(
  root: Record<string, unknown>,
  key: string,
  label: string,
): (VegetationLine | VegetationArea | VegetationPoint)[] {
  return arr(root[key], label).map((raw, i) => {
    const item = rec(raw, `${label}[${i}]`) as Record<string, unknown>
    const isLine = 'spacing' in item
    const isArea = 'count' in item

    const base: Record<string, unknown> = {
      id: str(item.id, 'id'),
      kind: vegKind(item.kind, 'kind'),
      model: vegModel(item.model, 'model'),
    }

    if (isLine) {
      base['points'] = pts(item.points, `${label}[${i}].pts`, 2)
      ;(base as VegetationLine).spacing = num(item.spacing, 'spacing')
      ;(base as VegetationLine).scaleMin = num(item.scaleMin, 'scaleMin')
      ;(base as VegetationLine).scaleMax = num(item.scaleMax, 'scaleMax')
      ;(base as VegetationLine).seed = num(item.seed, 'seed')
    } else if (isArea) {
      base['points'] = pts(item.points, `${label}[${i}].pts`, 3)
      ;(base as VegetationArea).count = num(item.count, 'count')
      ;(base as VegetationArea).minDistance = num(item.minDistance, 'minDistance')
      ;(base as VegetationArea).scaleMin = num(item.scaleMin, 'scaleMin')
      ;(base as VegetationArea).scaleMax = num(item.scaleMax, 'scaleMax')
      ;(base as VegetationArea).seed = num(item.seed, 'seed')
    } else {
      base['position'] = pt(item.position, 'pos')
      base['scale'] = num(item.scale, 'scale')
      base['rotation'] = num(item.rotation, 'rot')
    }
    return base as VegetationLine | VegetationArea | VegetationPoint
  })
}

function buildObjects(root: Record<string, unknown>): LandscapeMap['objects'] {
  const rawObjects = root.objects
  if (rawObjects === undefined) return structuredClone(DEFAULT_SCENE_OBJECTS)
  return arr(rawObjects, 'objects').map((raw, i) => {
    const item = rec(raw, `obj[${i}]`)
    const url = typeof item.url === 'string'
      ? normalizeHttpUrl(item.url)
      : null
    if (typeof item.url === 'string' && item.url && !url) throw new Error('url')

    return {
      id: str(item.id, 'id'),
      name: str(item.name, 'name'),
      model: resolveModelPath(str(item.model, 'model')),
      position: pt(item.position, 'pos'),
      elevation: num(item.elevation ?? 0, 'elevation') as number,
      scale: num(item.scale, 'scale') as number,
      rotation: num(item.rotation, 'rot') as number,
      categoryKey: typeof item.categoryKey === 'string' ? item.categoryKey : undefined,
      url: url ?? undefined,
    }
  })
}

export function createEmptyLandscapeMap(): LandscapeMap {
  return {
    version: LANDSCAPE_MAP_VERSION,
    width: CITY_LAYOUT.width,
    depth: CITY_LAYOUT.depth,
    surfaces: [],
    paths: [],
    vegetation: [],
    vegetationLines: [],
    vegetationAreas: [],
    objects: [],
  }
}

export function parseLandscapeMap(value: unknown): LandscapeMap {
  assertMapStructure(value)
  const root = rec(value, 'map') as Record<string, unknown>

  const result: LandscapeMap = {
    version: LANDSCAPE_MAP_VERSION,
    width: CITY_LAYOUT.width,
    depth: num(root.depth, 'depth') as number,
    surfaces: arr(root.surfaces, 'surfaces').map((raw, i) => {
      const item = rec(raw, `surfaces[${i}]`)
      const p = pts(item.points, `surfaces[${i}].pts`, 3)
      return {
        id: str(item.id, 'id'),
        name: str(item.name, 'name'),
        material: matVal(item.material, 'material'),
        points: p,
        cornerRadius: num(item.cornerRadius, 'radius') as number,
        handles: parseBezierHandles(item.handles, p.length, 'handles'),
      }
    }),
    paths: arr(root.paths, 'paths').map((raw, i) => {
      const item = rec(raw, `paths[${i}]`)
      const p = pts(item.points, `paths[${i}].pts`, 2)
      return {
        id: str(item.id, 'id'),
        name: str(item.name, 'name'),
        material: matVal(item.material, 'material'),
        points: p,
        width: num(item.width, 'width') as number,
        smooth: bool(item.smooth, 'smooth') as boolean,
        handles: parseBezierHandles(item.handles, p.length, 'handles'),
      }
    }),
    vegetation: buildVegetation(root, 'vegetation', 'vegetation') as VegetationPoint[],
    vegetationLines: buildVegetation(root, 'vegetationLines', 'vegetationLines') as VegetationLine[],
    vegetationAreas: buildVegetation(root, 'vegetationAreas', 'vegetationAreas') as VegetationArea[],
    objects: buildObjects(root),
  }

  for (const key of ['surfaces', 'paths', 'vegetationLines', 'vegetationAreas'] as const) {
    const arr = result[key]
    for (let i = 0; i < arr.length; i++) normalizeGeometryX(arr[i])
  }

  for (const item of [...result.vegetation, ...result.objects]) {
    item.position[0] = wrapMapX(item.position[0])
  }

  return result
}

export const cloneLandscapeMap = (map: LandscapeMap): LandscapeMap => structuredClone(map)

export function surfaceMaterial(id: SurfaceMaterialId): typeof SURFACE_MATERIALS[number] {
  const m = SURFACE_MATERIALS.find((item) => item.id === id)
  if (!m) throw new Error(id)
  return m
}
