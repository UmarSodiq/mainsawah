import { defineConfig } from 'vite';

// GLSL files are imported with the built-in `?raw` suffix, so no plugin is needed.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
