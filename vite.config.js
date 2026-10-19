import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // L'API Express réserve 5174. Ne pas laisser Vite choisir ce port
    // automatiquement quand 5173 est déjà pris : le proxy bouclerait vers Vite.
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:5174',
      '/uploads': 'http://127.0.0.1:5174'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
