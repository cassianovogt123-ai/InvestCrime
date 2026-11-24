import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // caminhos relativos: funciona no APK (Capacitor) e na web
  base: './',
  plugins: [react()],
  define: {
    // versão = número do build no GitHub (igual à release); "dev" quando roda local
    __APP_VERSION__: JSON.stringify('1.0.' + (process.env.VERSION_CODE || 'dev')),
  },
});
