import { NextResponse } from "next/server";
// Bundled at build time: no runtime fs read, so the DOCS/ folder casing can't
// break it on Vercel's case-sensitive filesystem.
import spec from "@/DOCS/openapi.json";

// Public by product decision (#131): anyone can open /api-docs without signing in.
export async function GET() {
  return NextResponse.json(spec, { headers: { "Cache-Control": "public, max-age=300" } });
}
