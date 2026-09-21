import type { Category } from '../catalog/categories'
import type { RenderQuality } from './render-quality'

export type EngineEventMap = {
  'scroll:change': { scrollX: number; sceneOffsetX: number; velocity: number }
  'category:hover': { category: Category | null }
  'category:select': { category: Category }
  'quality:change': { quality: RenderQuality }
}

type EventCallback<T> = (payload: T) => void

export class EngineEventBus {
  private readonly listeners = new Map<keyof EngineEventMap, Set<EventCallback<any>>>()

  on<K extends keyof EngineEventMap>(type: K, listener: EventCallback<EngineEventMap[K]>): () => void {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    set.add(listener)
    return () => set!.delete(listener)
  }

  emit<K extends keyof EngineEventMap>(type: K, payload: EngineEventMap[K]): void {
    const set = this.listeners.get(type)
    if (set) {
      const snapshot = [...set]
      for (const fn of snapshot) {
        try { fn(payload) } catch (e) { console.error(`EventBus handler error:`, e) }
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
