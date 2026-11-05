import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'virtual:botiq-demo': path.resolve(__dirname, 'src/demo-stub.ts') } },
  define: { __STANDALONE__: 'false', __DEMO_PASSWORD__: '""' },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist', sourcemap: false },
});
