import { z } from "zod";
import { Confidence } from "./profile";
import { FieldType, DecisionState } from "./fields";
import { ProfileCategory } from "./profile";

// ---------------------------------------------------------------------------
// Question classification
// ---------------------------------------------------------------------------

export const QuestionCategory = z.enum([
  "PERSONAL_INFORMATION",
  "CONTACT_INFORMATION",
  "ADDRESS",
  "EDUCATION",
  "EMPLOYMENT",
  "EXPERIENCE",
  "SKILLS",
  "DOCUMENT",
  "YES_NO",
  "PREFERENCE",
  "LEGAL_DECLARATION",
  "FINANCIAL",
  "SENSITIVE",
  "UNKNOWN",
]);
export type QuestionCategory = z.infer<typeof QuestionCategory>;

export const ClassifyQuestionResponseSchema = z.object({
  category: QuestionCategory,
  /** short plain-English reason, never containing user data */
  reason: z.string().max(200).optional(),
});
export type ClassifyQuestionResponse = z.infer<
  typeof ClassifyQuestionResponseSchema
>;

// ---------------------------------------------------------------------------
// Form analysis (batched field mapping + value resolution)
// ---------------------------------------------------------------------------

export const AiAnalyzeFieldSchema = z.object({
  id: z.string(),
  fieldType: FieldType,
  label: z.string().optional(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  htmlId: z.string().optional(),
  ariaLabel: z.string().optional(),
  section: z.string().optional(),
  questionText: z.string().optional(),
  options: z.array(z.string()).max(200).optional(),
});
export type AiAnalyzeField = z.infer<typeof AiAnalyzeFieldSchema>;

export const AiAnalyzeRequestSchema = z.object({
  /** Ambiguous fields only. Never includes values typed by the user. */
  fields: z.array(AiAnalyzeFieldSchema).max(60),
  /**
   * Relevant facts only. The client filters the profile to the slice needed.
   * Never contains sensitive identifiers (CNIC, passport, bank, tax).
   */
  facts: z
    .array(
      z.object({
        key: z.string().max(100),
        value: z.string().max(2000),
      })
    )
    .max(120),
  /** Optional supporting document excerpts (short, targeted). */
  excerpts: z
    .array(
      z.object({
        key: z.string().max(100),
        value: z.string().max(4000),
        source: z.string().max(255).optional(),
      })
    )
    .max(60),
  /** User's saved answers for this form's question fields. */
  userAnswers: z
    .array(
      z.object({
        question: z.string().max(500),
        answer: z.string().max(4000),
      })
    )
    .max(60)
    .optional(),
});
export type AiAnalyzeRequest = z.infer<typeof AiAnalyzeRequestSchema>;

export const AiFieldResultSchema = z.object({
  fieldId: z.string(),
  decision: DecisionState,
  /** Non-empty only for EXACT / DERIVED / GENERATED / SENSITIVE(user-chosen). */
  value: z.string().max(8000).optional(),
  confidence: Confidence.optional(),
  reason: z.string().max(500).optional(),
  /** Source document names when a value was drawn from them. */
  sources: z.array(z.string().max(255)).max(10).optional(),
});
export type AiFieldResult = z.infer<typeof AiFieldResultSchema>;

export const AiAnalyzeResponseSchema = z.object({
  results: z.array(AiFieldResultSchema).max(60),
});
export type AiAnalyzeResponse = z.infer<typeof AiAnalyzeResponseSchema>;

// ---------------------------------------------------------------------------
// Natural-language answer generation
// ---------------------------------------------------------------------------

export const AiAnswerRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  category: ProfileCategory.optional(),
  facts: z
    .array(
      z.object({
        key: z.string().max(100),
        value: z.string().max(2000),
      })
    )
    .max(120),
  excerpts: z
    .array(
      z.object({
        key: z.string().max(100),
        value: z.string().max(4000),
        source: z.string().max(255).optional(),
      })
    )
    .max(60),
});
export type AiAnswerRequest = z.infer<typeof AiAnswerRequestSchema>;

export const AiAnswerResponseSchema = z.object({
  decision: DecisionState,
  value: z.string().max(8000).optional(),
  confidence: Confidence.optional(),
  reason: z.string().max(500).optional(),
  sources: z.array(z.string().max(255)).max(10).optional(),
});
export type AiAnswerResponse = z.infer<typeof AiAnswerResponseSchema>;

// ---------------------------------------------------------------------------
// Profile extraction from a document's text
// ---------------------------------------------------------------------------

export const AiExtractHintSchema = z.object({
  /** A profile key like "personal.firstName" or "education.degree". */
  key: z.string().max(100),
  value: z.string().min(1).max(2000),
});
export type AiExtractHint = z.infer<typeof AiExtractHintSchema>;

export const AiExtractRequestSchema = z.object({
  documentName: z.string().max(255),
  docType: z.string().max(50).optional(),
  text: z.string().min(1).max(30000),
});
export type AiExtractRequest = z.infer<typeof AiExtractRequestSchema>;

export const AiExtractResponseSchema = z.object({
  hints: z.array(AiExtractHintSchema).max(200),
});
export type AiExtractResponse = z.infer<typeof AiExtractResponseSchema>;