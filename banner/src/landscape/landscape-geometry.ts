import {
  CITY_LAYOUT,
  MAP_HALF_DEPTH,
  MAP_HALF_WIDTH,
} from '../core/city-layout'
import type { LandscapePoint } from './landscape-schema'

export type LandscapeRect = {
  minimumX: number
  maximumX: number
  minimumZ: number
  maximumZ: number
}


const CS_INSIDE = 0 
const CS_LEFT   = 1 
const CS_RIGHT  = 2 
const CS_BOTTOM = 4 
const CS_TOP    = 8 




const roadCache = new Map<number, LandscapeRect[]>()

export function roadRectangles(margin = 0): LandscapeRect[] {
  let rects = roadCache.get(margin)
  if (rects) return rects

  const mainHalf = CITY_LAYOUT.mainRoad.width * 0.5 + margin
  const sideHalf = CITY_LAYOUT.sideRoad.width * 0.5 + margin

  rects = [
    {
      minimumX: -MAP_HALF_WIDTH,
      maximumX: MAP_HALF_WIDTH,
      minimumZ: CITY_LAYOUT.mainRoad.centerZ - mainHalf,
      maximumZ: CITY_LAYOUT.mainRoad.centerZ + mainHalf,
    },
    {
      minimumX: CITY_LAYOUT.sideRoad.centerX - sideHalf,
      maximumX: CITY_LAYOUT.sideRoad.centerX + sideHalf,
      minimumZ: -MAP_HALF_DEPTH,
      maximumZ: CITY_LAYOUT.mainRoad.centerZ + mainHalf,
    },
  ]

  roadCache.set(margin, rects)
  return rects
}





export function pointInRect(point: LandscapePoint, rect: LandscapeRect): boolean {
  const [x, z] = point
  return (
    x >= rect.minimumX &&
    x <= rect.maximumX &&
    z >= rect.minimumZ &&
    z <= rect.maximumZ
  )
}


function aabbIntersectsAABB(a: LandscapeRect, b: LandscapeRect): boolean {
  return (
    a.minimumX <= b.maximumX &&
    a.maximumX >= b.minimumX &&
    a.minimumZ <= b.maximumZ &&
    a.maximumZ >= b.minimumZ
  )
}


function computePolygonAABB(points: readonly LandscapePoint[]): LandscapeRect {
  let minX = points[0][0], maxX = minX
  let minZ = points[0][1], maxZ = minZ

  for (let i = 1; i < points.length; i++) {
    const x = points[i][0]
    const z = points[i][1]
    if (x < minX) minX = x
    else if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    else if (z > maxZ) maxZ = z
  }

  return { minimumX: minX, maximumX: maxX, minimumZ: minZ, maximumZ: maxZ }
}





function computeOutCode(x: number, z: number, r: LandscapeRect): number {
  let code = CS_INSIDE
  if (x < r.minimumX) code |= CS_LEFT
  else if (x > r.maximumX) code |= CS_RIGHT
  if (z < r.minimumZ) code |= CS_BOTTOM
  else if (z > r.maximumZ) code |= CS_TOP
  return code
}


function segmentIntersectsRect(
  p1: LandscapePoint,
  p2: LandscapePoint,
  rect: LandscapeRect
): boolean {
  let [x0, z0] = p1
  let [x1, z1] = p2

  let code0 = computeOutCode(x0, z0, rect)
  let code1 = computeOutCode(x1, z1, rect)

  while (true) {
    
    if ((code0 | code1) === 0) return true
    
    if ((code0 & code1) !== 0) return false

    
    const outcodeOut = code0 !== 0 ? code0 : code1
    let x = 0
    let z = 0

    if (outcodeOut & CS_TOP) {
      x = x0 + ((x1 - x0) * (rect.maximumZ - z0)) / (z1 - z0)
      z = rect.maximumZ
    } else if (outcodeOut & CS_BOTTOM) {
      x = x0 + ((x1 - x0) * (rect.minimumZ - z0)) / (z1 - z0)
      z = rect.minimumZ
    } else if (outcodeOut & CS_RIGHT) {
      z = z0 + ((z1 - z0) * (rect.maximumX - x0)) / (x1 - x0)
      x = rect.maximumX
    } else if (outcodeOut & CS_LEFT) {
      z = z0 + ((z1 - z0) * (rect.minimumX - x0)) / (x1 - x0)
      x = rect.minimumX
    }

    if (outcodeOut === code0) {
      x0 = x
      z0 = z
      code0 = computeOutCode(x0, z0, rect)
    } else {
      x1 = x
      z1 = z
      code1 = computeOutCode(x1, z1, rect)
    }
  }
}





