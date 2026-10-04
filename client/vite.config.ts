import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const clientPort = Number(env.CLIENT_PORT) || 3000;
  const serverPort = Number(env.PORT) || 3001;

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: clientPort,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
