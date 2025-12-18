import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@repo': resolve(__dirname, '../../packages'),
    },
  },
  json: {
    stringify: true,
  },
  define: {
    global: 'globalThis',
  },
});
