import type { ProfileKey } from "@fillin/schemas";

/**
 * Normalizes user-visible text for matching. Lowercases, collapses whitespace,
 * strips diacritics and common punctuation noise.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize for exact-value comparison (emails, names etc). */
export function normalizeValue(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function maskValue(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  return `${v.slice(0, 2)}${"*".repeat(Math.max(4, v.length - 6))}${v.slice(-2)}`;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isPhoneLike(value: string): boolean {
  // at least 7 digits, allows + ( ) - and spaces
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function isUrlLike(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isDateLike(value: string): boolean {
  return (
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value.trim()) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(value.trim())
  );
}

/**
 * Clean human-readable keys for the AI. Strips sensitive values from labels.
 */
export function toDisplayKey(key: string): string {
  return key
    .replace(/^personal\./, "")
    .replace(/^contact\./, "")
    .replace(/^address\./, "address ")
    .replace(/^education\./, "education ")
    .replace(/^employment\./, "employment ")
    .replace(/^financial\./, "financial ")
    .replace(/\.list$/, " (list)")
    .replace(/\./g, " ");
}

/** Classify a ProfileKey into a coarse category for retrieval. */
export function categoryForKey(key: ProfileKey): string {
  if (key.startsWith("education")) return "education";
  if (key.startsWith("employment")) return "employment";
  if (key.startsWith("address")) return "address";
  if (key.startsWith("contact")) return "contact";
  if (key.startsWith("skill")) return "skills";
  if (key.startsWith("certification")) return "certifications";
  if (key.startsWith("language")) return "languages";
  if (key.startsWith("financial")) return "financial";
  if (key.startsWith("id.")) return "identification";
  return "personal";
}

/** Shortened excerpt of a document text around an interesting hit. */
export function extractAround(
  haystack: string,
  needle: string,
  radius = 180
): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return haystack.slice(0, 400);
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  return prefix + haystack.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}