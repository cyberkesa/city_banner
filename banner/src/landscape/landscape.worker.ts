/// <reference lib="webworker" />

import { resolveVegetation } from './vegetation-layout'
import type {
  LandscapeWorkerResult,
  LandscapeWorkerTask,
} from './landscape-worker-types'

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<LandscapeWorkerTask>) => {
  const task = event.data

  try {
    if (task.type === 'resolve-vegetation') {
      const response: LandscapeWorkerResult = {
        id: task.id,
        ok: true,
        type: task.type,
        result: resolveVegetation(task.map),
      }
      workerScope.postMessage(response)
      return
    }
  } catch (error) {
    const response: LandscapeWorkerResult = {
      id: task.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    workerScope.postMessage(response)
  }
}

export {}
