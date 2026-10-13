import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Phaser alone is ~1.2 MB minified; it is loaded once, so no code splitting yet.
    chunkSizeWarningLimit: 1500,
  },
});
