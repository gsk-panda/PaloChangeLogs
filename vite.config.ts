import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  const panoramaHost = env.PANORAMA_HOST || 'panorama.officeours.com';
  const panoramaUrl = panoramaHost.startsWith('http') ? panoramaHost : `https://${panoramaHost}`;

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.PANORAMA_API_KEY': JSON.stringify(env.PANORAMA_API_KEY || ''),
    },
    server: {
      proxy: {
        '/panorama-proxy': {
          target: panoramaUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/panorama-proxy/, ''),
          followRedirects: true,
        }
      }
    }
  };
});