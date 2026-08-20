export const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^chrome-extension:\/\/[a-p]{32}$/,
  /^http:\/\/localhost:\d+$/,
  /^https?:\/\/127\.0\.0\.1:\d+$/,
];

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return true;
  return extraOrigins.includes(origin);
}

export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const allowed = origin && isAllowedOrigin(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}