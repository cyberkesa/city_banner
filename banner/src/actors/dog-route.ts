import * as THREE from 'three'

export const DOG_SCALE = 0.04
export const DOG_SPEED = 1.05
export const DOG_COURSE_ORIGIN_X = (1 + -1.5) / 2
export const DOG_COURSE_ORIGIN_Z = 0
export const DOG_ROTATION_OFFSET_DEG = 0

const ROUTE_POINTS = [
  new THREE.Vector3(2.25, 0, 0.20),
  new THREE.Vector3(1.55, 0, 0.20),
  new THREE.Vector3(1.32, 0.12, 0.20),
  new THREE.Vector3(1.02, 0.42, 0.20),
  new THREE.Vector3(0.74, 0.12, 0.18),
  new THREE.Vector3(0.50, 0, 0.14),
  new THREE.Vector3(0.15, 0.03, 0.04),
  new THREE.Vector3(-0.55, 0.48, 0.02),
  new THREE.Vector3(-1.50, 1.08, 0.00),
  new THREE.Vector3(-2.45, 0.48, 0.02),
  new THREE.Vector3(-3.15, 0.03, 0.04),
  new THREE.Vector3(-3.75, 0, 0.10),
] as const

const routeCurve = new THREE.CatmullRomCurve3(
  ROUTE_POINTS.map((point) => point.clone()),
  false,
  'centripetal',
  0.5
)

export const DOG_ROUTE_LENGTH = routeCurve.getLength()

const LUT_SIZE = 500
const LUT: Float32Array = new Float32Array(LUT_SIZE * 6)

for (let i = 0; i < LUT_SIZE; i++) {
  const t = i / (LUT_SIZE - 1)
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  routeCurve.getPointAt(t, p)
  routeCurve.getTangentAt(t, tan)
  LUT[i * 6] = p.x
  LUT[i * 6 + 1] = p.y
  LUT[i * 6 + 2] = p.z
  LUT[i * 6 + 3] = tan.x
  LUT[i * 6 + 4] = tan.y
  LUT[i * 6 + 5] = tan.z
}

export function sampleDogRoute(
  distance: number,
  position: THREE.Vector3,
  tangent: THREE.Vector3
): void {
  const clamped = THREE.MathUtils.clamp(distance, 0, DOG_ROUTE_LENGTH)
  const f = LUT_SIZE > 1 ? (clamped / DOG_ROUTE_LENGTH) * (LUT_SIZE - 1) : 0
  const idx = Math.min(f | 0, LUT_SIZE - 2)
  const next = idx + 1
  const t = f - idx

  const a = idx * 6
  const b = next * 6

  position.set(
    LUT[a] + (LUT[b] - LUT[a]) * t,
    LUT[a + 1] + (LUT[b + 1] - LUT[a + 1]) * t,
    LUT[a + 2] + (LUT[b + 2] - LUT[a + 2]) * t,
  )
  tangent.set(
    LUT[a + 3] + (LUT[b + 3] - LUT[a + 3]) * t,
    LUT[a + 4] + (LUT[b + 4] - LUT[a + 4]) * t,
    LUT[a + 5] + (LUT[b + 5] - LUT[a + 5]) * t,
  )
  position.y = Math.max(0, position.y)
}

export function isDogBarrierJump(position: THREE.Vector3): boolean {
  return (
    position.x > 0.48 &&
    position.x < 1.55 &&
    position.y > 0.12
  )
}
