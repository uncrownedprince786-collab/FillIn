/** Fields Fillin will never auto-populate. */
export const DO_NOT_FILL_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /\bpwd\b/i,
  /otp/i,
  /one[- ]time/i,
  /two[- ]factor/i,
  /\b2fa\b/i,
  /verification code/i,
  /captcha/i,
  /recaptcha/i,
  /\bpin\b/i,
  /cvv/i,
  /\bcvc\b/i,
  /security code/i,
  /authentication code/i,
  /secret\b/i,
  /auth token/i,
  /new password/i,
  /confirm password/i,
  /current password/i,
];

/**
 * Fields that hold sensitive personal data. Fillin never fills these without
 * an explicit user choice in the review UI.
 */
export const SENSITIVE_PATTERNS: RegExp[] = [
  /cnic/i,
  /passport/i,
  /national id/i,
  /national identity/i,
  /social security/i,
  /\bssn\b/i,
  /tax id/i,
  /tax number/i,
  /\bntn\b/i,
  /\btin\b/i,
  /iban/i,
  /bank account/i,
  /routing number/i,
  /sort code/i,
  /salary/i,
  /compensation/i,
  /credit card/i,
  /debit card/i,
  /card number/i,
  /atm\b/i,
  /financial/i,
];

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Map document types to the file-input accept hints that suggest them. */
export const FILE_ACCEPT_RULES: { keys: RegExp[]; docTypes: string[] }[] = [
  {
    keys: [/resume/i, /\bcv\b/i, /curriculum/i, /vitae/i],
    docTypes: ["RESUME", "CV"],
  },
  {
    keys: [/cover letter/i, /cover-letter/i],
    docTypes: ["COVER_LETTER"],
  },
  {
    keys: [/degree/i, /transcript/i, /academic/i, /diploma/i],
    docTypes: ["DEGREE", "TRANSCRIPT"],
  },
  {
    keys: [/certificate/i, /certification/i],
    docTypes: ["CERTIFICATE"],
  },
  {
    keys: [/passport/i],
    docTypes: ["PASSPORT"],
  },
  {
    keys: [/cnic/i, /national id/i, /id card/i, /identity/i],
    docTypes: ["CNIC", "ID_CARD"],
  },
  {
    keys: [/experience letter/i, /employment letter/i],
    docTypes: ["EXPERIENCE_LETTER", "EMPLOYMENT_DOCUMENT"],
  },
  {
    keys: [/address/i, /utility bill/i],
    docTypes: ["ADDRESS_DOCUMENT"],
  },
];

export function suggestDocumentTypesForField(text: string): string[] {
  for (const rule of FILE_ACCEPT_RULES) {
    if (rule.keys.some((r) => r.test(text))) return rule.docTypes;
  }
  return [];
}