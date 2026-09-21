import * as THREE from 'three'

import type { SurfaceMaterialId } from './landscape-schema'
import { createProceduralGrassMaterial } from './procedural-grass-material'

export type LandscapeMaterialMap = Record<SurfaceMaterialId, THREE.MeshStandardMaterial>

type NoisePalette = {
  base: [number, number, number]
}

function makeNoiseMaterial(palette: NoisePalette): THREE.MeshStandardMaterial {
  const color = (palette.base[0] << 16) | (palette.base[1] << 8) | palette.base[2]
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
}

function makePavingMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
}

function createWaveRubberMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 })

  material.customProgramCacheKey = () => 'yellow-gray-wave-rubber-v2'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRubberPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRubberPos = position;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vRubberPos;
         float rHash(vec2 p) {
           p = fract(p * vec2(123.34, 345.45));
           p += dot(p, p + 34.345);
           return fract(p.x * p.y);
         }`
      )
      .replace(
        '#include <map_fragment>',
        `vec2 pos = vRubberPos.xz;
         float warp = sin(pos.y * 0.58) * 1.15 + sin(pos.y * 1.19 + 0.8) * 0.34;
         float band = abs(fract((pos.x + warp) * 0.23809524) - 0.5) * 4.2;
         float mask = 1.0 - smoothstep(0.76, 0.98, band);
         float grain = rHash(floor(pos * 92.0));
         float speck = smoothstep(0.985, 1.0, rHash(floor(pos * 137.0) + 17.2));
         diffuseColor.rgb *= mix(vec3(0.78, 0.93, 0.17), vec3(0.42, 0.46, 0.47), mask) * ((0.96 + grain * 0.07) * (1.0 - speck * 0.12));`
      )
  }

  return material
}

export function createLandscapeMaterials(): LandscapeMaterialMap {
  return {
    grass: createProceduralGrassMaterial({ color: 0x4a7c34 }),
    soil: makeNoiseMaterial({ base: [119, 91, 65] }),
    'paving-light': makePavingMaterial(0xf2f1eb),
    'paving-gray': makePavingMaterial(0xb7b9b8),
    'paving-warm': makePavingMaterial(0xd8cabb),
    sand: makeNoiseMaterial({ base: [197, 166, 108] }),
    'rubber-red': createWaveRubberMaterial(),
    'rubber-gray': new THREE.MeshStandardMaterial({ color: 0x777b7d, roughness: 0.82, metalness: 0 }),
  }
}
