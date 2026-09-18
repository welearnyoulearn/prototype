import { NextResponse } from "next/server";
import { requirePlatformAdmin, requireSchoolAdmin } from "@/lib/auth";
// Bundled at build time: no runtime fs read, so the DOCS/ folder casing can't
// break it on Vercel's case-sensitive filesystem.
import spec from "@/DOCS/openapi.json";

// Staff only: the spec lists every route and the session each one accepts.
export async function GET() {
  if (!(await requirePlatformAdmin()) && !(await requireSchoolAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(spec, { headers: { "Cache-Control": "private, max-age=60" } });
}
