import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const specPath = join(process.cwd(), "docs", "openapi.json");
    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    return NextResponse.json(spec, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load OpenAPI spec";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
