import * as THREE from 'three'
import { isLanternGlass } from './lantern-glow'

/** Shadow-weighted diffuse fill; does not modify emission. */
export function installObjectHighlight(mesh: THREE.Mesh, perInstance = false): (enabled: boolean, instanceId?: number) => void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const supportsHighlight = (material: THREE.Material): boolean => material instanceof THREE.MeshStandardMaterial && !isLanternGlass(material)
  if (!materials.some(supportsHighlight)) return () => {}
  const strength = { value: 0 }
  const attribute = perInstance
    ? new THREE.InstancedBufferAttribute(new Float32Array((mesh as THREE.InstancedMesh).count), 1)
    : null
  if (attribute) {
    mesh.geometry = mesh.geometry.clone()
    mesh.geometry.userData = {}
    mesh.geometry.setAttribute('objectHighlight', attribute)
  }

  const prepare = (source: THREE.Material): THREE.Material => {
    if (!supportsHighlight(source)) return source
    const material = source.clone()
    material.userData = {}
    const previousCompile = source.onBeforeCompile
    const previousKey = source.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer)
      if (attribute) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float objectHighlight;\nvarying float vObjectHighlight;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjectHighlight = objectHighlight;')
      } else {
        shader.uniforms.objectHighlight = strength
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + (attribute ? 'varying float vObjectHighlight;' : 'uniform float objectHighlight;'))
        .replace('#include <lights_fragment_end>', `
          #if defined( RE_IndirectDiffuse )
            vec3 surfaceLighting = reflectedLight.directDiffuse / max(diffuseColor.rgb, vec3(0.04));
            float fillShadow = 1.0 - smoothstep(0.05, 0.45, dot(surfaceLighting, vec3(0.2126, 0.7152, 0.0722)));
            float fillFacing = 0.35 + 0.65 * max(dot(geometryNormal, normalize(vec3(0.3, 0.7, 1.0))), 0.0);
            irradiance += vec3(0.20, 0.19, 0.17) * fillShadow * fillFacing * ${attribute ? 'vObjectHighlight' : 'objectHighlight'};
          #endif
          #include <lights_fragment_end>
        `)
    }
    material.customProgramCacheKey = () => `${previousKey}:object-fill-v2:${perInstance}`
    return material
  }
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material)
  return (enabled, instanceId = 0) => {
    if (attribute) {
      attribute.setX(instanceId, enabled ? 1 : 0)
      attribute.needsUpdate = true
    } else {
      strength.value = enabled ? 1 : 0
    }
  }
}
