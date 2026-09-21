import { BASE_CATEGORIES } from './categories.config.ts'
import { PROPS } from '../environment/environment.config.ts'
import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop.ts'

export type SceneObject = {
  id: string
  name: string
  model: string
  position: [number, number]
  elevation: number
  scale: number
  rotation: number
  categoryKey?: string
  url?: string
}

export type SceneObjectCatalogItem = {
  model: string
  name: string
  catalogGroup?: string
  categoryKey?: string
  url?: string
  defaultScale: number
}

export const DEFAULT_SCENE_OBJECTS: SceneObject[] = [
  ...BASE_CATEGORIES.flatMap((item, itemIndex) => {
    const positions = item.positions ?? (item.position ? [item.position] : [])

    return positions.map((position, index) => ({
      id: `${item.id}-${itemIndex + 1}-${index + 1}`,
      name: item.name,
      model: item.model,
      position: [position[0], position[2]] as [number, number],
      elevation: position[1],
      scale: item.scale,
      rotation: item.rotationY ?? 0,
      categoryKey: item.categoryKey,
      url: item.url,
    }))
  }),
  ...PROPS.map((item) => ({
    id: item.id,
    name: item.id,
    model: item.model,
    position: [item.position[0], item.position[2]] as [number, number],
    elevation: item.position[1],
    scale: item.scale ?? 1,
    rotation: item.rotationY ?? 0,
  })),
]

const CONFIGURED_OBJECT_CATALOG: SceneObjectCatalogItem[] = [
  ...new Map(
    DEFAULT_SCENE_OBJECTS.map((item) => [
      item.model,
      {
        model: item.model,
        name: item.name,
        categoryKey: item.categoryKey,
        url: item.url,
        defaultScale: item.scale,
      },
    ])
  ).values(),
]

const configuredModels = new Set(
  CONFIGURED_OBJECT_CATALOG.map((item) => item.model)
)
const modelPaths = typeof __MODEL_PATHS__ === 'undefined'
  ? []
  : __MODEL_PATHS__

function modelName(model: string): string {
  return model
    .split('/')
    .at(-1)
    ?.replace(/\.glb$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || model
}

export const SCENE_OBJECT_CATALOG: SceneObjectCatalogItem[] = [
  ...CONFIGURED_OBJECT_CATALOG,
  ...modelPaths
    .filter((model) => !configuredModels.has(model))
    .map((model) => ({
      model,
      name: modelName(model),
      catalogGroup: 'Все модели из папки models',
      defaultScale: 1,
    })),
]

export function expandSceneObjects(objects: SceneObject[]) {
  return LOOP_COPIES.flatMap((cycle) =>
    objects.map((item) => ({
      id: `${item.id}@${cycle}`,
      categoryKey: item.categoryKey ?? 'scene-object',
      name: item.name,
      model: item.model,
      url: item.url ?? '',
      position: [
        item.position[0] + cycle * LOOP_WIDTH,
        item.elevation,
        item.position[1],
      ] as [number, number, number],
      scale: item.scale,
      rotationY: item.rotation,
    }))
  )
}