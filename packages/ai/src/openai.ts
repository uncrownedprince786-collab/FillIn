import OpenAI from "openai";
import { AIProvider, AIProviderError, CompleteJSONInput, describeSchema } from "./provider";

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * OpenAI-backed provider. Kept isolated inside this package so swapping or
 * adding a provider never touches the extension or route code.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly client: OpenAI;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new AIProviderError(
        "CONFIG",
        "OpenAI API key is not configured on the server."
      );
    }
    this.model = options.model ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: this.timeoutMs,
      maxRetries: this.maxRetries,
    });
  }

  async completeJSON<T>(input: CompleteJSONInput<T>): Promise<T> {
    const shapeHint = describeSchema(input.schema);
    const system = `${input.system}\n\nYou must reply with a single JSON object matching exactly this shape (no markdown, no explanation):\n${shapeHint}`;
    const user = `${input.user}\n\nReturn only the JSON object.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: input.temperature ?? 0,
          max_tokens: input.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
          throw new AIProviderError(
            "INVALID_RESPONSE",
            "The model returned an empty response."
          );
        }

        const parsed = JSON.parse(raw) as unknown;
        const result = input.schema.parse(parsed);
        return result;
      } catch (err) {
        lastError = err;
        // Retry once on malformed JSON or schema mismatch; fail fast on auth/rate limits.
        if (err instanceof AIProviderError && err.code === "INVALID_RESPONSE") {
          continue;
        }
        if (
          err &&
          typeof err === "object" &&
          "name" in err &&
          (err as { name?: string }).name === "ZodError"
        ) {
          continue;
        }
        if (isOpenAIStatus(err, 401)) {
          throw new AIProviderError(
            "UNAUTHORIZED",
            "The AI provider rejected the API key.",
            { cause: err }
          );
        }
        if (isOpenAIStatus(err, 429)) {
          throw new AIProviderError(
            "RATE_LIMITED",
            "The AI provider is rate limiting requests. Please try again shortly.",
            { cause: err }
          );
        }
        if (err instanceof AIProviderError) throw err;
        throw new AIProviderError(
          "UNKNOWN",
          "The AI provider could not complete the request.",
          { cause: err }
        );
      }
    }
    throw new AIProviderError(
      "INVALID_RESPONSE",
      "The model returned invalid structured output twice.",
      { cause: lastError }
    );
  }
}

function isOpenAIStatus(err: unknown, status: number): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status?: number }).status === status
  );
}