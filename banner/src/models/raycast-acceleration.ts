import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

const queue: THREE.BufferGeometry[] = []
const queued = new WeakSet<THREE.BufferGeometry>()
let head = 0
let scheduled = false
let installed = false

export function installRaycastAcceleration(): void {
  if (installed) return
  installed = true

  const proto = THREE.BufferGeometry.prototype
  Object.assign(proto, { computeBoundsTree, disposeBoundsTree })
  THREE.Mesh.prototype.raycast = acceleratedRaycast

  const origDispose = proto.dispose
  proto.dispose = function (this: THREE.BufferGeometry) {
    this.disposeBoundsTree?.()
    origDispose.call(this)
  }
}

function processQueue(deadline?: IdleDeadline): void {
  scheduled = false

  
  while (head < queue.length) {
    if (deadline && deadline.timeRemaining() <= 3 && !deadline.didTimeout) break

    const geo = queue[head++]
    const pos = geo.getAttribute('position')

    if (pos && !geo.boundsTree) {
      
      
      
      const tris = pos.count / 3
      const leafSize = Math.max(8, Math.min(24, Math.sqrt(tris) | 0))

      geo.computeBoundsTree({ targetLeafSize: leafSize })
    }
  }

  if (head < queue.length) {
    schedule()
  } else {
    queue.length = head = 0 
  }
}

function schedule(): void {
  if (scheduled || head >= queue.length) return
  scheduled = true
  const run = (d?: IdleDeadline) => processQueue(d)
  
  'requestIdleCallback' in window
    ? window.requestIdleCallback(run, { timeout: 1500 })
    : setTimeout(run, 16)
}

export function prepareRaycastGeometry(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position')
  if (!pos || pos.count < 900 || geo.boundsTree || queued.has(geo)) return

  queued.add(geo)
  queue.push(geo)
  schedule()
}