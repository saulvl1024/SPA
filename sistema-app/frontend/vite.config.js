import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 (IPv4 explícito) evita el ECONNRESET por resolución IPv6 (::1) de "localhost"
      '/api': { target: 'http://127.0.0.1:4001', changeOrigin: true },
    },
  },
  build: {
    // Separa las librerías de terceros en chunks propios: el navegador los cachea
    // entre despliegues (cambian poco), así solo re-descarga el código de la app.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'datepicker': ['react-day-picker', 'date-fns'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
