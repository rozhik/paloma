import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The face-api models face detection uses: detector, landmarks and the 128-number face descriptors. */
const FACE_MODELS = ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']
  .flatMap((name) => [`${name}-weights_manifest.json`, `${name}.bin`]);

/**
 * Serves the face-api model files at `/face-models/` in development and copies them there in the build. The
 * browser loads them only when face detection or Similar faces is first used.
 */
function faceModels(): Plugin {
  const modelDir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vladmandic/face-api/package.json')), 'model');
  return {
    name: 'paloma-face-models',
    configureServer(server) {
      server.middlewares.use('/face-models', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
        if (!FACE_MODELS.includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(path.join(modelDir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of FACE_MODELS) {
        this.emitFile({ type: 'asset', fileName: `face-models/${name}`, source: fs.readFileSync(path.join(modelDir, name)) });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const clientPort = Number(env.CLIENT_PORT) || 3000;
  const serverPort = Number(env.PORT) || 3001;

  return {
    plugins: [react(), faceModels()],
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
