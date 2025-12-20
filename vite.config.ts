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
        secure: false,
        rewrite: (path) => path.replace(/^\/panorama-proxy/, ''),
        followRedirects: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/panorama-proxy': {
        target: 'https://panorama.officeours.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/panorama-proxy/, ''),
        followRedirects: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
    allowedHosts: [
      'panovision.officeours.com',
      'localhost',
      '.officeours.com'
    ]
  }
});