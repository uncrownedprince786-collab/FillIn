import type {
  AiAnalyzeRequest,
  AiAnalyzeResponse,
  AiAnswerRequest,
  AiAnswerResponse,
  AiExtractRequest,
  AiExtractResponse,
  ClassifyQuestionResponse} from "@fillin/schemas";
import {
  AiAnalyzeResponseSchema,
  AiAnswerResponseSchema,
  AiExtractResponseSchema,
  ClassifyQuestionResponseSchema,
} from "@fillin/schemas";

export class AIClientError extends Error {
  readonly kind:
    | "OFFLINE"
    | "NETWORK"
    | "HTTP"
    | "VALIDATION"
    | "CONFIG"
    | "UNKNOWN";
  constructor(kind: AIClientError["kind"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIClientError";
    this.kind = kind;
  }
}

export class AIClient {
  constructor(private readonly baseUrl: string) {}

  private async post<T>(
    path: string,
    body: unknown,
    schema: { parse(data: unknown): T },
    retries = 2
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new AIClientError("CONFIG", "No API server configured.");
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          lastErr = new AIClientError("NETWORK", "The request timed out.");
          continue;
        }
        lastErr = new AIClientError("OFFLINE", "We couldn't connect right now.", { cause: err });
        continue;
      }
      clearTimeout(timer);

      if (res.status === 429 && attempt < retries) {
        continue;
      }

      if (!res.ok) {
        let message = `The server returned ${res.status}.`;
        try {
          const data = (await res.json()) as { error?: { message?: string } };
          if (data.error?.message) message = data.error.message;
        } catch {
          /* keep default message */
        }
        if (res.status === 429) {
          throw new AIClientError("NETWORK", "Too many requests. Please try again in a moment.");
        }
        throw new AIClientError("HTTP", message);
      }

      try {
        const data = (await res.json()) as unknown;
        return schema.parse(data);
      } catch (err) {
        throw new AIClientError("VALIDATION", "The server returned an unexpected response.", {
          cause: err,
        });
      }
    }
    throw lastErr instanceof AIClientError
      ? lastErr
      : new AIClientError("NETWORK", "We couldn't connect right now.");
  }

  async analyze(req: AiAnalyzeRequest): Promise<AiAnalyzeResponse> {
    return this.post("/api/ai/analyze", req, AiAnalyzeResponseSchema);
  }

  async answer(req: AiAnswerRequest): Promise<AiAnswerResponse> {
    return this.post("/api/ai/answer", req, AiAnswerResponseSchema);
  }

  async classify(question: string): Promise<ClassifyQuestionResponse> {
    return this.post("/api/ai/classify", { question }, ClassifyQuestionResponseSchema);
  }

  async extract(req: AiExtractRequest): Promise<AiExtractResponse> {
    return this.post("/api/ai/extract", req, AiExtractResponseSchema);
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}