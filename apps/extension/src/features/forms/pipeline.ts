import type {
  AiAnalyzeField,
  AiFieldResult,
  AnswersStore,
  AppSettings,
  DetectedField,
  DocumentMetadata,
  ExtractedDocument,
  FieldDecision,
  FieldSnapshot,
  Profile,
  ProfileKey,
} from "@fillin/schemas";
import { normalizeText } from "@fillin/shared";
import type { AIClient } from "../../ai/client";
import {
  decideLocally,
  fieldText,
  classifyField,
} from "./local";
import { selectRelevantContext } from "../profile/retrieve";
import { distinctValues, resolveConflict } from "../profile/builder";

export interface ReviewItem {
  fieldId: string;
  field: DetectedField;
  decision: FieldDecision;
  question: string;
}

export interface FormPlan {
  url: string;
  title: string;
  decisions: FieldDecision[];
  items: ReviewItem[];
  summary: {
    total: number;
    ready: number;
    needYou: number;
    review: number;
    unknown: number;
    doNotFill: number;
  };
  aiAvailable: boolean;
  aiUsed: boolean;
}

export interface PipelineContext {
  profile: Profile;
  answers: AnswersStore;
  settings: AppSettings;
  documents: DocumentMetadata[];
  extracted: Map<string, ExtractedDocument>;
  ai: AIClient | null;
}

const MAX_AI_FIELDS = 30;
const MAX_ANSWER_CALLS = 8;

function docNameFor(context: PipelineContext, documentId: string): string {
  return (
    context.documents.find((d) => d.id === documentId)?.name ?? documentId
  );
}

function fieldToAiSafe(field: DetectedField): AiAnalyzeField {
  return {
    id: field.id,
    fieldType: field.fieldType,
    label: field.label,
    placeholder: field.placeholder,
    name: field.name,
    htmlId: field.htmlId,
    ariaLabel: field.ariaLabel,
    section: field.section,
    questionText: field.questionText,
    options: field.options?.map((o) => o.value).slice(0, 50),
  };
}

function questionFor(field: DetectedField): string {
  return field.questionText || field.label || fieldText(field) || "Unnamed field";
}