export function pointInPolygonXY(
  x: number,
  z: number,
  polygon: readonly (readonly [number, number])[],
  minX?: number, maxX?: number, minZ?: number, maxZ?: number
): boolean {
  if (minX !== undefined && maxX !== undefined && minZ !== undefined && maxZ !== undefined) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false
  }

  let inside = false
  const len = polygon.length

  for (let i = 0, j = len - 1; i < len; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]

    if ((zi > z) !== (zj > z)) {
      const cross = (xj - xi) * (z - zi) - (x - xi) * (zj - zi)

      if (zj > zi ? cross > 0 : cross < 0) {
        inside = !inside
      }
    }
  }

  return inside
}

export function pointInPolygon(
  point: LandscapePoint,
  polygon: readonly LandscapePoint[]
): boolean {
  return pointInPolygonXY(point[0], point[1], polygon)
}





export function polygonIntersectsRoad(
  points: readonly LandscapePoint[],
  margin = 0
): boolean {
  if (points.length < 3) return false

  
  const polyAABB = computePolygonAABB(points)
  const roads = roadRectangles(margin)

  return roads.some((rect) => {
    
    if (!aabbIntersectsAABB(polyAABB, rect)) return false

    
    const len = points.length
    for (let i = 0; i < len; i++) {
      if (segmentIntersectsRect(points[i], points[(i + 1) % len], rect)) {
        return true
      }
    }

    
      return pointInPolygonXY(
        rect.minimumX, rect.minimumZ, points,
        polyAABB.minimumX, polyAABB.maximumX, polyAABB.minimumZ, polyAABB.maximumZ,
      )
  })
}

export function lineIntersectsRoad(
  points: readonly LandscapePoint[],
  margin = 0
): boolean {
  if (points.length < 2) return false

  const lineAABB = computePolygonAABB(points)
  const roads = roadRectangles(margin)

  return roads.some((rect) => {
    if (!aabbIntersectsAABB(lineAABB, rect)) return false

    for (let i = 0; i < points.length - 1; i++) {
      if (segmentIntersectsRect(points[i], points[i + 1], rect)) {
        return true
      }
    }
    return false
  })
}

export function pointOnRoad(
  point: LandscapePoint,
  margin = 0.12
): boolean {
  const roads = roadRectangles(margin)
  return pointInRect(point, roads[0]) || pointInRect(point, roads[1])
}






export function snapPointOutsideRoad(
  source: LandscapePoint,
  clearance: number
): { point: LandscapePoint; snapped: boolean } {
  let [x, z] = source
  const roads = roadRectangles(clearance)
  let snapped = false

  
  for (let step = 0; step < 2; step++) {
    const hitRoad = roads.find((r) => pointInRect([x, z], r))
    if (!hitRoad) break

    snapped = true

    
    const dl = x - hitRoad.minimumX
    const dr = hitRoad.maximumX - x
    const db = z - hitRoad.minimumZ
    const dt = hitRoad.maximumZ - z

    const minDist = Math.min(dl, dr, db, dt)
    const EPS = 0.01

    
    if (minDist === dl) x = hitRoad.minimumX - EPS
    else if (minDist === dr) x = hitRoad.maximumX + EPS
    else if (minDist === db) z = hitRoad.minimumZ - EPS
    else z = hitRoad.maximumZ + EPS
  }

  return { point: [x, z], snapped }
}