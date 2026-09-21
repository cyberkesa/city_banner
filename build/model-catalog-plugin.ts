import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Plugin } from 'vite'

function collectModelPaths(
  directory: string,
  prefix = ''
): string[] {
  let entries

  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }

  return entries.flatMap((entry) => {
    const relativePath = prefix
      ? `${prefix}/${entry.name}`
      : entry.name
    const absolutePath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      return collectModelPaths(absolutePath, relativePath)
    }

    return entry.isFile() && /\.glb$/i.test(entry.name)
      ? [`/models/${relativePath}`]
      : []
  }).sort((left, right) =>
    left.localeCompare(right, 'ru', { numeric: true })
  )
}

export function modelCatalogWatcherPlugin(
  projectRoot = process.cwd()
): Plugin {
  const modelsDirectory = resolve(
    projectRoot,
    'banner/public/models'
  )
  const sceneObjectsFile = resolve(
    projectRoot,
    'banner/src/catalog/scene-objects.ts'
  )

  return {
    name: 'local-model-catalog',
    enforce: 'pre',

    transform(source, id) {
      if (id.split('?')[0] !== sceneObjectsFile) {
        return null
      }

      return source.replaceAll(
        '__MODEL_PATHS__',
        JSON.stringify(collectModelPaths(modelsDirectory))
      )
    },

    configureServer(server) {
      server.watcher.add(modelsDirectory)

      const refreshCatalog = (path: string) => {
        if (
          !path.startsWith(modelsDirectory) ||
          !/\.glb$/i.test(path)
        ) {
          return
        }

        const modules =
          server.moduleGraph.getModulesByFile(sceneObjectsFile)

        for (const module of modules ?? []) {
          server.moduleGraph.invalidateModule(module)
        }

        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.on('add', refreshCatalog)
      server.watcher.on('unlink', refreshCatalog)
    },
  }
}
