import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { defineConfig } from 'vite'
import { sites } from '@openai/sites-vite-plugin'

import { modelCatalogWatcherPlugin } from './build/model-catalog-plugin.ts'

export default defineConfig(async () => {
  const { cloudflare } =
    await import('@cloudflare/vite-plugin')
  const projectRoot = process.cwd()

  return {
    publicDir: resolve(projectRoot, 'banner/public'),
    plugins: [
      existsSync(resolve(projectRoot, '.openai/hosting.json')) ? sites() : null,
      modelCatalogWatcherPlugin(projectRoot),
      cloudflare({
        viteEnvironment: { name: 'server' },
      }),
    ],
  }
})
