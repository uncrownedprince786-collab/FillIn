import { corsHeaders } from "./cors";
import { safeLog } from "./log";
import { AIProviderError } from "@fillin/ai";

type CorsOrigin = string | null | undefined;

function base(origin: CorsOrigin): Record<string, string> {
  return corsHeaders(origin);
}

export function jsonOk(data: unknown, origin: CorsOrigin, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...base(origin), ...(init?.headers ?? {}) },
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  origin: CorsOrigin,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...base(origin), ...(init?.headers ?? {}) },
  });
}

export function optionsResponse(origin: CorsOrigin): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function handleApiError(err: unknown, origin: CorsOrigin): Response {
  if (err instanceof AIProviderError) {
    const status = err.code === "UNAUTHORIZED" ? 502 : err.code === "RATE_LIMITED" ? 429 : 500;
    safeLog("warn", "ai_provider_error", { code: err.code });
    return jsonError(status, err.code, err.message, origin);
  }
  if (err instanceof Error && err.name === "ZodError") {
    safeLog("warn", "validation_error", {});
    return jsonError(400, "VALIDATION_ERROR", "The request is invalid.", origin);
  }
  safeLog("error", "unhandled_error", {});
  return jsonError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.", origin);
}