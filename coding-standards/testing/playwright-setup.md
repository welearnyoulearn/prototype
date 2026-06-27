# Playwright E2E Testing

## Install

```bash
pnpm add -D @playwright/test
npx playwright install
```

## Config

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
```

## Selector Rules

```typescript
// GOOD - stable
await page.getByTestId('login-submit-btn').click();

// BAD - fragile (NEVER)
await page.locator('.btn-primary').click();
await page.locator('div > form > button').click();
```

## Page Object Pattern

```typescript
// tests/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/login'); }
  async login(email: string, password: string) {
    await this.page.getByTestId('login-email-input').fill(email);
    await this.page.getByTestId('login-password-input').fill(password);
    await this.page.getByTestId('login-submit-btn').click();
  }
  async expectError(msg: string) { await expect(this.page.getByTestId('login-error-text')).toContainText(msg); }
}
```

## Scripts

```json
{ "test:e2e": "playwright test", "test:e2e:ui": "playwright test --ui", "test:e2e:headed": "playwright test --headed" }
```
