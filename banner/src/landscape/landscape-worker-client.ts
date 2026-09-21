import type { LandscapeMap } from './landscape-schema'
import { resolveVegetation, type ResolvedVegetation } from './vegetation-layout'
import type { LandscapeWorkerResult, LandscapeWorkerTask } from './landscape-worker-types'

let worker: Worker | null = null
let reqId = 1
const pending = new Map<number, { res: (value: unknown) => void; rej: (error: Error) => void }>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker

  worker = new Worker(new URL('./landscape.worker.ts', import.meta.url), {
    type: 'module',
    name: 'landscape-generator',
  })

  worker.onmessage = ({ data }: MessageEvent<LandscapeWorkerResult>) => {
    const req = pending.get(data.id)
    if (!req) return
    pending.delete(data.id)
    data.ok ? req.res(data.result) : req.rej(new Error(data.error))
  }

  worker.onerror = () => {
    pending.forEach((r) => r.rej(new Error('Worker terminated')))
    pending.clear()
    worker?.terminate()
    worker = null
  }

  return worker
}

export const resolveVegetationInBackground = (map: LandscapeMap): Promise<ResolvedVegetation[]> =>
  new Promise((res, rej) => {
    const w = getWorker()
    if (!w) { res(resolveVegetation(map)); return }

    const id = reqId++
    pending.set(id, { res: (v) => res(v as ResolvedVegetation[]), rej })
    try {
      w.postMessage({ id, type: 'resolve-vegetation', map } as LandscapeWorkerTask)
    } catch (error) {
      pending.delete(id)
      rej(error instanceof Error ? error : new Error(String(error)))
    }
  })
