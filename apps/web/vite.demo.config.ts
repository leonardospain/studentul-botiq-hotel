// Compilación AUTÓNOMA: web + motor de datos en JavaScript puro en el navegador. Sin servidor ni WebAssembly; datos ficticios.
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __STANDALONE__: 'true', __DEMO_PASSWORD__: JSON.stringify('Demo-Zanzibar-2026') },
  resolve: { alias: [{ find: 'virtual:botiq-demo', replacement: path.resolve(__dirname, 'src/demo/boot.ts') }] },
  build: { outDir: 'dist-demo', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
