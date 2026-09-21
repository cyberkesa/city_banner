import * as THREE from 'three'

import type {
  LandscapePath,
  LandscapePoint,
  LandscapeSurface,
} from './landscape-types'

export function createPolygonShape(
  points: LandscapePoint[],
  cornerRadius = 0
): THREE.Shape {
  const vectors =
    points.map(
      ([x, z]) =>
        new THREE.Vector2(x, z)
    )

  const shape =
    new THREE.Shape()

  if (cornerRadius <= 0) {
    shape.moveTo(vectors[0].x, vectors[0].y)

    for (
      let index = 1;
      index < vectors.length;
      index += 1
    ) {
      shape.lineTo(
        vectors[index].x,
        vectors[index].y
      )
    }

    shape.closePath()
    return shape
  }

  const rounded =
    vectors.map((point, index) => {
      const previous =
        vectors[
          (index - 1 + vectors.length) % vectors.length
        ]

      const next =
        vectors[
          (index + 1) % vectors.length
        ]

      const toPrevious =
        previous.clone().sub(point)

      const toNext =
        next.clone().sub(point)

      const distance =
        Math.min(
          cornerRadius,
          toPrevious.length() * 0.45,
          toNext.length() * 0.45
        )

      return {
        point,
        start:
          point.clone().add(
            toPrevious.normalize().multiplyScalar(distance)
          ),
        end:
          point.clone().add(
            toNext.normalize().multiplyScalar(distance)
          ),
      }
    })

  shape.moveTo(
    rounded[0].start.x,
    rounded[0].start.y
  )

  for (const corner of rounded) {
    shape.lineTo(
      corner.start.x,
      corner.start.y
    )

    shape.quadraticCurveTo(
      corner.point.x,
      corner.point.y,
      corner.end.x,
      corner.end.y
    )
  }

  shape.closePath()
  return shape
}

export function cleanPathPoints(
  points: LandscapePoint[]
): THREE.Vector2[] {
  const result: THREE.Vector2[] = []

  for (const [x, z] of points) {
    const point =
      new THREE.Vector2(x, z)

    const previous =
      result[result.length - 1]

    if (
      !previous ||
      previous.distanceToSquared(point) > 0.000001
    ) {
      result.push(point)
    }
  }

  return result
}

export function samplePath(
  path: LandscapePath
): THREE.Vector2[] {
  if (path.handles.some((handle) => handle.incoming || handle.outgoing)) {
    const sampled: THREE.Vector2[] = []

    for (let index = 0; index < path.points.length - 1; index += 1) {
      const start = path.points[index]
      const end = path.points[index + 1]
      const controlOne = path.handles[index]?.outgoing ?? start
      const controlTwo = path.handles[index + 1]?.incoming ?? end
      const curve = new THREE.CubicBezierCurve(
        new THREE.Vector2(...start),
        new THREE.Vector2(...controlOne),
        new THREE.Vector2(...controlTwo),
        new THREE.Vector2(...end)
      )
      const segment = curve.getPoints(16)
      if (index > 0) segment.shift()
      sampled.push(...segment)
    }

    return sampled
  }

  const points =
    cleanPathPoints(path.points)

  if (
    !path.smooth ||
    points.length < 3
  ) {
    return points
  }

  const curve =
    new THREE.CatmullRomCurve3(
      points.map(
        (point) =>
          new THREE.Vector3(
            point.x,
            0,
            point.y
          )
      ),
      false,
      'centripetal'
    )

  return curve
    .getPoints(
      Math.max(18, (points.length - 1) * 14)
    )
    .map(
      (point) =>
        new THREE.Vector2(point.x, point.z)
    )
}

export function sampleSurfacePoints(surface: LandscapeSurface): LandscapePoint[] {
  if (!surface.handles.some((handle) => handle.incoming || handle.outgoing)) {
    return surface.points
  }

  const sampled: LandscapePoint[] = []
  for (let index = 0; index < surface.points.length; index += 1) {
    const nextIndex = (index + 1) % surface.points.length
    const start = surface.points[index]
    const end = surface.points[nextIndex]
    const curve = new THREE.CubicBezierCurve(
      new THREE.Vector2(...start),
      new THREE.Vector2(...(surface.handles[index]?.outgoing ?? start)),
      new THREE.Vector2(...(surface.handles[nextIndex]?.incoming ?? end)),
      new THREE.Vector2(...end)
    )
    const segment = curve.getPoints(16)
    if (index > 0) segment.shift()
    sampled.push(...segment.map((point) => [point.x, point.y] as LandscapePoint))
  }
  sampled.pop()
  return sampled
}

export function pathOutline(
  path: LandscapePath
): LandscapePoint[] {
  const points =
    samplePath(path)

  if (points.length < 2) {
    return []
  }

  const halfWidth =
    Math.max(0.05, path.width / 2)

  const left: THREE.Vector2[] = []
  const right: THREE.Vector2[] = []

  for (
    let index = 0;
    index < points.length;
    index += 1
  ) {
    const point = points[index]
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]

    const before =
      point.clone().sub(previous)

    const after =
      next.clone().sub(point)

    if (before.lengthSq() === 0) {
      before.copy(after)
    }

    if (after.lengthSq() === 0) {
      after.copy(before)
    }

    before.normalize()
    after.normalize()

    const beforeNormal =
      new THREE.Vector2(-before.y, before.x)

    const afterNormal =
      new THREE.Vector2(-after.y, after.x)

    const miter =
      beforeNormal.clone().add(afterNormal)

    if (miter.lengthSq() < 0.000001) {
      miter.copy(afterNormal)
    }

    miter.normalize()

    const denominator =
      Math.max(
        0.45,
        Math.abs(miter.dot(afterNormal))
      )

    const offset =
      Math.min(
        halfWidth * 1.8,
        halfWidth / denominator
      )

    left.push(
      point.clone().addScaledVector(miter, offset)
    )

    right.push(
      point.clone().addScaledVector(miter, -offset)
    )
  }

  return [
    ...left,
    ...right.reverse(),
  ].map(
    (point) => [point.x, point.y]
  )
}

