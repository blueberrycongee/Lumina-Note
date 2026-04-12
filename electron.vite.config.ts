import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { include: ['electron'] },
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/main/index.ts'),
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: { include: ['electron'] },
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/preload/index.ts'),
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
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
        ignored: ['**/src-tauri/**', '**/electron/**'],
      },
    },
    plugins: [react()],
  },
})
