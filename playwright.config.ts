import { defineConfig, devices } from '@playwright/test'

const now = new Date()
const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`

// Specs already honour PLAYWRIGHT_BASE_URL for their direct fetch() calls, so the
// config has to agree with them — otherwise page.goto() and fetch() split across
// two ports, and reuseExistingServer can silently adopt an unrelated app on 3000.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  globalTeardown: './e2e/global-teardown.ts',
  testDir: './e2e',
  // fullyParallel:false only serialises tests *within* a file — separate spec files still
  // run concurrently across workers. These specs share one database and provision schools
  // with overlapping state, so cross-file parallelism produced failures that vanish on a
  // serial run. Until the specs are isolated per-schema, one worker is the honest setting.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: `test-results/${timestamp}/html-report` }], ['list']],
  outputDir: `test-results/${timestamp}/artifacts`,
  use: {
    baseURL: BASE_URL,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'workflow',
      testMatch: /workflow-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /workflow-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // Next.js cold start + first-request DB migrations
  },
})
