import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  server: {
    proxy: {
      '/panorama-proxy': {
        target: 'https://panorama.officeours.com',
        changeOrigin: true,
        secure: false, // Accept self-signed certificates from Panorama
        rewrite: (path) => path.replace(/^\/panorama-proxy/, ''),
      }
    }
  }
});