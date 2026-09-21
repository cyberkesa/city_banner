import * as THREE from 'three'

export type GrassMaterialOptions = {
  repeat?: number
  tint?: THREE.ColorRepresentation
  normalStrength?: number
}


const textureCache = new Map<string, THREE.Texture>()

function getGrassTexture(
  fileName: string,
  repeat: number,
  isSRGB = false,
  manager?: THREE.LoadingManager
): THREE.Texture {
  const cacheKey = `${fileName}_${repeat}_${isSRGB}`

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!
  }

  const loader = new THREE.TextureLoader(manager)
  const texture = loader.load(`/textures/grass/${fileName}`)

  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.setScalar(repeat)
  texture.anisotropy = 8
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter

  if (isSRGB) {
    texture.colorSpace = THREE.SRGBColorSpace
  }

  textureCache.set(cacheKey, texture)
  return texture
}


export function createGrassMaterial(
  options: GrassMaterialOptions = {},
  manager?: THREE.LoadingManager
): THREE.MeshStandardMaterial {
  const repeat = options.repeat ?? 1.15
  const normalStrength = options.normalStrength ?? 0.28

  const map = getGrassTexture('color.png', repeat, true, manager)
  const normalMap = getGrassTexture('normal.png', repeat, false, manager)
  const roughnessMap = getGrassTexture('roughness.png', repeat, false, manager)

  const material = new THREE.MeshStandardMaterial({
    color: options.tint ?? 0xb7c3ad,
    map,
    normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap,
    roughness: 0.96,
    metalness: 0,
    
  })

  return material
}


export function disposeGrassTextures(): void {
  for (const texture of textureCache.values()) {
    texture.dispose()
  }
  textureCache.clear()
}