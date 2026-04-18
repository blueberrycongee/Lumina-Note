import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lumina/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'electron/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
    ],
    benchmark: {
      include: ['src/**/*.bench.{ts,tsx}'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/__tests__/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'electron/**/*.test.ts',
      ],
    },
  },
});
