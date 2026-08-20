import { z } from "zod";

export const FieldType = z.enum([
  "text",
  "email",
  "tel",
  "number",
  "textarea",
  "password",
  "select",
  "radio",
  "checkbox",
  "date",
  "url",
  "file",
  "hidden",
  "unknown",
]);
export type FieldType = z.infer<typeof FieldType>;

export const ElementKind = z.enum([
  "input",
  "textarea",
  "select",
  "custom",
]);
export type ElementKind = z.infer<typeof ElementKind>;

export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

/**
 * A form field as detected in the DOM. Contains only structural metadata and
 * the field's CURRENT value (used to avoid overwriting user-entered data).
 */
export const DetectedFieldSchema = z.object({
  /** Stable id used across pipeline stages. */
  id: z.string(),
  /** How the control is exposed in the DOM. */
  kind: ElementKind,
  fieldType: FieldType,
  name: z.string().optional(),
  htmlId: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  ariaLabel: z.string().optional(),
  /** Nearest heading / section text. */
  section: z.string().optional(),
  /** Full visible text of the row / question. */
  questionText: z.string().optional(),
  required: z.boolean(),
  /** True if the control currently contains a non-empty value. */
  hasValue: z.boolean(),
  /** Whether the field is currently visible in the DOM. */
  visible: z.boolean(),
  options: z.array(FieldOptionSchema).optional(),
  /** For file inputs: accepted extensions. */
  accept: z.string().optional(),
  /** DOM element tag + type, for custom-control recovery. */
  debug: z.string().optional(),
});
export type DetectedField = z.infer<typeof DetectedFieldSchema>;

export const FieldSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  scannedAt: z.number().int(),
  fields: z.array(DetectedFieldSchema),
});
export type FieldSnapshot = z.infer<typeof FieldSnapshotSchema>;

/** Everything the AI needs about a field — never raw values, only semantics. */
export const AISafeFieldSchema = z.object({
  id: z.string(),
  fieldType: FieldType,
  label: z.string().optional(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  htmlId: z.string().optional(),
  ariaLabel: z.string().optional(),
  section: z.string().optional(),
  questionText: z.string().optional(),
  options: z.array(z.string()).optional(),
});
export type AISafeField = z.infer<typeof AISafeFieldSchema>;

// ---------------------------------------------------------------------------
// Decision system
// ---------------------------------------------------------------------------

export const DecisionState = z.enum([
  "EXACT",
  "DERIVED",
  "GENERATED",
  "ASK_USER",
  "UNKNOWN",
  "CONFLICT",
  "SENSITIVE",
  "DO_NOT_FILL",
]);
export type DecisionState = z.infer<typeof DecisionState>;

export const FieldDecisionSchema = z.object({
  fieldId: z.string(),
  decision: DecisionState,
  value: z.string().optional(),
  semanticKey: ProfileKey.optional(),
  confidence: ConfidenceSchema.optional(),
  sources: z.array(SourceRefSchema).optional(),
  reason: z.string().optional(),
  /** set when decision requires a user choice (conflict/ask) */
  options: z.array(z.string()).optional(),
  generated: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  /** true when the field already contains a user-typed value we chose to keep */
  preserved: z.boolean().optional(),
});
export type FieldDecision = z.infer<typeof FieldDecisionSchema>;

export const DECISION_LABEL: Record<DecisionState, string> = {
  EXACT: "Filled from your information",
  DERIVED: "Filled from your information",
  GENERATED: "Generated from your information",
  ASK_USER: "Needs your answer",
  UNKNOWN: "We couldn't identify this",
  CONFLICT: "Documents disagree",
  SENSITIVE: "Sensitive — you decide",
  DO_NOT_FILL: "Left blank",
};

// Import the schemas themselves (not just types) so runtime validation works.
import {
  Confidence as ConfidenceSchema,
  ProfileKey,
  SourceRefSchema,
} from "./profile";
export type { Confidence, SourceRef } from "./profile";