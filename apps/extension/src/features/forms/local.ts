import type {
  DetectedField,
  Profile,
  ProfileKey,
  SourceRef,
} from "@fillin/schemas";
import {
  classifyFieldText,
  matchesAny,
  DO_NOT_FILL_PATTERNS,
  SENSITIVE_PATTERNS,
  suggestDocumentTypesForField,
  normalizeText,
} from "@fillin/shared";
import {
  deriveValue,
  distinctValues,
  factsForKey,
  openConflict,
  resolveValue,
} from "../profile/builder";

export type FieldContext = "education" | "employment" | "none";

export function fieldText(field: DetectedField): string {
  return [
    field.label,
    field.placeholder,
    field.name,
    field.htmlId,
    field.ariaLabel,
    field.section,
    field.questionText,
  ]
    .filter(Boolean)
    .join(" ");
}

export function detectSensitive(field: DetectedField): boolean {
  return matchesAny(fieldText(field), SENSITIVE_PATTERNS);
}

export function detectDoNotFill(field: DetectedField): boolean {
  return matchesAny(fieldText(field), DO_NOT_FILL_PATTERNS);
}

export function getContext(field: DetectedField): FieldContext {
  const section = normalizeText(field.section ?? "") + " " + normalizeText(field.questionText ?? "");
  if (/education|study|academic|school|degree/.test(section)) return "education";
  if (/employment|employ|work|job|career|experience/.test(section)) return "employment";
  return "none";
}

export function classifyField(field: DetectedField): {
  key: ProfileKey;
  score: number;
} | null {
  return classifyFieldText(fieldText(field), getContext(field));
}

export type LocalOutcome =
  | { outcome: "DO_NOT_FILL"; reason: string }
  | { outcome: "SENSITIVE"; key?: ProfileKey }
  | { outcome: "FILE"; docTypes: string[]; key?: ProfileKey }
  | { outcome: "EXACT"; key: ProfileKey; value: string; sources: SourceRef[] }
  | { outcome: "DERIVED"; key: ProfileKey; value: string }
  | { outcome: "CONFLICT"; key: ProfileKey; options: string[] }
  | { outcome: "NEEDS_AI"; key?: ProfileKey }
  | { outcome: "ASK_USER"; key?: ProfileKey }
  | { outcome: "UNKNOWN" };

export function decideLocally(
  field: DetectedField,
  profile: Profile
): LocalOutcome {
  // 1. Never fill passwords / OTPs / secrets.
  if (detectDoNotFill(field)) {
    return { outcome: "DO_NOT_FILL", reason: "Security field" };
  }

  // 2. File uploads.
  if (field.fieldType === "file") {
    const docTypes = suggestDocumentTypesForField(fieldText(field));
    const classified = classifyField(field);
    return { outcome: "FILE", docTypes, key: classified?.key };
  }

  // 3. Sensitive fields — never auto-filled.
  const classified = classifyField(field);
  const sensitive = detectSensitive(field);
  if (sensitive) {
    return { outcome: "SENSITIVE", key: classified?.key };
  }

  // 4. Local classification → profile matching.
  if (classified?.key) {
    const key = classified.key;

    const conflict = openConflict(profile, key);
    if (conflict) {
      const opts = new Set<string>(distinctValues(profile, key));
      for (const v of conflict.values) opts.add(v.value);
      return { outcome: "CONFLICT", key, options: Array.from(opts) };
    }

    const fact = resolveValue(profile, key);
    if (fact) {
      return {
        outcome: "EXACT",
        key,
        value: fact.value,
        sources: fact.sources,
      };
    }

    const derived = deriveValue(key, profile);
    if (derived) {
      return { outcome: "DERIVED", key, value: derived };
    }

    // Known key but no data — maybe the answer lives in a document.
    return { outcome: "NEEDS_AI", key };
  }

  // 5. Question-style fields (textarea with a question).
  if (field.fieldType === "textarea" || field.questionText) {
    return { outcome: "NEEDS_AI" };
  }

  // 6. Nothing reliable found.
  return { outcome: "UNKNOWN" };
}

/** Facts relevant to a given key, capped for AI context. */
export function factsForContext(
  profile: Profile,
  key: ProfileKey,
  cap = 6
): { key: ProfileKey; value: string }[] {
  const facts = factsForKey(profile, key);
  return facts.slice(0, cap).map((f) => ({ key: f.key, value: f.value }));
}