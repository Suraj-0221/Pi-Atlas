import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  return {
    server: {
      port: 5173,
      host: '127.0.0.1'
    },
    worker: {
      format: 'es'
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          ...(!isProd ? { revealDemo: resolve(__dirname, 'reveal-demo.html') } : {})
        }
      }
    }
  };
});
