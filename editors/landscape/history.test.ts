import { describe, expect, it } from 'vitest'

import { SnapshotHistory } from './history'

describe('SnapshotHistory', () => {
  it('moves snapshots between undo and redo', () => {
    const history = new SnapshotHistory()

    history.record('first')

    expect(history.undo('second')).toBe('first')
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
    expect(history.redo('first')).toBe('second')
    expect(history.canUndo).toBe(true)
  })

  it('invalidates redo after a new mutation', () => {
    const history = new SnapshotHistory()

    history.record('first')
    history.undo('second')
    history.record('third')

    expect(history.canRedo).toBe(false)
  })

  it('returns null when there is no matching action', () => {
    const history = new SnapshotHistory()

    expect(history.undo('current')).toBeNull()
    expect(history.redo('current')).toBeNull()
  })

  it('clears both directions', () => {
    const history = new SnapshotHistory()

    history.record('first')
    history.undo('second')
    history.clear()

    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
