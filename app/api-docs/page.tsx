"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css";
    document.head.appendChild(link);

    const script1 = document.createElement("script");
    script1.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js";
    script1.onload = () => {
      const script2 = document.createElement("script");
      script2.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js";
      script2.onload = () => {
        const w = window as unknown as Record<string, unknown>;
        const SwaggerUIBundle = w.SwaggerUIBundle as (cfg: Record<string, unknown>) => void;
        const SwaggerUIStandalonePreset = w.SwaggerUIStandalonePreset;
        if (SwaggerUIBundle && containerRef.current) {
          SwaggerUIBundle({
            url: "/api/openapi",
            dom_id: "#swagger-ui",
            deepLinking: false,
            presets: [SwaggerUIStandalonePreset].filter(Boolean),
            layout: "StandaloneLayout",
            docExpansion: "list",
            filter: true,
            tryItOutEnabled: true,
          });
          setLoaded(true);
        }
      };
      document.body.appendChild(script2);
    };
    document.body.appendChild(script1);
  }, [loaded]);

  return (
    <>
      <style>{`
        body { margin: 0; padding: 0; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 20px 0; }
        .api-docs-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: white;
          padding: 24px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .api-docs-header h1 { margin: 0; font-size: 24px; font-weight: 700; }
        .api-docs-header p { margin: 4px 0 0; opacity: 0.8; font-size: 14px; }
        .api-docs-header a {
          color: #93c5fd;
          text-decoration: none;
          font-size: 14px;
        }
        .api-docs-header a:hover { text-decoration: underline; }
      `}</style>
      <div className="api-docs-header" data-testid="api-docs-header">
        <div>
          <h1>WLYL API Documentation</h1>
          <p>We Learn You Learn — School Management Platform</p>
        </div>
        <Link href="/" data-testid="api-docs-home-link">← Back to Home</Link>
      </div>
      <div id="swagger-ui" ref={containerRef} data-testid="swagger-ui-container" />
    </>
  );
}
