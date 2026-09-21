import type * as THREE from 'three'

type RaycastAccelerationModule = typeof import('./raycast-acceleration')

const IDLE_DEADLINE_THRESHOLD_MS = 4
const IDLE_CALLBACK_TIMEOUT_MS = 1500
const SETTLE_TIMEOUT_MS = 60
const MIN_VERTEX_COUNT_FOR_BVH = 900

const pending: THREE.BufferGeometry[] = []
const queued = new WeakSet<THREE.BufferGeometry>()

let isScheduled = false
let accelerationPromise: Promise<RaycastAccelerationModule> | null = null

function getAccelerationModule(): Promise<RaycastAccelerationModule> {
  if (!accelerationPromise) {
    accelerationPromise = import('./raycast-acceleration').then((mod) => {
      mod.installRaycastAcceleration()
      return mod
    })
  }
  return accelerationPromise
}

async function processQueue(deadline?: IdleDeadline): Promise<void> {
  if (pending.length === 0) {
    isScheduled = false
    return
  }

  const acceleration = await getAccelerationModule()

  while (pending.length > 0) {
    if (deadline && deadline.timeRemaining() <= IDLE_DEADLINE_THRESHOLD_MS && !deadline.didTimeout) {
      break
    }

    const geometry = pending.shift()
    if (!geometry) continue

    if (!geometry.getAttribute('position')) continue

    acceleration.prepareRaycastGeometry(geometry)
  }

  if (pending.length > 0) {
    scheduleNextBatch()
  } else {
    isScheduled = false
  }
}

function scheduleNextBatch(): void {
  isScheduled = true

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback((deadline) => void processQueue(deadline), {
      timeout: IDLE_CALLBACK_TIMEOUT_MS,
    })
  } else {
    setTimeout(() => void processQueue(), SETTLE_TIMEOUT_MS)
  }
}

export function scheduleRaycastGeometry(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position')

  if (!position || position.count < MIN_VERTEX_COUNT_FOR_BVH || queued.has(geometry)) return

  queued.add(geometry)
  pending.push(geometry)

  if (!isScheduled) {
    scheduleNextBatch()
  }
}