export async function planForm(
  snapshot: FieldSnapshot,
  context: PipelineContext
): Promise<FormPlan> {
  const { profile, answers, settings } = context;
  const decisions: FieldDecision[] = [];
  const aiCandidates: DetectedField[] = [];
  const answerCandidates: DetectedField[] = [];
  const keysNeeded = new Set<ProfileKey>();

  const fields = snapshot.fields.filter((f) => f.visible);

  for (const field of fields) {
    const outcome = decideLocally(field, profile);
    const base: Partial<FieldDecision> & { fieldId: string } = {
      fieldId: field.id,
    };

    switch (outcome.outcome) {
      case "DO_NOT_FILL":
        decisions.push({
          ...base,
          decision: "DO_NOT_FILL",
          reason: "Security or sensitive-authentication field",
          sensitive: true,
        });
        break;
      case "FILE": {
        const suggestions = context.documents
          .filter((d) => outcome.docTypes.length === 0 || outcome.docTypes.includes(d.type))
          .map((d) => d.name);
        decisions.push({
          ...base,
          decision: suggestions.length ? "ASK_USER" : "UNKNOWN",
          reason: suggestions.length
            ? `Upload ${outcome.docTypes.length ? outcome.docTypes.join(" / ") : "a document"}`
            : "No matching saved document",
          options: suggestions,
        });
        break;
      }
      case "SENSITIVE": {
        decisions.push({
          ...base,
          decision: "SENSITIVE",
          reason: "Sensitive information — you decide",
          sensitive: true,
          semanticKey: outcome.key,
          options: outcome.key
            ? selectRelevantContext(profile, [outcome.key], context.extracted).facts.map(
                (f) => f.value
              )
            : undefined,
        });
        break;
      }
      case "EXACT": {
        decisions.push({
          ...base,
          decision: "EXACT",
          value: outcome.value,
          semanticKey: outcome.key,
          confidence: "high",
          sources: outcome.sources.map((s) => ({
            documentId: s.documentId,
            documentName: docNameFor(context, s.documentId),
          })),
          reason: "Found in your information",
        });
        break;
      }
      case "DERIVED": {
        decisions.push({
          ...base,
          decision: "DERIVED",
          value: outcome.value,
          semanticKey: outcome.key,
          confidence: "high",
          reason: "Derived from your information",
        });
        break;
      }
      case "CONFLICT": {
        decisions.push({
          ...base,
          decision: "CONFLICT",
          semanticKey: outcome.key,
          reason: "Your documents disagree — which should we use?",
          options: outcome.options,
        });
        break;
      }
      case "NEEDS_AI": {
        if (outcome.key) keysNeeded.add(outcome.key);
        if (field.fieldType === "textarea" && field.questionText) {
          answerCandidates.push(field);
        } else {
          aiCandidates.push(field);
        }
        break;
      }
      case "ASK_USER": {
        const saved = outcome.key
          ? undefined
          : answers[normalizeText(questionFor(field))];
        if (saved && saved.answer) {
          decisions.push({
            ...base,
            decision: "EXACT",
            value: saved.answer,
            reason: "Your saved answer",
            semanticKey: outcome.key,
          });
        } else {
          decisions.push({
            ...base,
            decision: "ASK_USER",
            reason: "Needs your answer",
            semanticKey: outcome.key,
          });
        }
        break;
      }
      case "UNKNOWN": {
        // Try the answers store / AI for question-like unknowns too.
        const saved = answers[normalizeText(questionFor(field))];
        if (saved && saved.answer) {
          decisions.push({
            ...base,
            decision: "EXACT",
            value: saved.answer,
            reason: "Your saved answer",
          });
        } else if (field.questionText || field.label) {
          answerCandidates.push(field);
        } else {
          decisions.push({
            ...base,
            decision: "UNKNOWN",
            reason: "We couldn't identify what this field asks for",
          });
        }
        break;
      }
    }
  }

  // ---- AI stage ----
  let aiUsed = false;
  const aiAvailable = settings.aiEnabled && !!context.ai;

  // 1. Batched field analysis for ambiguous fields.
  if (aiAvailable && aiCandidates.length > 0) {
    const batch = aiCandidates.slice(0, MAX_AI_FIELDS);
    const relevant = selectRelevantContext(profile, Array.from(keysNeeded), context.extracted, []);
    const userAnswers = Object.values(answers).map((a) => ({
      question: a.question,
      answer: a.answer,
    }));
    try {
      const resp = await context.ai!.analyze({
        fields: batch.map(fieldToAiSafe),
        facts: relevant.facts,
        excerpts: relevant.excerpts,
        userAnswers: userAnswers.slice(0, 60),
      });
      aiUsed = true;
      mergeAiResults(resp.results, batch, decisions, context, profile);
    } catch {
      // AI unavailable → fall through to manual review states.
      for (const field of batch) {
        if (!decisions.some((d) => d.fieldId === field.id)) {
          decisions.push({
            fieldId: field.id,
            decision: field.questionText || field.label ? "ASK_USER" : "UNKNOWN",
            reason: "We couldn't connect right now. You can fill this manually.",
            semanticKey: classifyField(field)?.key,
          });
        }
      }
    }
  }

  // 2. Natural-language answers (limited for cost).
  if (aiAvailable && answerCandidates.length > 0) {
    const batch = answerCandidates.slice(0, MAX_ANSWER_CALLS);
    const questions = batch.map(questionFor);
    const relevant = selectRelevantContext(
      profile,
      Array.from(keysNeeded),
      context.extracted,
      questions
    );
    for (const field of batch) {
      const q = questionFor(field);
      try {
        const resp = await context.ai!.answer({
          question: q,
          facts: relevant.facts,
          excerpts: relevant.excerpts,
        });
        aiUsed = true;
        if (resp.decision === "EXACT" || resp.decision === "DERIVED" || resp.decision === "GENERATED") {
          if (resp.value) {
            decisions.push({
              fieldId: field.id,
              decision: resp.decision,
              value: resp.value,
              confidence: resp.confidence,
              sources: resp.sources?.map((s) => ({ documentId: s, documentName: s })),
              reason: resp.reason ?? "Generated from your information",
              generated: resp.decision === "GENERATED",
            });
            continue;
          }
        }
        decisions.push({
          fieldId: field.id,
          decision: resp.decision === "ASK_USER" ? "ASK_USER" : resp.decision === "UNKNOWN" ? "UNKNOWN" : "ASK_USER",
          reason: resp.reason ?? "Needs your answer",
        });
      } catch {
        decisions.push({
          fieldId: field.id,
          decision: "ASK_USER",
          reason: "We couldn't connect right now. You can fill this manually.",
        });
      }
    }
  }

  // ---- Finalize ----
  // Ensure every field has exactly one decision.
  const decidedIds = new Set(decisions.map((d) => d.fieldId));
  for (const field of fields) {
    if (!decidedIds.has(field.id)) {
      decisions.push({
        fieldId: field.id,
        decision: "UNKNOWN",
        reason: "We couldn't identify what this field asks for",
      });
    }
  }

  const plan = applyPreserve(fields, decisions, settings);
  return summarize(snapshot, plan, aiAvailable, aiUsed);
}

