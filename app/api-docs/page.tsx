"use client";

import Link from "next/link";
import Script from "next/script";
import { useState } from "react";

// ponytail: Scalar from a pinned CDN build, same approach as the old Swagger UI
// page. It reads the spec's x-tagGroups (sections -> subcategories) and x-badges
// (who can call each route). Add it as a dependency if we ever self-host assets.
// The container id must not be "api-reference": the standalone build auto-mounts
// on that id and tries to parse the page HTML as a spec.
const SCALAR_SRC = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.0/dist/browser/standalone.js";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

const CUSTOM_CSS = `
  .scalar-app, .light-mode, .dark-mode {
    --scalar-font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --scalar-font-code: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --scalar-custom-header-height: 52px;
  }
  .light-mode {
    --scalar-color-accent: #1d4ed8;
    --scalar-background-1: #ffffff;
    --scalar-background-2: #f8fafc;
    --scalar-background-3: #eef2f7;
    --scalar-border-color: #e2e8f0;
  }
`;

type ScalarGlobal = { createApiReference: (el: string, cfg: Record<string, unknown>) => unknown };

const SCALAR_CONFIG = {
  theme: "default",
  layout: "modern",
  darkMode: false,
  withDefaultFonts: false,
  hideModels: true,
  defaultOpenAllTags: false,
  customCss: CUSTOM_CSS,
  // Keep the spec on our servers: no Scalar telemetry, "Ask AI" agent or MCP export.
  telemetry: false,
  agent: { disabled: true },
  mcp: { disabled: true },
};

type LoadState = "loading" | "ready" | "signin" | "error";

export default function ApiDocsPage() {
  const [state, setState] = useState<LoadState>("loading");

  // Fetch the spec ourselves so a 401 (deployments are staff-only) shows a
  // sign-in prompt instead of Scalar's "Document could not be loaded".
  async function mountReference() {
    try {
      const res = await fetch("/api/openapi", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) return setState("signin");
      if (!res.ok) return setState("error");
      const spec: unknown = await res.json();
      const scalar = (window as unknown as { Scalar?: ScalarGlobal }).Scalar;
      if (!scalar) return setState("error");
      setState("ready");
      scalar.createApiReference("#wlyl-api-reference", { ...SCALAR_CONFIG, content: spec });
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      {/* lazyOnload: Scalar edits <body>; running it before hydration finishes
          causes a hydration mismatch. onReady also re-mounts on client-side nav. */}
      <Script src={SCALAR_SRC} strategy="lazyOnload" onReady={() => { void mountReference(); }} />
      <style>{`
        body { margin: 0; }
        .api-docs-header {
          position: sticky; top: 0; z-index: 20;
          height: 52px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px;
          background: #0f172a; color: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        }
        .api-docs-header strong { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
        .api-docs-header span { margin-left: 10px; font-size: 13px; color: #94a3b8; }
        .api-docs-header a { color: #93c5fd; font-size: 13px; text-decoration: none; }
        .api-docs-header a:hover, .api-docs-header a:focus-visible { text-decoration: underline; }
        .api-docs-notice {
          max-width: 480px; margin: 96px auto; padding: 0 24px; text-align: center;
          font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a;
        }
        .api-docs-notice h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
        .api-docs-notice p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px; }
        .api-docs-notice a {
          display: inline-block; margin: 0 6px; padding: 10px 18px; border-radius: 8px;
          background: #1d4ed8; color: #fff; font-size: 14px; font-weight: 500; text-decoration: none;
        }
        .api-docs-notice a.secondary { background: #eef2f7; color: #0f172a; }
        .api-docs-notice a:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
      `}</style>
      <header className="api-docs-header" data-testid="api-docs-header">
        <div>
          <strong>WLYL API</strong>
          <span>Reference for every route in the platform</span>
        </div>
        <Link href="/" data-testid="api-docs-home-link">← Back to Home</Link>
      </header>
      {state === "signin" && (
        <main className="api-docs-notice" data-testid="api-docs-signin">
          <h1>Sign in to view the API reference</h1>
          <p>The API reference is available to school admins and platform admins. Sign in, then come back to this page.</p>
          <a href="/login?role=school" data-testid="api-docs-signin-school">School admin sign-in</a>
          <a href="/login?role=platform" className="secondary" data-testid="api-docs-signin-platform">Platform admin sign-in</a>
        </main>
      )}
      {state === "error" && (
        <main className="api-docs-notice" role="alert" data-testid="api-docs-error">
          <h1>The API reference could not be loaded</h1>
          <p>Refresh the page to try again.</p>
        </main>
      )}
      <div id="wlyl-api-reference" data-testid="api-docs-reference" hidden={state !== "ready"} />
    </>
  );
}
