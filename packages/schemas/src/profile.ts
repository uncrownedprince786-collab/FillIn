import { z } from "zod";

/**
 * Semantic keys Fillin understands. The profile is an extensible map from
 * these keys to facts. Keys are grouped by category so the retrieval layer can
 * select only the relevant slice of the profile before calling AI.
 */
export const ProfileCategory = z.enum([
  "PERSONAL_INFORMATION",
  "CONTACT_INFORMATION",
  "ADDRESS",
  "EDUCATION",
  "EMPLOYMENT",
  "EXPERIENCE",
  "SKILLS",
  "CERTIFICATIONS",
  "LANGUAGES",
  "DOCUMENT",
  "FINANCIAL",
  "OTHER",
]);
export type ProfileCategory = z.infer<typeof ProfileCategory>;

export const CATEGORY_FOR_KEY: Record<string, ProfileCategory> = {
  // Personal
  "personal.fullName": "PERSONAL_INFORMATION",
  "personal.firstName": "PERSONAL_INFORMATION",
  "personal.lastName": "PERSONAL_INFORMATION",
  "personal.dateOfBirth": "PERSONAL_INFORMATION",
  "personal.gender": "PERSONAL_INFORMATION",
  "personal.nationality": "PERSONAL_INFORMATION",
  "personal.maritalStatus": "PERSONAL_INFORMATION",
  "personal.fatherName": "PERSONAL_INFORMATION",
  // Contact
  "contact.email": "CONTACT_INFORMATION",
  "contact.phone": "CONTACT_INFORMATION",
  "contact.phoneAlt": "CONTACT_INFORMATION",
  "contact.linkedin": "CONTACT_INFORMATION",
  "contact.website": "CONTACT_INFORMATION",
  // Address
  "address.street": "ADDRESS",
  "address.street2": "ADDRESS",
  "address.city": "ADDRESS",
  "address.state": "ADDRESS",
  "address.postalCode": "ADDRESS",
  "address.country": "ADDRESS",
  // Education
  "education.institution": "EDUCATION",
  "education.degree": "EDUCATION",
  "education.field": "EDUCATION",
  "education.startDate": "EDUCATION",
  "education.endDate": "EDUCATION",
  "education.gpa": "EDUCATION",
  "education.level": "EDUCATION",
  // Employment
  "employment.company": "EMPLOYMENT",
  "employment.jobTitle": "EMPLOYMENT",
  "employment.startDate": "EMPLOYMENT",
  "employment.endDate": "EMPLOYMENT",
  "employment.employmentType": "EMPLOYMENT",
  "employment.current": "EMPLOYMENT",
  // Skills, certifications, languages
  "skill.list": "SKILLS",
  "certification.list": "CERTIFICATIONS",
  "language.list": "LANGUAGES",
  // Financial
  "financial.salaryExpected": "FINANCIAL",
  "financial.currency": "FINANCIAL",
  // Identification (sensitive)
  "id.cnic": "PERSONAL_INFORMATION",
  "id.passport": "PERSONAL_INFORMATION",
  "id.taxNumber": "PERSONAL_INFORMATION",
  "id.bankAccount": "FINANCIAL",
};

export const ProfileKey = z.enum([
  "personal.fullName",
  "personal.firstName",
  "personal.lastName",
  "personal.dateOfBirth",
  "personal.gender",
  "personal.nationality",
  "personal.maritalStatus",
  "personal.fatherName",
  "contact.email",
  "contact.phone",
  "contact.phoneAlt",
  "contact.linkedin",
  "contact.website",
  "address.street",
  "address.street2",
  "address.city",
  "address.state",
  "address.postalCode",
  "address.country",
  "education.institution",
  "education.degree",
  "education.field",
  "education.startDate",
  "education.endDate",
  "education.gpa",
  "education.level",
  "employment.company",
  "employment.jobTitle",
  "employment.startDate",
  "employment.endDate",
  "employment.employmentType",
  "employment.current",
  "skill.list",
  "certification.list",
  "language.list",
  "financial.salaryExpected",
  "financial.currency",
  "id.cnic",
  "id.passport",
  "id.taxNumber",
  "id.bankAccount",
]);
export type ProfileKey = z.infer<typeof ProfileKey>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const SourceRefSchema = z.object({
  documentId: z.string(),
  documentName: z.string().optional(),
  page: z.number().int().positive().optional(),
  /** Short supporting excerpt. Never a whole document. */
  excerpt: z.string().max(1000).optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ProfileFactSchema = z.object({
  key: ProfileKey,
  value: z.string(),
  sources: z.array(SourceRefSchema).min(1),
  confidence: Confidence,
  addedAt: z.number().int(),
  updatedAt: z.number().int(),
  /** user-confirmed facts override document extraction */
  userConfirmed: z.boolean().optional(),
  /** masked representation for display where sensitive */
  masked: z.string().optional(),
});
export type ProfileFact = z.infer<typeof ProfileFactSchema>;

export const ConflictSchema = z.object({
  key: ProfileKey,
  values: z
    .array(
      z.object({
        value: z.string(),
        documentId: z.string(),
        documentName: z.string().optional(),
      })
    )
    .min(2),
  resolvedValue: z.string().optional(),
  resolvedAt: z.number().int().optional(),
  status: z.enum(["OPEN", "RESOLVED"]),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const ProfileSchema = z.object({
  version: z.number().int(),
  facts: z.array(ProfileFactSchema),
  conflicts: z.array(ConflictSchema),
  builtAt: z.number().int().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** A deliberately small, safe slice of the profile shared with the AI. */
export const AISafeFactSchema = z.object({
  key: ProfileKey,
  value: z.string(),
});
export type AISafeFact = z.infer<typeof AISafeFactSchema>;

export const EMPTY_PROFILE: Profile = { version: 1, facts: [], conflicts: [] };

export const SENSITIVE_KEYS: ProfileKey[] = [
  "id.cnic",
  "id.passport",
  "id.taxNumber",
  "id.bankAccount",
  "financial.salaryExpected",
];

/** Facts that should never be auto-included in AI context. */
export const NEVER_SEND_TO_AI: ProfileKey[] = [
  "id.cnic",
  "id.passport",
  "id.taxNumber",
  "id.bankAccount",
];