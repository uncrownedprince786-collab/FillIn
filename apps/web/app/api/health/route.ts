import type { NextRequest } from "next/server";
import { corsHeaders, isAllowedOrigin } from "@/lib/cors";

export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new Response(
    JSON.stringify({
      ok: true,
      service: "fillin-api",
      version: "0.1.0",
      time: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(isAllowedOrigin(origin) ? origin : undefined),
      },
    }
  );
}

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(isAllowedOrigin(origin) ? origin : undefined),
  });
}