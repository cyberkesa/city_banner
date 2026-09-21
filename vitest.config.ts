import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'banner/src/**/*.test.ts',
      'editors/**/*.test.ts',
    ],
  },
})
