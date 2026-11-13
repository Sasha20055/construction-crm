import { defineConfig, devices } from '@playwright/test';
const pages = process.env.CRM_PAGES_TEST === '1';
export default defineConfig({
  testDir: pages
    ? './tests/pages'
    : process.env.CRM_LIVE_SUPABASE === '1'
      ? './tests/live'
      : './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
    },
  ],
  webServer: {
    command: pages ? 'node tests/pages/server.mjs' : 'npm run dev -- --port 4173 --strictPort',
    url: pages ? 'http://127.0.0.1:4173/construction-crm/' : 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env.CRM_LIVE_SUPABASE === '1'
          ? (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
          : 'e2e-public-key',
    },
  },
});
