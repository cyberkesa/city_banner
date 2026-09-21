import * as THREE from 'three'
import { resolveModelPath } from './model-path'

export function isLanternModel(path: string): boolean {
  return ['/models/admiral3.glb', '/models/lantern-1.glb'].includes(resolveModelPath(path))
}

export function isLanternGlass(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return material instanceof THREE.MeshStandardMaterial && material.name === '[Translucent_Glass_Blue]'
}

export function createLanternGlass(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = source.clone()
  // The clone is disposed separately from the cached material.
  material.userData = {}
  return material
}

/** Per-instance glass emission. */
export function installInstancedLanternGlow(mesh: THREE.InstancedMesh): void {
  if (Array.isArray(mesh.material) || !isLanternGlass(mesh.material)) return
  const material = createLanternGlass(mesh.material)
  mesh.geometry = mesh.geometry.clone()
  mesh.geometry.userData = {}
  mesh.geometry.setAttribute('lanternGlow', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1))
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float lanternGlow;\nvarying float vLanternGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLanternGlow = lanternGlow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLanternGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.65, 0.28) * 6.0 * vLanternGlow;')
  }
  material.customProgramCacheKey = () => 'lantern-glass-glow-v2'
  mesh.material = material
}

/** Billboard halo with depth testing. */
export function createLanternHalo(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        float edge = 1.0 - smoothstep(0.7, 1.0, r);
        float halo = exp(-5.0 * r * r) * 0.38;
        float core = exp(-65.0 * r * r) * 0.9;
        vec3 color = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.88, 0.57), exp(-18.0 * r * r));
        gl_FragColor = vec4(color, (halo + core) * edge);
      }
    `,
  })
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  halo.name = 'lantern-halo'
  halo.visible = false
  halo.frustumCulled = false
  halo.raycast = () => {}
  return halo
}

export function setInstancedLanternGlow(mesh: THREE.InstancedMesh, instanceId: number, enabled: boolean): void {
  const attribute = mesh.geometry.getAttribute('lanternGlow')
  if (!attribute) return
  attribute.setX(instanceId, enabled ? 1 : 0)
  attribute.needsUpdate = true
}
