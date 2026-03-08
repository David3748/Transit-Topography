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
  // GitHub Pages needs /Transit-Topography/ base; Netlify uses /.
  // Set VITE_BASE_URL env var to override (GitHub Actions workflow sets it).
  base: command === 'build' ? (process.env.VITE_BASE_URL || '/') : '/',
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
