# Vitest Unit Testing

## Install

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

## Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], include: ['src/**/*.{test,spec}.{ts,tsx}'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

## What to Test: utility functions, hooks, business logic, stores, validation schemas
## Don't Test: UI layout, CSS, third-party libraries, simple components with no logic

## Scripts

```json
{ "test": "vitest", "test:run": "vitest run", "test:coverage": "vitest run --coverage" }
```
