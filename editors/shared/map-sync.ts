import { parseLandscapeMap, type LandscapeMap } from '../../banner/src/landscape/landscape-schema'

export type MapEditorSource = '3d' | 'landscape'

export type SavedMapMessage = {
  type: 'map-saved'
  source: MapEditorSource
  savedAt: number
  map: LandscapeMap
}

const STORAGE_KEY = 'city-landscape-map-saved-v1'
const CHANNEL_NAME = 'city-landscape-map-sync'
const channel = typeof BroadcastChannel === 'undefined'
  ? null
  : new BroadcastChannel(CHANNEL_NAME)

function parseMessage(value: unknown): SavedMapMessage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<SavedMapMessage>
  if (
    candidate.type !== 'map-saved' ||
    (candidate.source !== '3d' && candidate.source !== 'landscape') ||
    typeof candidate.savedAt !== 'number'
  ) return null

  try {
    return {
      type: 'map-saved',
      source: candidate.source,
      savedAt: candidate.savedAt,
      map: parseLandscapeMap(candidate.map),
    }
  } catch {
    return null
  }
}

export function latestSavedMap(): SavedMapMessage | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? parseMessage(JSON.parse(value)) : null
  } catch {
    return null
  }
}

export function publishSavedMap(
  map: LandscapeMap,
  source: MapEditorSource
): SavedMapMessage {
  const message: SavedMapMessage = {
    type: 'map-saved',
    source,
    savedAt: Date.now(),
    map: structuredClone(map),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
  } catch {
    
  }
  try {
    channel?.postMessage(message)
  } catch {
    
  }
  return message
}

export function subscribeSavedMap(
  listener: (message: SavedMapMessage) => void
): () => void {
  let lastDelivered = 0
  const deliver = (value: unknown) => {
    const message = parseMessage(value)
    if (!message || message.savedAt <= lastDelivered) return
    lastDelivered = message.savedAt
    listener(message)
  }
  const onMessage = (event: MessageEvent<unknown>) => deliver(event.data)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      deliver(JSON.parse(event.newValue))
    } catch {
      
    }
  }

  channel?.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}
