/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { execSync } from 'child_process';

/** Short git hash of the build, used to version service-worker caches. */
function getBuildId(): string {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        return String(Date.now());
    }
}

/** Copy transit_data/ and the (build-versioned) service worker to dist/ on build */
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

            // Stamp the service worker with the build id so caches invalidate on deploy
            const serviceWorkerSrc = resolve(__dirname, 'sw.js');
            const serviceWorkerDest = resolve(__dirname, outDir, 'sw.js');
            if (existsSync(serviceWorkerSrc)) {
                mkdirSync(resolve(__dirname, outDir), { recursive: true });
                const source = readFileSync(serviceWorkerSrc, 'utf8');
                writeFileSync(
                    serviceWorkerDest,
                    source.replaceAll('__TT_BUILD_VERSION__', getBuildId())
                );
            }
        },
    };
}

export default defineConfig(({ command }) => ({
    // GitHub Pages needs /Transit-Topography/ base; Netlify uses /.
    // Set VITE_BASE_URL env var to override (GitHub Actions workflow sets it).
    base: command === 'build' ? process.env.VITE_BASE_URL || '/' : '/',
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
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
}));
