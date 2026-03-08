import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';

/** Copy transit_data/ and legacy scripts to dist/ on build */
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const outDir = 'dist';

      // Copy transit_data directory (fetched at runtime)
      const transitSrc = resolve(__dirname, 'transit_data');
      const transitDest = resolve(__dirname, outDir, 'transit_data');
      if (existsSync(transitSrc)) {
        cpSync(transitSrc, transitDest, { recursive: true });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Transit-Topography/' : '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  worker: {
    format: 'es',
  },
  plugins: [copyStaticAssets()],
  server: {
    open: true,
  },
}));
