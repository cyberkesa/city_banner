import * as THREE from 'three'

import { createPRNG } from '../core/random'
import { pointInPolygonXY } from './landscape-geometry'
import type { GrassPoint } from './procedural-grass-layout'

export function createSimpleGrassBlades(
  points: readonly GrassPoint[],
  options: { density?: number; maxInstances?: number; y?: number; seed?: number } = {}
): Promise<THREE.InstancedMesh> {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]
    if (x < minX) minX = x; else if (x > maxX) maxX = x
    if (z < minZ) minZ = z; else if (z > maxZ) maxZ = z
  }

  const area = (maxX - minX) * (maxZ - minZ)
  const count = Math.min(options.maxInstances ?? 500, Math.max(1, Math.round(area * (options.density ?? 10))))

  const geo = new THREE.PlaneGeometry(0.12, 0.04)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a9a3e, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.castShadow = false
  mesh.receiveShadow = true

  const posY = options.y ?? 0.029
  const _mat = new THREE.Matrix4()
  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _scale = new THREE.Vector3()
  const _axis = new THREE.Vector3(0, 1, 0)

  let placed = 0
  let attempts = 0
  const maxAttempts = count * 20
  const rand = createPRNG(options.seed ?? 5171)

  while (placed < count && attempts < maxAttempts) {
    attempts++
    const x = minX + rand() * (maxX - minX)
    const z = minZ + rand() * (maxZ - minZ)
    if (!pointInPolygonXY(x, z, points)) continue

    _pos.set(x, posY, z)
    _quat.setFromAxisAngle(_axis, rand() * Math.PI * 2)
    const s = 0.6 + rand() * 0.8
    _scale.set(s, s, s)
    _mat.compose(_pos, _quat, _scale)
    mesh.setMatrixAt(placed, _mat)
    placed++
  }

  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  mesh.name = 'landscape:simple-grass'

  const centerX = (minX + maxX) * 0.5
  const centerZ = (minZ + maxZ) * 0.5
  const radius = Math.hypot(maxX - minX, maxZ - minZ) * 0.5
  mesh.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(centerX, posY + 0.02, centerZ),
    radius + 0.1
  )
  mesh.frustumCulled = true

  return Promise.resolve(mesh)
}
