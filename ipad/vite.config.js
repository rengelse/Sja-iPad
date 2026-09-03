import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      // Shared source files live outside /ipad. Resolve pdf-lib explicitly from
      // the iPad workspace so Vite/Rolldown does not search from /src/shared.
      'pdf-lib': path.resolve(dir, 'node_modules/pdf-lib/es/index.js')
    }
  },
  server: {
    fs: {
      allow: [path.resolve(dir, '..')]
    }
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
