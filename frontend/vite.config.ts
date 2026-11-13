import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .version as string;

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/construction-crm/' : '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (/\/(@?react[^/]*|react-dom|scheduler)\//.test(id) && !id.includes('react-hook-form'))
            return 'react';
          if (/\/(@hookform|react-hook-form|zod)\//.test(id)) return 'forms';
          if (id.includes('@radix-ui')) return 'ui';
          if (id.includes('@tanstack')) return 'query';
        },
      },
    },
  },
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    environment: 'jsdom',
    setupFiles: ['./frontend/tests/setup.ts'],
    include: ['frontend/src/**/*.test.{ts,tsx}', 'backend/tests/database/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
}));
