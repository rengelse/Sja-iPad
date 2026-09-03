import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base:'./',
  server:{fs:{allow:[path.resolve(dir,'..')]}},
  build:{target:'es2022',outDir:'dist',emptyOutDir:true,sourcemap:false}
});
