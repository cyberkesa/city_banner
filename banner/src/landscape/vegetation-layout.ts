import { createPRNG } from '../core/random'
import { pointInPolygonXY } from './landscape-geometry'
import {
  BUSH_MODELS,
  TREE_MODELS,
  type LandscapeMap,
  type LandscapePoint,
  type VegetationArea,
  type VegetationKind,
  type VegetationLine,
  type VegetationModel,
} from './landscape-types'

export type ResolvedVegetation = {
  id: string
  kind: VegetationKind
  model: VegetationModel
  position: LandscapePoint
  scale: number
  rotation: number
  randomValue: number
}

const hashStr = (v: string): number => {
  let h = 2166136261
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619)
  return h >>> 0
}

function vegetationLinePoints(line: VegetationLine): LandscapePoint[] {
  const pts: LandscapePoint[] = []
  for (let i = 0; i < line.points.length; i++) {
    const p = line.points[i]
    const prev = pts[pts.length - 1]
    if (!prev || (p[0] - prev[0]) ** 2 + (p[1] - prev[1]) ** 2 > 1e-6) pts.push(p)
  }
  if (pts.length < 2) return []

  const len = pts.length
  const dists = new Float64Array(len)
  for (let i = 1; i < len; i++) {
    dists[i] = dists[i - 1] + Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2)
  }

  const total = dists[len - 1]
  const step = Math.max(0.2, line.spacing)
  const result: LandscapePoint[] = []
  let seg = 1

  for (let d = 0; d <= total + 1e-4; d += step) {
    while (seg < len - 1 && dists[seg] < d) seg++
    const p0 = pts[seg - 1]
    const p1 = pts[seg]
    const l0 = dists[seg - 1]
    const t = (d - l0) / Math.max(1e-4, dists[seg] - l0)
    result.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t])
  }

  return result
}

function vegetationAreaPoints(area: VegetationArea, rand: () => number): LandscapePoint[] {
  const pts = area.points
  if (pts.length < 3) return []

  let minX = pts[0][0], maxX = pts[0][0]
  let minZ = pts[0][1], maxZ = pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x, z] = pts[i]
    if (x < minX) minX = x; else if (x > maxX) maxX = x
    if (z < minZ) minZ = z; else if (z > maxZ) maxZ = z
  }

  const areaSize = (maxX - minX) * (maxZ - minZ)
  const target = Math.max(0, area.count | 0)
  const r = Math.max(0, area.minDistance)
  const r2 = r * r
  const result: LandscapePoint[] = []
  const maxAttempts = Math.max(120, Math.min(target * 60, Math.round(areaSize / Math.max(r * r, 1))))

  if (r <= 0) {
    for (let i = 0; i < maxAttempts && result.length < target; i++) {
      const p: LandscapePoint = [minX + rand() * (maxX - minX), minZ + rand() * (maxZ - minZ)]
      if (pointInPolygonXY(p[0], p[1], pts, minX, maxX, minZ, maxZ)) result.push(p)
    }
    return result
  }

  const invR = 1 / r
  const cols = ((maxX - minX) * invR + 1) | 0
  const occupied = new Set<number>()
  const grid = new Map<number, LandscapePoint[]>()

  const cellHash = (gx: number, gz: number): number =>
    ((gx + 2048) << 22) | ((gz + 2048) | 0)

  for (let i = 0; i < maxAttempts && result.length < target; i++) {
    const px = minX + rand() * (maxX - minX)
    const pz = minZ + rand() * (maxZ - minZ)
    const p: LandscapePoint = [px, pz]

    if (!pointInPolygonXY(px, pz, pts, minX, maxX, minZ, maxZ)) continue

    const gx = ((px - minX) * invR) | 0
    const gz = ((pz - minZ) * invR) | 0
    const h0 = cellHash(gx, gz)

    let nearby = false
    for (let ox = -1; ox <= 1 && !nearby; ox++) {
      for (let oz = -1; oz <= 1 && !nearby; oz++) {
        if (ox === 0 && oz === 0) continue
        if (occupied.has(cellHash(gx + ox, gz + oz))) nearby = true
      }
    }

    if (!nearby) {
      result.push(p)
      occupied.add(h0)
      const key = gx + gz * cols
      const cell = grid.get(key)
      if (cell) cell.push(p); else grid.set(key, [p])
      continue
    }

    let ok = true
    for (let ox = -1; ox <= 1 && ok; ox++) {
      for (let oz = -1; oz <= 1 && ok; oz++) {
        const cell = grid.get(gx + ox + (gz + oz) * cols)
        if (!cell) continue
        for (let j = 0; j < cell.length; j++) {
          if ((cell[j][0] - px) ** 2 + (cell[j][1] - pz) ** 2 < r2) {
            ok = false
            break
          }
        }
      }
    }

    if (ok) {
      result.push(p)
      occupied.add(h0)
      const key = gx + gz * cols
      const cell = grid.get(key)
      if (cell) cell.push(p); else grid.set(key, [p])
    }
  }

  return result
}

const buildItem = (
  id: string,
  kind: VegetationKind,
  model: VegetationModel,
  position: LandscapePoint,
  sMin: number,
  sMax: number,
  rand: () => number
): ResolvedVegetation => {
  const rv = rand()
  return {
    id,
    kind,
    model,
    position,
    scale: sMin + rv * (sMax - sMin),
    rotation: rand() * 360,
    randomValue: rv,
  }
}

export function resolveVegetation(map: LandscapeMap): ResolvedVegetation[] {
  const result: ResolvedVegetation[] = map.vegetation.map((v) => ({
    ...v,
    randomValue: createPRNG(hashStr(v.id))(),
  }))

  for (let i = 0; i < map.vegetationLines.length; i++) {
    const l = map.vegetationLines[i]
    const rand = createPRNG(l.seed + hashStr(l.id))
    const pts = vegetationLinePoints(l)
    for (let j = 0; j < pts.length; j++) {
      result.push(buildItem(`${l.id}:${j}`, l.kind, l.model, pts[j], l.scaleMin, l.scaleMax, rand))
    }
  }

  for (let i = 0; i < map.vegetationAreas.length; i++) {
    const a = map.vegetationAreas[i]
    const rand = createPRNG(a.seed + hashStr(a.id))
    const pts = vegetationAreaPoints(a, rand)
    for (let j = 0; j < pts.length; j++) {
      result.push(buildItem(`${a.id}:${j}`, a.kind, a.model, pts[j], a.scaleMin, a.scaleMax, rand))
    }
  }

  return result
}

export function resolveModelPath(item: ResolvedVegetation): string {
  const models = item.model === 'random-tree' ? TREE_MODELS : item.model === 'random-bush' ? BUSH_MODELS : null
  return models ? models[(item.randomValue * models.length) | 0] : item.model
}
