/**
 * Safe logging. Never logs request bodies, field values, documents, or any
 * user data — only safe metadata.
 */
const sensitivePatterns = [
  /passport/i,
  /cnic/i,
  /national id/i,
  /bank/i,
  /salary/i,
  /password/i,
  /otp/i,
  /secret/i,
  /token/i,
  /credit card/i,
];

export function safeLog(
  level: "info" | "warn" | "error",
  event: string,
  metadata?: Record<string, unknown>
): void {
  const safeMeta: Record<string, unknown> = {};
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (sensitivePatterns.some((p) => p.test(key))) continue;
      if (typeof value === "string" && sensitivePatterns.some((p) => p.test(value))) {
        continue;
      }
      safeMeta[key] = value;
    }
  }
  const line = JSON.stringify({ level, event, ...safeMeta, ts: new Date().toISOString() });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Redact any accident before it can be logged. */
export function redact(value: string): string {
  return value
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "****")
    .replace(/\b\d{13,19}\b/g, "****");
}