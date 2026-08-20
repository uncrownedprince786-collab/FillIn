import type {
  AiAnalyzeRequest,
  AiAnalyzeResponse,
  AiAnswerRequest,
  AiAnswerResponse,
  AiExtractRequest,
  AiExtractResponse,
  AiFieldResult,
  ClassifyQuestionResponse} from "@fillin/schemas";
import {
  AiAnalyzeResponseSchema,
  AiAnswerResponseSchema,
  AiExtractResponseSchema,
  ClassifyQuestionResponseSchema,
  ProfileKey,
} from "@fillin/schemas";
import type { AIProvider} from "@fillin/ai";
import { AIProviderError, OpenAIProvider } from "@fillin/ai";
import {
  buildAnalyzePrompt,
  buildAnswerPrompt,
  buildClassifyPrompt,
  buildExtractPrompt,
} from "@fillin/ai";
import { safeLog } from "./log";

let provider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (provider) return provider;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      "CONFIG",
      "The server is not configured with an AI provider."
    );
  }
  provider = new OpenAIProvider({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
  return provider;
}

// ---------------------------------------------------------------------------
// Hallucination guard: raw model output is never trusted blindly.
// ---------------------------------------------------------------------------

function normalizeFactSet(facts: { key: string; value: string }[]): string[] {
  return facts.map((f) => f.value.trim().toLowerCase().replace(/\s+/g, " "));
}

function exactMatch(value: string, factSet: string[]): boolean {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  return factSet.includes(v);
}

function tokenCovered(value: string, factSet: string[]): boolean {
  const tokens = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && /[a-z0-9]/.test(t));
  if (tokens.length === 0) return false;
  return tokens.every((t) => factSet.some((f) => f.includes(t)));
}

function isSingleToken(value: string): boolean {
  return value.trim().split(/\s+/).length <= 1;
}

/**
 * Downgrade any decision whose value cannot be traced to the supplied facts.
 * This is the last line of defense against fabricated values.
 */
export function guardAnalyzeResults(
  input: AiAnalyzeRequest,
  results: AiFieldResult[]
): AiFieldResult[] {
  const factSet = normalizeFactSet(input.facts);
  const fieldById = new Map(input.fields.map((f) => [f.id, f]));

  return results.map((r) => {
    const field = fieldById.get(r.fieldId);
    const isTextarea = field?.fieldType === "textarea";

    if (r.decision === "SENSITIVE" || r.decision === "DO_NOT_FILL") {
      return { ...r, value: undefined };
    }
    if (r.decision === "ASK_USER" || r.decision === "UNKNOWN" || r.decision === "CONFLICT") {
      return { ...r, value: undefined };
    }
    if (r.decision === "GENERATED") {
      if (!isTextarea) {
        return { ...r, decision: "ASK_USER", value: undefined };
      }
      if (!r.value) return { ...r, decision: "UNKNOWN", value: undefined };
      return r;
    }
    if (r.decision === "EXACT" || r.decision === "DERIVED") {
      if (!r.value) {
        return { ...r, decision: "UNKNOWN", value: undefined };
      }
      const exact = exactMatch(r.value, factSet);
      if (exact) return r;
      if (isSingleToken(r.value) && !exact) {
        return { ...r, decision: "ASK_USER", value: undefined, reason: "Could not verify this value against your information." };
      }
      if (tokenCovered(r.value, factSet)) return r;
      return { ...r, decision: "ASK_USER", value: undefined, reason: "Could not verify this value against your information." };
    }
    return r;
  });
}

export async function analyzeForm(
  input: AiAnalyzeRequest
): Promise<AiAnalyzeResponse> {
  const { system, user } = buildAnalyzePrompt(input);
  const raw = await getProvider().completeJSON<AiAnalyzeResponse>({
    system,
    user,
    schema: AiAnalyzeResponseSchema,
    maxTokens: 2000,
  });
  const guarded = guardAnalyzeResults(input, raw.results);
  safeLog("info", "analyze_form", {
    field_count: input.fields.length,
    fact_count: input.facts.length,
    excerpt_count: input.excerpts.length,
    result_count: guarded.length,
  });
  return { results: guarded };
}

export async function answerQuestion(
  input: AiAnswerRequest
): Promise<AiAnswerResponse> {
  const { system, user } = buildAnswerPrompt(
    input.question,
    input.category,
    input.facts,
    input.excerpts
  );
  const result = await getProvider().completeJSON<AiAnswerResponse>({
    system,
    user,
    schema: AiAnswerResponseSchema,
    maxTokens: 1200,
  });
  safeLog("info", "answer_question", {
    fact_count: input.facts.length,
    excerpt_count: input.excerpts.length,
    result_decision: result.decision,
  });
  return result;
}

export async function classifyQuestion(question: string): Promise<ClassifyQuestionResponse> {
  const { system, user } = buildClassifyPrompt(question);
  const result = await getProvider().completeJSON<ClassifyQuestionResponse>({
    system,
    user,
    schema: ClassifyQuestionResponseSchema,
    maxTokens: 120,
  });
  safeLog("info", "classify_question", { result_category: result.category });
  return result;
}

export async function extractHintsFromText(
  input: AiExtractRequest
): Promise<AiExtractResponse> {
  const { system, user } = buildExtractPrompt(input);
  const result = await getProvider().completeJSON<AiExtractResponse>({
    system,
    user,
    schema: AiExtractResponseSchema,
    maxTokens: 2500,
  });
  const validKeys = new Set<string>(ProfileKey.options);
  const hints = result.hints.filter(
    (h) => validKeys.has(h.key) && h.value.trim().length > 0
  );
  safeLog("info", "extract_document", {
    document_chars: input.text.length,
    hint_count: hints.length,
  });
  return { hints };
}