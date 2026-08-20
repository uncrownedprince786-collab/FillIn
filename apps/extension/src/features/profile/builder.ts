import type {
  Conflict,
  Profile,
  ProfileFact,
  ProfileKey,
  SourceRef,
} from "@fillin/schemas";
import type { Hint } from "../documents/hints";
import { normalizeValue } from "@fillin/shared";

/**
 * Merges extracted hints into the profile, keeping source attribution and
 * creating conflict records when sources disagree. Never guesses.
 */
export function mergeHints(
  profile: Profile,
  hints: Hint[],
  source: SourceRef
): Profile {
  const facts: ProfileFact[] = profile.facts.map((f) => ({ ...f, sources: [...f.sources] }));
  const conflicts: Conflict[] = profile.conflicts.map((c) => ({
    ...c,
    values: [...c.values],
  }));
  const now = Date.now();

  for (const hint of hints) {
    const value = normalizeValue(hint.value);
    if (!value) continue;

    const keyed = facts.filter((f) => f.key === hint.key);

    // Exact same value from the same document → just ensure the source is noted.
    const sameDocSameValue = keyed.find(
      (f) =>
        normalizeValue(f.value) === value &&
        f.sources.some((s) => s.documentId === source.documentId)
    );
    if (sameDocSameValue) continue;

    // Same value from a different document → add the source.
    const sameValueOtherDoc = keyed.find((f) => normalizeValue(f.value) === value);
    if (sameValueOtherDoc) {
      const fact = { ...sameValueOtherDoc };
      fact.sources = [...fact.sources, source];
      facts[facts.indexOf(sameValueOtherDoc)] = fact;
      continue;
    }

    // A different value for an existing key → record a conflict (unless the
    // existing value was user-confirmed, which wins).
    const existing = keyed[0];
    if (existing && existing.userConfirmed) {
      continue;
    }
    if (existing) {
      const open = conflicts.find(
        (c) => c.key === hint.key && c.status === "OPEN"
      );
      const values = [existing.value, value];
      if (open) {
        for (const v of values) {
          if (!open.values.some((x) => x.value === v)) {
            open.values.push({ value: v, documentId: source.documentId, documentName: source.documentName });
          }
        }
      } else {
        conflicts.push({
          key: hint.key,
          values: [
            { value: existing.value, documentId: existing.sources[0]?.documentId ?? "", documentName: existing.sources[0]?.documentName },
            { value, documentId: source.documentId, documentName: source.documentName },
          ],
          status: "OPEN",
        });
      }
      continue;
    }

    facts.push({
      key: hint.key,
      value,
      sources: [source],
      confidence: "medium",
      addedAt: now,
      updatedAt: now,
    });
  }

  return { version: 1, facts, conflicts, builtAt: now };
}

/** All facts for a key. */
export function factsForKey(profile: Profile, key: ProfileKey): ProfileFact[] {
  return profile.facts.filter((f) => f.key === key);
}

/** Distinct values for a key. */
export function distinctValues(profile: Profile, key: ProfileKey): string[] {
  return Array.from(new Set(factsForKey(profile, key).map((f) => f.value)));
}

/** Resolve the effective value for a key, honoring conflicts and user choice. */
export function resolveValue(profile: Profile, key: ProfileKey): ProfileFact | null {
  const facts = factsForKey(profile, key);
  if (facts.length === 0) return null;
  const confirmed = facts.find((f) => f.userConfirmed);
  if (confirmed) return confirmed;

  const openConflict = profile.conflicts.find(
    (c) => c.key === key && c.status === "OPEN"
  );
  if (openConflict) {
    // If a resolved value was recorded, prefer it.
    if (openConflict.resolvedValue) {
      const match = facts.find((f) => f.value === openConflict.resolvedValue);
      if (match) return match;
    }
    return null; // conflict unresolved → caller must ask the user
  }

  return facts[0] ?? null;
}

export function openConflict(profile: Profile, key: ProfileKey): Conflict | null {
  return profile.conflicts.find((c) => c.key === key && c.status === "OPEN") ?? null;
}

export function resolveConflict(
  profile: Profile,
  key: ProfileKey,
  chosenValue: string
): Profile {
  const conflicts = profile.conflicts.map((c) => ({ ...c, values: [...c.values] }));
  const target = conflicts.find((c) => c.key === key && c.status === "OPEN");
  if (target) {
    target.status = "RESOLVED";
    target.resolvedValue = chosenValue;
    target.resolvedAt = Date.now();
  }
  // Mark the chosen fact as user-confirmed so it always wins afterwards.
  // If the chosen value only existed inside the conflict record (it was never
  // promoted to a fact), promote it now so it can actually be filled.
  const facts = profile.facts.map((f) =>
    f.key === key && f.value === chosenValue ? { ...f, userConfirmed: true } : f
  );
  if (!facts.some((f) => f.key === key && f.value === chosenValue)) {
    const valueSources = (target?.values ?? [])
      .filter((v) => v.value === chosenValue)
      .map((v) => ({
        documentId: v.documentId,
        documentName: v.documentName,
      }));
    facts.push({
      key,
      value: chosenValue,
      sources: valueSources.length ? valueSources : [{ documentId: "" }],
      confidence: "high",
      userConfirmed: true,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return { version: 1, facts, conflicts, builtAt: Date.now() };
}

/** Derive simple values that are safe to compute locally. */
export function deriveValue(key: ProfileKey, profile: Profile): string | null {
  switch (key) {
    case "personal.fullName": {
      const first = resolveValue(profile, "personal.firstName");
      const last = resolveValue(profile, "personal.lastName");
      if (first && last) return `${first.value} ${last.value}`.trim();
      return null;
    }
    default:
      return null;
  }
}

/** Facts whose value passes a basic sanity check for the key. */
export function validateFactValue(key: ProfileKey, value: string): boolean {
  if (!value.trim()) return false;
  switch (key) {
    case "contact.email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
    case "contact.phone":
      return value.replace(/\D/g, "").length >= 7;
    default:
      return true;
  }
}