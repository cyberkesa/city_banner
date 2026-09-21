import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CategoryManager } from '../catalog/categories'

describe('lantern hover', () => {
  it.each([1, 2])('lights only the hovered glass with %i model copies', (count) => {
    const source = new THREE.Group()
    const glass = new THREE.MeshStandardMaterial({ emissive: 0x102030, emissiveIntensity: 0.2 })
    glass.name = '[Translucent_Glass_Blue]'
    const metal = new THREE.MeshStandardMaterial({ color: 0x222222 })
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), glass))
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), metal))
    const manager = new CategoryManager(new THREE.Group())
    const categories = manager.commitPrepared([{
      path: '/models/admiral3.glb', template: source, error: null,
      configs: Array.from({ length: count }, (_, i) => ({
        id: `lamp-${i}`, categoryKey: 'lighting', name: 'Lamp', model: '/models/admiral3.glb',
        url: 'https://example.com', position: [i * 3, 0, 0] as [number, number, number], scale: 1,
      })),
    }])
    try {
      const category = categories[0]
      manager.setColor(category, true)
      expect(category.lanternHalos).toHaveLength(1)
      expect(category.lanternHalos![0].visible).toBe(true)
      if (categories[1]) expect(categories[1].lanternHalos![0].visible).toBe(false)
      expect(glass.emissiveIntensity).toBe(0.2)
      expect(metal.emissiveIntensity).toBe(1)
      if (category.instanced) {
        const [lit, unlit] = category.instanced.bindings
        const switches = lit.mesh.geometry.getAttribute('lanternGlow')
        expect(switches.getX(0)).toBe(1)
        expect(switches.getX(1)).toBe(0)
        expect(unlit.mesh.geometry.hasAttribute('lanternGlow')).toBe(false)
        const color = new THREE.Color()
        unlit.mesh.getColorAt(0, color)
        expect(color.r).toBeCloseTo(new THREE.Color(0xd0d0d0).r)
        manager.setColor(category, false)
        expect(switches.getX(0)).toBe(0)
      } else {
        const material = category.lanternGlass![0].material
        expect(material.emissiveIntensity).toBe(6)
        expect(material).not.toBe(glass)
        manager.setColor(category, false)
        expect(material.emissiveIntensity).toBe(0.2)
        expect(material.emissive.equals(glass.emissive)).toBe(true)
      }
      expect(category.lanternHalos![0].visible).toBe(false)
    } finally {
      manager.dispose()
    }
  })
})
