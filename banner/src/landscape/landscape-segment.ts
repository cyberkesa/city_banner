import * as THREE from 'three'

import { createLandscapeMaterials } from './landscape-materials'
import {
  createSurfaceMesh,
  surfaceLayerY,
} from './landscape-surfaces'
import {
  createGrassBorder,
  createRubberOutline,
} from './landscape-borders'
import {
  createPolygonShape,
  pathOutline,
  sampleSurfacePoints,
} from './landscape-shapes'
import { createSimpleGrassBlades } from './procedural-grass-blades'
import type {
  LandscapeMap,
} from './landscape-schema'
import { createVegetationObjects } from './landscape-vegetation'
import type { StaticInstanceTemplate } from '../models/static-instancing'
import { yieldToMainThread } from '../core/frame-scheduler'
import { resolveVegetationInBackground } from './landscape-worker-client'
import type { ResolvedVegetation } from './vegetation-layout'
export async function createLandscapeSegment(
  map: LandscapeMap
): Promise<{
  segment: THREE.Group
  vegetationTemplates: Map<string, StaticInstanceTemplate>
  resolvedVegetation: ResolvedVegetation[]
}> {
  const segment =
    new THREE.Group()

  segment.name = 'landscape:segment'

  const materials =
    createLandscapeMaterials()

  const resolvedVegetationPromise = resolveVegetationInBackground(map)

  const detailedGrassIds = new Set(['park-lawn'])
  const grassPromises: Promise<THREE.InstancedMesh>[] = []

  for (const [index, surface] of map.surfaces.entries()) {
    const shape =
      createPolygonShape(
        sampleSurfacePoints(surface),
        surface.handles.some((handle) => handle.incoming || handle.outgoing)
          ? 0
          : surface.cornerRadius
      )

    segment.add(
      createSurfaceMesh(
        shape,
        materials[surface.material],
        surfaceLayerY(index),
        `landscape:surface:${surface.id}`
      )
    )

    if (
      surface.material === 'grass' ||
      surface.material === 'sand'
    ) {
      segment.add(
        createGrassBorder(
          shape,
          surfaceLayerY(index),
          `landscape:${surface.material}-border:${surface.id}`
        )
      )
    }

    if (
      surface.material === 'rubber-red' ||
      surface.material === 'rubber-gray'
    ) {
      segment.add(
        createRubberOutline(
          shape,
          surfaceLayerY(index),
          `landscape:rubber-outline:${surface.id}`
        )
      )
    }

    if (surface.material === 'grass' && detailedGrassIds.has(surface.id)) {
      grassPromises.push(
        createSimpleGrassBlades(sampleSurfacePoints(surface), {
          density: 30,
          maxInstances: 6000,
          y: surfaceLayerY(index) + 0.004,
        })
      )
    }

    if (index % 4 === 3) await yieldToMainThread()
  }

  for (const [index, path] of map.paths.entries()) {
    const outline =
      pathOutline(path)

    if (outline.length < 3) {
      continue
    }

    segment.add(
      createSurfaceMesh(
        createPolygonShape(outline),
        materials[path.material],
        surfaceLayerY(map.surfaces.length + index),
        `landscape:path:${path.id}`
      )
    )
    if (index % 4 === 3) await yieldToMainThread()
  }

  const resolvedVegetation = await resolvedVegetationPromise
  const vegetation = await createVegetationObjects(map, resolvedVegetation)

  segment.add(...vegetation.objects)

  if (grassPromises.length > 0) {
    const grassMeshes = await Promise.all(grassPromises)
    for (const mesh of grassMeshes) {
      segment.add(mesh)
    }
  }

  return {
    segment,
    vegetationTemplates: vegetation.templates,
    resolvedVegetation,
  }
}
