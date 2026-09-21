export type EnvironmentModelConfig = {
  id: string
  model: string
  position: [number, number, number]
  scale?: number
  rotationY?: number
  animation?: string
}

const PEOPLE: EnvironmentModelConfig[] = [
  {
    id: 'person-woman-01',
    model: '/models/person-woman.glb',
    position: [-18.1, 0, 0.4],
    scale: 0.65,
    rotationY: -55,
  },

]

export const PROPS: EnvironmentModelConfig[] = [
  {
    id: 'drova',
    model: '/models/drova.glb',
    position: [2.5, 0, -1],
    scale: 0.46,
    rotationY: 90,
  },
  {
    id: 'bic',
    model: '/models/bicycle.glb',
    position: [-33.6, 0, 1.33],
    scale: 0.6,
    rotationY: 0,
  },
  {
    id: 'trash',
    model: '/models/trash.glb',
    position: [14.3, 0, -1],
    scale: 0.56,
    rotationY: 0,
  },
  {
    id: 'lage',
    model: '/models/lage.glb',
    position: [8.7, 0, -0.4],
    scale: 0.7,
    rotationY: 0,
  },
  {
    id: 'locker-room',
    model: '/models/outdoor.glb',
    position: [6.15, 0, 0],
    scale: 0.7,
    rotationY: 0,
  },
]

export const ENVIRONMENT_MODELS: EnvironmentModelConfig[] = [
  ...PEOPLE,
]
