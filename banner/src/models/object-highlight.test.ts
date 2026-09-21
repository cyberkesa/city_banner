import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { installObjectHighlight } from './object-highlight'

function compile(material: THREE.Material) {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {} as Record<string, THREE.IUniform>,
  }
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer)
  return shader
}

describe('surface highlighting', () => {
  it('highlights only the selected instance and restores it on pointer leave', () => {
    const geometry = new THREE.BoxGeometry()
    const source = new THREE.MeshStandardMaterial()
    const mesh = new THREE.InstancedMesh(geometry, source, 2)
    const set = installObjectHighlight(mesh, true)
    const attribute = mesh.geometry.getAttribute('objectHighlight')
    set(true, 1)
    expect(attribute.getX(0)).toBe(0)
    expect(attribute.getX(1)).toBe(1)
    expect(geometry.hasAttribute('objectHighlight')).toBe(false)
    expect(mesh.material).not.toBe(source)
    set(false, 1)
    expect(attribute.getX(1)).toBe(0)
    const shader = compile(mesh.material as THREE.Material)
    expect(shader.vertexShader).toContain('vObjectHighlight = objectHighlight;')
    expect(shader.fragmentShader).toContain('* vObjectHighlight;')
    expect(shader.fragmentShader).toContain('irradiance +=')
    expect(shader.fragmentShader).toContain('fillShadow * fillFacing')
    expect(shader.fragmentShader).not.toContain('totalEmissiveRadiance +=')
  })

  it('isolates ordinary models sharing a material and preserves their original emission', () => {
    const source = new THREE.MeshStandardMaterial({ emissive: 0x223344, emissiveIntensity: 0.7 })
    const first = new THREE.Mesh(new THREE.BoxGeometry(), source)
    const second = new THREE.Mesh(first.geometry, source)
    const set = installObjectHighlight(first)
    installObjectHighlight(second)
    const firstShader = compile(first.material)
    const secondShader = compile(second.material)
    set(true)
    expect(firstShader.uniforms.objectHighlight.value).toBe(1)
    expect(secondShader.uniforms.objectHighlight.value).toBe(0)
    expect(first.material.emissive.equals(source.emissive)).toBe(true)
    expect(first.material.emissiveIntensity).toBe(0.7)
    set(false)
    expect(firstShader.uniforms.objectHighlight.value).toBe(0)
  })
})
