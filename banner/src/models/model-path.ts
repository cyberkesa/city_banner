const MODEL_PATH_ALIASES: Readonly<Record<string, string>> = {
  '/models/5.glb': '/models/pergola.glb',
  '/models/7.glb': '/models/garden-furniture.glb',
  '/models/13.glb': '/models/model_wood_beige.glb',
  '/models/terrace-furniture.glb': '/models/model_wood_beige.glb',
  '/models/(14) fonar.glb': '/models/lantern-1.glb',
  '/models/(15) R_05-1200kh1200.glb': '/models/tree-grate-1.glb',
  '/models/16.glb': '/models/sign.glb',
  '/models/(17) tehno.glb': '/models/bike-parking-1.glb',
  '/models/(18) peshka-standart.glb': '/models/bollard-standart.glb',
  '/models/22.glb': '/models/ac-basket.glb',
  '/models/25.glb': '/models/locker-bench.glb',
  '/models/27.glb': '/models/ski-rack.glb',
  '/models/28.glb': '/models/firewood.glb',
}

export function resolveModelPath(path: string): string {
  return MODEL_PATH_ALIASES[path] ?? path
}
