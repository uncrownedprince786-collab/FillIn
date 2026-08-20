import type { NextRequest } from "next/server";
import { z } from "zod";
import { classifyQuestion } from "@/lib/ai-service";
import { jsonError, jsonOk, handleApiError, optionsResponse } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isAllowedOrigin } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

const ClassifyRequestSchema = z.object({
  question: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return jsonError(403, "FORBIDDEN", "Origin not allowed.", origin);
  }

  const rl = rateLimit(`classify:${clientIp(req.headers)}`);
  if (!rl.ok) {
    return jsonError(429, "RATE_LIMITED", "Too many requests. Try again shortly.", origin, {
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const parsed = ClassifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "VALIDATION_ERROR", "The request is invalid.", origin);
    }
    const result = await classifyQuestion(parsed.data.question);
    return jsonOk(result, origin);
  } catch (err) {
    return handleApiError(err, origin);
  }
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(isAllowedOrigin(req.headers.get("origin")) ? req.headers.get("origin") : undefined);
}