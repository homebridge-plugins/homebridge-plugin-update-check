import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      'dist/**',
      'node_modules/**',
      '**/coverage/**',
      '.git/**',
      'docs/**',
    ],
  },
})
