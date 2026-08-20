import type { ProfileKey } from "@fillin/schemas";

export interface Hint {
  key: ProfileKey;
  value: string;
  excerpt?: string;
}

const MAX_LINE = 200;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\s\-()]*){8,15}\d/g;
const URL_RE = /https?:\/\/[^\s]+/g;

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m?.[0] ?? undefined;
}

function cleanUrl(url: string): string {
  return url.replace(/[),.;]+$/, "");
}

/**
 * Local, honest extraction heuristics. These are intentionally conservative:
 * only facts we can find with high-confidence patterns are extracted locally.
 * The AI-assisted extraction pass adds more.
 */
export function extractHints(text: string): Hint[] {
  const hints: Hint[] = [];
  const push = (key: ProfileKey, value: string, excerpt?: string): void => {
    if (!value || !value.trim()) return;
    const clean = value.trim().slice(0, 400);
    hints.push({ key, value: clean, excerpt });
  };

  // Contact info
  const email = firstMatch(text, EMAIL_RE);
  if (email) push("contact.email", email);

  const phone = firstMatch(text, PHONE_RE);
  if (phone && phone.replace(/\D/g, "").length >= 7) push("contact.phone", phone);

  for (const url of text.match(URL_RE) ?? []) {
    const clean = cleanUrl(url);
    if (/linkedin\.com/i.test(clean)) {
      push("contact.linkedin", clean);
    } else if (!/facebook|twitter|x\.com|instagram|youtube|github/i.test(clean)) {
      push("contact.website", clean);
    }
  }

  for (const line of lines(text)) {
    if (line.length > MAX_LINE) continue;

    // Education
    if (/(bachelor|b\.?s\.?c|b\.?sc|b\.?a\.?|master|m\.?s\.?c|mba|m\.?b\.?a|ph\.?d|phd|associate degree|diploma)/i.test(line)) {
      push("education.degree", line, line);
    }
    if (/(university|college|institute of|academy)/i.test(line) && line.length < 120) {
      push("education.institution", line, line);
    }
    const gpa = line.match(/(?:gpa|cgpa)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (gpa && /[0-9]/.test(gpa[1] ?? "")) {
      push("education.gpa", gpa[1]!, line);
    }

    // Employment
    if (/(software engineer|developer|engineer|designer|manager|analyst|consultant|architect|specialist|officer|executive|administrator)/i.test(line) && line.length < 120) {
      push("employment.jobTitle", line, line);
    }
    const atCompany = line.match(/(?:at|@)\s+([A-Z][A-Za-z0-9&'.-]{2,}(?:\s+[A-Za-z0-9&'.-]{2,}){0,3})/);
    if (atCompany?.[1] && !/(university|college|school)/i.test(atCompany[1]!)) {
      push("employment.company", atCompany[1]!, line);
    }
  }

  // Deduplicate (key+value) within one document
  const seen = new Set<string>();
  return hints.filter((h) => {
    const id = `${h.key}|${h.value.toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}