export class SnapshotHistory {
  readonly #undo: string[] = []
  readonly #redo: string[] = []

  get canUndo(): boolean {
    return this.#undo.length > 0
  }

  get canRedo(): boolean {
    return this.#redo.length > 0
  }

  record(previousSnapshot: string): void {
    this.#undo.push(previousSnapshot)
    this.#redo.length = 0
  }

  undo(currentSnapshot: string): string | null {
    const previousSnapshot = this.#undo.pop()

    if (previousSnapshot === undefined) {
      return null
    }

    this.#redo.push(currentSnapshot)
    return previousSnapshot
  }

  redo(currentSnapshot: string): string | null {
    const nextSnapshot = this.#redo.pop()

    if (nextSnapshot === undefined) {
      return null
    }

    this.#undo.push(currentSnapshot)
    return nextSnapshot
  }

  clear(): void {
    this.#undo.length = 0
    this.#redo.length = 0
  }
}
