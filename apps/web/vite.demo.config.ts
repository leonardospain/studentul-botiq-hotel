// Compilación AUTÓNOMA: web + API + PostgreSQL embebido (PGlite) en el navegador. Sin servidor; datos ficticios.
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = path.resolve(__dirname, '../api/src');
const shim = (f: string) => path.join(api, 'browser/shims', f);

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { 'process.env': 'globalThis.__BOTIQ_ENV__', __STANDALONE__: 'true', __DEMO_PASSWORD__: JSON.stringify('Demo-Zanzibar-2026') },
  resolve: {
    alias: [
      { find: 'virtual:botiq-demo', replacement: path.resolve(__dirname, 'src/demo/boot.ts') },
      { find: /^node:crypto$/, replacement: shim('crypto.ts') },
      { find: /^node:util$/, replacement: shim('util.ts') },
      { find: /^node:(fs|path|url)$/, replacement: shim('node-misc.ts') },
      { find: /^pg$/, replacement: shim('pg.ts') },
    ],
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { outDir: 'dist-demo', emptyOutDir: true, target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 30000,
    // Los adaptadores de `process`/`Buffer` deben ejecutarse antes que el resto de módulos.
    rolldownOptions: { output: { strictExecutionOrder: true } } },
});
