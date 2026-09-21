import * as THREE from 'three'
import { LOOP_WIDTH } from '../core/loop'

const textureLoader = new THREE.TextureLoader()

function loadTex(path: string, sRGB = false, repeat = 0.6): THREE.Texture {
  const t = textureLoader.load(path)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.setScalar(repeat)
  t.anisotropy = 8
  if (sRGB) t.colorSpace = THREE.SRGBColorSpace
  return t
}

const asphaltColor = loadTex('/textures/asphalt/color.webp', true)
const asphaltNormal = loadTex('/textures/asphalt/normal.webp')
const asphaltRoughness = loadTex('/textures/asphalt/roughness.webp')

const pavingRepeat = 16 / LOOP_WIDTH
const pavingEdgeColor = loadTex('/textures/sidewalk/edge-color.webp', true, pavingRepeat)
const pavingNormal = loadTex('/textures/sidewalk/normal.webp', false, pavingRepeat)
const pavingRoughness = loadTex('/textures/sidewalk/roughness.webp', false, pavingRepeat)

function makePavingMaterial(colorMap: THREE.Texture | null, tint = 0xffffff, granite = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: tint,
    map: granite ? null : colorMap,
    normalMap: granite ? null : pavingNormal,
    normalScale: new THREE.Vector2(granite ? 0.34 : 0.1, granite ? 0.34 : 0.1),
    roughnessMap: granite ? null : pavingRoughness,
    roughness: granite ? 0.94 : 1,
    metalness: 0,
  })

  if (granite) {
    material.customProgramCacheKey = () => 'granite-sidewalk-v2'
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPavingPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPavingPos = position;')

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vPavingPos;

           float pHash(vec2 p) {
             p = fract(p * vec2(123.34, 345.45));
             p += dot(p, p + 34.345);
             return fract(p.x * p.y);
           }

           const vec2 INV_TILE = vec2(1.3888889, 2.7777778);
           const vec2 TILE_SIZE = vec2(0.72, 0.36);

           vec4 pTileData(vec2 pos) {
             float row = floor((pos.y + 1000.0) * INV_TILE.y);
             float offset = mod(row, 2.0) * 0.36;
             vec2 local = fract(vec2(pos.x + 1000.0 + offset, pos.y + 1000.0) * INV_TILE);
             float col = floor((pos.x + 1000.0 + offset) * INV_TILE.x);
             return vec4(local, col, row);
           }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           vec4 tile = pTileData(vPavingPos.xz);
           vec2 local = tile.xy;

           vec2 edgeDist = min(local, 1.0 - local) * TILE_SIZE;
           float minEdge = min(edgeDist.x, edgeDist.y);

           float jointAa = max(fwidth(minEdge), 0.0008);
           float joint = 1.0 - smoothstep(0.0065 - jointAa, 0.0065 + jointAa, minEdge);
           float jointBevel = max(0.0, joint - smoothstep(0.72, 0.98, joint));

           float leftB = 1.0 - smoothstep(0.025, 0.065, local.x * 0.72);
           float topB = 1.0 - smoothstep(0.025, 0.055, local.y * 0.36);
           float rightB = 1.0 - smoothstep(0.025, 0.065, (1.0 - local.x) * 0.72);
           float bottomB = 1.0 - smoothstep(0.025, 0.055, (1.0 - local.y) * 0.36);

           float litEdge = max(leftB, topB) * (1.0 - joint);
           float darkEdge = max(rightB, bottomB) * (1.0 - joint);

           float tone = pHash(tile.zw + 71.3);
           vec2 grainUv = vPavingPos.xz * 95.0;
           vec2 cell = floor(grainUv);
           float grain = pHash(cell);
           float speck = smoothstep(0.975, 1.0, pHash(cell * 1.73 + 19.4));

           // Filter sub-pixel paving detail to suppress moire.
           float grainFootprint = max(length(dFdx(grainUv)), length(dFdy(grainUv)));
           float detailFade = 1.0 - smoothstep(0.32, 0.9, grainFootprint);
           grain = mix(0.5, grain, detailFade);
           speck *= detailFade;

           float factor = (1.0 - joint * 0.54)
                        * (1.0 + jointBevel * 0.13)
                        * (1.0 + litEdge * 0.09 - darkEdge * 0.11)
                        * (0.965 + tone * 0.07)
                        * (0.91 + grain * 0.14)
                        * (1.0 - speck * 0.16);

           diffuseColor.rgb *= factor;`
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
           float reliefJoint = 1.0 - smoothstep(0.003, 0.028, minEdge);
           float reliefH = (1.0 - reliefJoint) * 0.010 + (grain - 0.5) * 0.0007 * detailFade;

           vec3 reliefPos = vec3(vPavingPos.x, reliefH, vPavingPos.z);
           vec3 reliefN = normalize(cross(dFdx(reliefPos), dFdy(reliefPos)));
           vec3 viewN = normalize(mat3(viewMatrix) * reliefN);

           if (dot(viewN, normal) < 0.0) viewN = -viewN;
           normal = normalize(mix(normal, viewN, 0.76));`
        )
    }
  }

  return material
}

export const STREET_MATERIALS = {
  sidewalk: makePavingMaterial(null, 0x979694, true),
  sidewalkEdge: makePavingMaterial(pavingEdgeColor, 0xb8b5ae),
  road: new THREE.MeshStandardMaterial({
    color: 0xfaf8f4,
    map: asphaltColor,
    normalMap: asphaltNormal,
    normalScale: new THREE.Vector2(0.12, 0.12),
    roughnessMap: asphaltRoughness,
    roughness: 1,
    metalness: 0,
  }),
  curb: new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.94, metalness: 0 }),
  marking: new THREE.MeshStandardMaterial({ color: 0xf3f1ed, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
  markingYellow: new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
}
