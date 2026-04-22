import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'path'
import pkg from './package.json'

const OPENCODE_SERVER_DIST = path.resolve(
  __dirname,
  'thirdparty/opencode/packages/opencode/dist/node',
)

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@lydell/node-pty': path.resolve(
          __dirname,
          'electron/main/vendor/opencode-node-pty.ts',
        ),
      },
    },
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
          if (id !== 'virtual:opencode-server') return undefined
          const bundle = path.join(OPENCODE_SERVER_DIST, 'node.js')
          if (!existsSync(bundle)) {
            this.error(
              [
                `opencode server bundle missing at ${bundle}.`,
                '',
                'First-time setup on a fresh checkout:',
                '  1. Install bun         — https://bun.sh (or `brew install oven-sh/bun/bun`)',
                '  2. Clone opencode      — git clone https://github.com/anomalyco/opencode thirdparty/opencode',
                '  3. Install its deps    — (cd thirdparty/opencode && bun install)',
                '  4. Build the bundle    — npm run opencode:bundle',
                '',
                'After that, `npm run dev` resolves virtual:opencode-server normally.',
              ].join('\n'),
            )
          }
          return this.resolve(bundle)
        },
      },
      {
        name: 'lumina:copy-opencode-assets',
        async writeBundle() {
          try {
            const entries = await readdir(OPENCODE_SERVER_DIST)
            const outDir = path.resolve(__dirname, 'out/main')
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
