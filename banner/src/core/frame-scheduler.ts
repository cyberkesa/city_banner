const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null
const queue: (() => void)[] = []

if (channel) {
  channel.port1.onmessage = () => queue.shift()?.()
}

export function yieldToMainThread(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield: () => Promise<void> } }).scheduler
  if (scheduler?.yield) return scheduler.yield()

  return new Promise((resolve) => {
    if (channel) {
      queue.push(resolve)
      channel.port2.postMessage(null)
    } else {
      setTimeout(resolve, 0)
    }
  })
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const len = items.length
  if (len === 0) return []

  const results = new Array<R>(len)
  let cursor = 0

  const worker = async () => {
    while (cursor < len) {
      const idx = cursor++
      results[idx] = await task(items[idx], idx)
      if (idx % 16 === 15) await yieldToMainThread()
    }
  }

  const threads = Math.min(Math.max(1, concurrency | 0), len)
  const pool = new Array<Promise<void>>(threads)

  for (let i = 0; i < threads; i++) {
    pool[i] = worker()
  }

  await Promise.all(pool)
  return results
}