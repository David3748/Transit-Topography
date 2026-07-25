import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'js/**', // legacy pre-TypeScript app, kept for reference
            'temp_*/**',
            'coverage/**',
            '__pycache__/**',
            '.claude/**',
            '.cursor/**',
            // Legacy / generated root scripts superseded by src/
            'transit_engine.js',
            'config.js',
            'config.template.js',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'tests/**/*.ts', 'vite.config.ts', 'tailwind.config.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.webworker,
            },
        },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'always'],
        },
    },
    {
        files: ['sw.js', 'scripts/**/*.mjs', 'eslint.config.js', 'postcss.config.js'],
        ...js.configs.recommended,
        languageOptions: {
            globals: {
                ...globals.serviceworker,
                ...globals.node,
            },
        },
        rules: {
            // CLI scripts and the service worker legitimately write to stdout/console
            'no-console': 'off',
        },
    }
);
