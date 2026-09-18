import { NextResponse } from "next/server";
import { requirePlatformAdmin, requireSchoolAdmin } from "@/lib/auth";
// Bundled at build time: no runtime fs read, so the DOCS/ folder casing can't
// break it on Vercel's case-sensitive filesystem.
import spec from "@/DOCS/openapi.json";

// Staff only on deployments: the spec lists every route and the session each
// one accepts. Open in local `next dev` so developers can browse it without
// signing in; Vercel previews and production run with NODE_ENV=production.
export async function GET() {
  const isLocalDev = process.env.NODE_ENV === "development";
  if (!isLocalDev && !(await requirePlatformAdmin()) && !(await requireSchoolAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(spec, { headers: { "Cache-Control": "private, max-age=60" } });
}
