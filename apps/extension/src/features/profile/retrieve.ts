import type {
  ExtractedDocument,
  Profile,
  ProfileKey} from "@fillin/schemas";
import {
  NEVER_SEND_TO_AI
} from "@fillin/schemas";
import { extractAround, categoryForKey } from "@fillin/shared";
import { factsForKey } from "./builder";

const EXCERPT_LIMIT = 40;
const EXCERPT_RADIUS = 240;

export interface RelevantContext {
  facts: { key: string; value: string }[];
  excerpts: { key: string; value: string; source?: string }[];
}

/**
 * Data minimization: build the smallest context needed to answer the given
 * keys. Sensitive identifiers are never included.
 */
export function selectRelevantContext(
  profile: Profile,
  keys: ProfileKey[],
  extracted: Map<string, ExtractedDocument>,
  questionTexts: string[] = []
): RelevantContext {
  const facts: { key: string; value: string }[] = [];
  const seenFactKeys = new Set<string>();
  const excerpts: { key: string; value: string; source?: string }[] = [];

  const neededCategories = new Set<string>();
  for (const key of keys) {
    if (NEVER_SEND_TO_AI.includes(key)) continue;
    neededCategories.add(categoryForKey(key));
  }

  // Always include basic identity/contact so the model can disambiguate names
  // and provide minimal context — but never sensitive identifiers.
  const alwaysKeys: ProfileKey[] = [
    "personal.firstName",
    "personal.lastName",
    "personal.fullName",
    "contact.email",
    "contact.phone",
  ];

  const targetKeys = new Set<ProfileKey>(keys);
  for (const key of alwaysKeys) targetKeys.add(key);

  for (const key of targetKeys) {
    if (NEVER_SEND_TO_AI.includes(key)) continue;
    for (const fact of factsForKey(profile, key).slice(0, 2)) {
      const id = `${key}|${fact.value}`;
      if (seenFactKeys.has(id)) continue;
      seenFactKeys.add(id);
      facts.push({ key, value: fact.value.slice(0, 2000) });

      // short targeted excerpts from the fact's sources
      for (const source of fact.sources.slice(0, 2)) {
        const doc = extracted.get(source.documentId);
        if (!doc?.text) continue;
        const excerpt = extractAround(doc.text, fact.value, EXCERPT_RADIUS);
        if (excerpt && excerpts.length < EXCERPT_LIMIT) {
          excerpts.push({
            key,
            value: excerpt,
            source: source.documentName ?? source.documentId,
          });
        }
      }
    }
  }

  // For open-ended questions (e.g. "describe your experience") pull a bounded
  // slice of the most relevant document so the answer can be generated.
  if (questionTexts.length > 0) {
    const docs = Array.from(extracted.values());
    for (const doc of docs) {
      if (excerpts.length >= EXCERPT_LIMIT) break;
      if (doc.text.length < 120) continue;
      const slice = doc.text.replace(/\s+/g, " ").trim().slice(0, 1600);
      excerpts.push({ key: "experience", value: slice, source: doc.documentId });
    }
  }

  return { facts, excerpts };
}