function mergeAiResults(
  results: AiFieldResult[],
  batch: DetectedField[],
  decisions: FieldDecision[],
  context: PipelineContext,
  profile: Profile
): void {
  const byId = new Map(batch.map((f) => [f.id, f]));
  for (const r of results) {
    const field = byId.get(r.fieldId);
    if (!field) continue;
    const existingIdx = decisions.findIndex((d) => d.fieldId === r.fieldId);
    let decision: FieldDecision;
    switch (r.decision) {
      case "EXACT":
      case "DERIVED":
      case "GENERATED":
        if (r.value) {
          decision = {
            fieldId: r.fieldId,
            decision: r.decision,
            value: r.value,
            confidence: r.confidence,
            sources: r.sources?.map((s) => ({ documentId: s, documentName: s })),
            reason: r.reason,
            generated: r.decision === "GENERATED",
          };
        } else {
          decision = {
            fieldId: r.fieldId,
            decision: "ASK_USER",
            reason: r.reason ?? "Needs your answer",
          };
        }
        break;
      case "CONFLICT": {
        const key = classifyField(field)?.key;
        decision = {
          fieldId: r.fieldId,
          decision: "CONFLICT",
          reason: r.reason ?? "Your documents disagree",
          options: key ? distinctValues(profile, key) : undefined,
        };
        break;
      }
      case "SENSITIVE":
        decision = {
          fieldId: r.fieldId,
          decision: "SENSITIVE",
          reason: r.reason ?? "Sensitive information — you decide",
          sensitive: true,
        };
        break;
      case "DO_NOT_FILL":
        decision = {
          fieldId: r.fieldId,
          decision: "DO_NOT_FILL",
          reason: r.reason ?? "Security field",
          sensitive: true,
        };
        break;
      default:
        decision = {
          fieldId: r.fieldId,
          decision: r.decision === "UNKNOWN" ? "UNKNOWN" : "ASK_USER",
          reason: r.reason ?? (r.decision === "UNKNOWN" ? "No reliable source" : "Needs your answer"),
        };
    }
    if (existingIdx >= 0) decisions[existingIdx] = decision;
    else decisions.push(decision);
  }
}

/**
 * Respect "never overwrite": if the user already typed into a field we planned
 * to fill, mark it preserved and exclude it from the fill instructions.
 */
function applyPreserve(
  fields: DetectedField[],
  decisions: FieldDecision[],
  settings: AppSettings
): FormPlan {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const next = decisions.map((d) => {
    const field = fieldById.get(d.fieldId);
    const fillable =
      d.decision === "EXACT" || d.decision === "DERIVED" || d.decision === "GENERATED";
    if (field && fillable && d.value && field.hasValue && settings.neverOverwrite) {
      return {
        ...d,
        reason: "Already filled by you — left as is",
        preserved: true,
      };
    }
    return d;
  });
  const plan: FormPlan = {
    url: "",
    title: "",
    decisions: next,
    items: [],
    summary: {
      total: fields.length,
      ready: 0,
      needYou: 0,
      review: 0,
      unknown: 0,
      doNotFill: 0,
    },
    aiAvailable: false,
    aiUsed: false,
  };
  return summarizePlan(plan, fields);
}

function summarize(
  snapshot: FieldSnapshot,
  plan: FormPlan,
  aiAvailable: boolean,
  aiUsed: boolean
): FormPlan {
  return {
    url: snapshot.url,
    title: snapshot.title,
    decisions: plan.decisions,
    items: plan.items,
    summary: plan.summary,
    aiAvailable,
    aiUsed,
  };
}

function summarizePlan(
  plan: FormPlan,
  fields: DetectedField[]
): FormPlan {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const items: ReviewItem[] = [];
  let ready = 0;
  let needYou = 0;
  let review = 0;
  let unknown = 0;
  let doNotFill = 0;

  for (const d of plan.decisions) {
    const field = fieldById.get(d.fieldId);
    switch (d.decision) {
      case "EXACT":
      case "DERIVED":
      case "GENERATED":
        ready += 1;
        if (d.preserved) {
          items.push({
            fieldId: d.fieldId,
            field: field!,
            decision: d,
            question: field ? questionFor(field) : "",
          });
        }
        break;
      case "ASK_USER":
        needYou += 1;
        items.push({
          fieldId: d.fieldId,
          field: field!,
          decision: d,
          question: field ? questionFor(field) : "",
        });
        break;
      case "CONFLICT":
      case "SENSITIVE":
        review += 1;
        items.push({
          fieldId: d.fieldId,
          field: field!,
          decision: d,
          question: field ? questionFor(field) : "",
        });
        break;
      case "UNKNOWN":
        unknown += 1;
        items.push({
          fieldId: d.fieldId,
          field: field!,
          decision: d,
          question: field ? questionFor(field) : "",
        });
        break;
      case "DO_NOT_FILL":
        doNotFill += 1;
        break;
    }
  }

  return { ...plan, items, summary: { total: fields.length, ready, needYou, review, unknown, doNotFill } };
}

/** Resolve a profile conflict from the review UI. */
export async function resolveProfileConflict(
  profile: Profile,
  key: ProfileKey,
  chosen: string
): Promise<Profile> {
  return resolveConflict(profile, key, chosen);
}