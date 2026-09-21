import {
  rename,
  writeFile,
} from 'node:fs/promises'
import { resolve } from 'node:path'

import { defineConfig, type Plugin } from 'vite'

import { parseLandscapeMap } from '../banner/src/landscape/landscape-schema.ts'
import { modelCatalogWatcherPlugin } from '../build/model-catalog-plugin.ts'

const MAX_MAP_SIZE = 2 * 1024 * 1024

function readRequestBody(
  request: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > MAX_MAP_SIZE) {
        reject(new Error('Карта превышает допустимый размер'))
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => {
      resolveBody(Buffer.concat(chunks).toString('utf8'))
    })

    request.on('error', reject)
  })
}

function landscapeMapSavePlugin(projectRoot: string): Plugin {
  return {
    name: 'local-landscape-map-save',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use(
        '/__landscape/save',
        async (request, response, next) => {
          if (request.method !== 'POST') {
            next()
            return
          }

          response.setHeader(
            'Content-Type',
            'application/json; charset=utf-8'
          )

          try {
            const raw = await readRequestBody(request)
            const map = parseLandscapeMap(
              JSON.parse(raw) as unknown
            )
            const target = resolve(
              projectRoot,
              'banner/public/landscape-map.json'
            )
            const temporary = `${target}.tmp`

            await writeFile(
              temporary,
              `${JSON.stringify(map, null, 2)}\n`,
              'utf8'
            )
            await rename(temporary, target)

            response.statusCode = 200
            response.end(JSON.stringify({
              ok: true,
              file: 'banner/public/landscape-map.json',
            }))
          } catch (error) {
            response.statusCode = 400
            response.end(JSON.stringify({
              ok: false,
              error: error instanceof Error
                ? error.message
                : 'Не удалось сохранить карту',
            }))
          }
        }
      )
    },
  }
}

export default defineConfig(() => {
  const projectRoot = process.cwd()

  return {
    root: projectRoot,
    publicDir: resolve(projectRoot, 'banner/public'),
    plugins: [
      modelCatalogWatcherPlugin(projectRoot),
      landscapeMapSavePlugin(projectRoot),
    ],
    server: {
      fs: {
        allow: [projectRoot],
      },
    },
  }
})
