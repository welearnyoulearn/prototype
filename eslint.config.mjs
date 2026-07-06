import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright trace/report output — large vendor JS files cause ESLint OOM
    "test-results/**",
    "playwright-report/**",
    // Claude agent worktree copies — not part of the project source
    ".claude/**",
  ]),
]);

export default eslintConfig;
