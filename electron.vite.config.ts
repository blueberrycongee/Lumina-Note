import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'path'
import pkg from './package.json'

const OPENCODE_SERVER_DIST = path.resolve(
  __dirname,
  'thirdparty/opencode/packages/opencode/dist/node',
)

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { include: ['electron'] },
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/main/index.ts'),
        external: ['electron'],
      },
    },
    plugins: [
      {
        name: 'lumina:virtual-opencode-server',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'virtual:opencode-server') {
            return this.resolve(path.join(OPENCODE_SERVER_DIST, 'node.js'))
          }
          return undefined
        },
      },
      {
        name: 'lumina:copy-opencode-assets',
        async writeBundle() {
          try {
            const entries = await readdir(OPENCODE_SERVER_DIST)
            const outDir = path.resolve(__dirname, 'out/main/chunks')
            await mkdir(outDir, { recursive: true })
            for (const entry of entries) {
              if (!entry.endsWith('.wasm')) continue
              await copyFile(
                path.join(OPENCODE_SERVER_DIST, entry),
                path.join(outDir, entry),
              )
            }
          } catch (err) {
            // Bundle hasn't been built yet — acceptable until code actually
            // imports virtual:opencode-server. Rollup will error loudly at
            // that point with a more useful message.
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
          }
        },
      },
    ],
  },
  preload: {
    build: {
      externalizeDeps: { include: ['electron'] },
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/preload/index.ts'),
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    define: {
      __LUMINA_APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@lumina/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/electron/**'],
      },
    },
    plugins: [react()],
  },
})
