import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(projRoot, 'electron/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(projRoot, 'electron/preload.ts'),
      },
    },
  },
  renderer: {
    plugins: [tailwindcss(), react()],
    build: {
      // Don't wipe the output directory — avoids EPERM when Windows locks assets
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@renderer': resolve(projRoot, 'src/renderer/src'),
      },
    },
  },
})
