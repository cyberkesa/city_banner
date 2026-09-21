import { describe, expect, it } from 'vitest'
import { SerialTaskQueue } from './serial-task-queue'

describe('SerialTaskQueue', () => {
  it('runs asynchronous commands in submission order', async () => {
    const queue = new SerialTaskQueue()
    const events: string[] = []
    let releaseFirst = (): void => {}
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = queue.enqueue(async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
      return 1
    })
    const second = queue.enqueue(async () => {
      events.push('second')
      return 2
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(events).toEqual(['first:start', 'first:end', 'second'])
  })

  it('continues after a failed command without hiding its error', async () => {
    const queue = new SerialTaskQueue()
    const failed = queue.enqueue(async () => { throw new Error('broken') })
    const recovered = queue.enqueue(async () => 'ok')

    await expect(failed).rejects.toThrow('broken')
    await expect(recovered).resolves.toBe('ok')
  })
})
