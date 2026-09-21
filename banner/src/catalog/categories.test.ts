import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { CategoryManager } from './categories'
import type { CategoryConfig } from './categories.config'

function config(id: string, x = 0): CategoryConfig {
  return {
    id: `${id}@0`,
    categoryKey: 'bike-parking',
    name: id,
    model: '/models/bike-parking-1.glb',
    url: '',
    position: [x, 0, 0],
    scale: 1,
    rotationY: 0,
  }
}

function pick(manager: CategoryManager, world: THREE.Group, x: number) {
  world.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 0.53, 3),
    new THREE.Vector3(0, 0, -1),
  )
  const hit = ray.intersectObjects(manager.meshes, false)[0]
  expect(hit).toBeDefined()
  return manager.findCategory(hit.object, hit.instanceId)
}

describe('CategoryManager picking', () => {
  it('selects and moves the whole model when clicking one of its internal instances', () => {
    const source = new THREE.Group()
    const parts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2,
    )
    parts.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1, 0, 0))
    parts.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0))
    source.add(parts)
    const world = new THREE.Group()
    const manager = new CategoryManager(world)

    try {
      const [category] = manager.commitPrepared([{
        path: '/models/bike-parking-1.glb',
        configs: [config('rack')], template: source, error: null,
      }])
      expect(pick(manager, world, -1)).toBe(category)
      expect(pick(manager, world, 1)).toBe(category)

      manager.updateSceneObject({
        id: 'rack', name: 'rack', model: '/models/bike-parking-1.glb',
        position: [3, 0], elevation: 0, scale: 1, rotation: 0,
      })
      expect(pick(manager, world, 2)).toBe(category)
      expect(pick(manager, world, 4)).toBe(category)
    } finally {
      manager.dispose()
    }
  })

  it('still distinguishes separate categories batched into one instanced mesh', () => {
    const source = new THREE.Group()
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
    const world = new THREE.Group()
    const manager = new CategoryManager(world)

    try {
      const [first, second] = manager.commitPrepared([{
        path: '/models/bench.glb',
        configs: [config('first', -2), config('second', 2)],
        template: source, error: null,
      }])
      expect(first.instanced).toBeDefined()
      expect(pick(manager, world, -2)).toBe(first)
      expect(pick(manager, world, 2)).toBe(second)
    } finally {
      manager.dispose()
    }
  })
})
