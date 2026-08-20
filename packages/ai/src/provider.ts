import type { z } from "zod";

/**
 * Errors surfaced to the user. Keep them human and do not leak internals.
 */
export class AIProviderError extends Error {
  readonly code:
    | "CONFIG"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "INVALID_RESPONSE"
    | "NETWORK"
    | "UNKNOWN";

  constructor(
    code: AIProviderError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "AIProviderError";
    this.code = code;
  }
}

export interface CompleteJSONInput<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Provider abstraction. A provider turns a prompt into validated structured
 * JSON. All code should depend on this interface, never on OpenAI directly.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  completeJSON<T>(input: CompleteJSONInput<T>): Promise<T>;
}

/** Render a zod schema to a human/LLM-readable shape description. */
export function describeSchema(schema: z.ZodType<unknown>): string {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  if (shape && typeof shape === "object") {
    const fields: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const typeName =
        (value as { _def?: { typeName?: string } })?._def?.typeName ??
        "any";
      const isOptional = (value as { isOptional?: () => boolean }).isOptional?.() ?? false;
      fields.push(
        `${JSON.stringify(key)}: ${typeName}${isOptional ? " (optional)" : ""}`
      );
    }
    return `{ ${fields.join(", ")} }`;
  }
  return schema.description ?? "unknown-shape";
}