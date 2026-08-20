import { z } from "zod";

export const AppSettingsSchema = z.object({
  /** Vercel API base URL the extension calls for AI operations. */
  apiBaseUrl: z.string().url(),
  /** Optional passphrase protecting sensitive local data (AES-GCM, PBKDF2). */
  passphraseSet: z.boolean(),
  /** When false, only the minimum data is sent to the API (default). */
  aiEnabled: z.boolean(),
  /** Automatic extraction on document add. */
  autoExtract: z.boolean(),
  /** Fill only after user review, never silently. */
  confirmBeforeFill: z.boolean(),
  /** Never overwrite fields the user already typed. */
  neverOverwrite: z.boolean(),
  /** Store document blobs encrypted at rest. */
  encryptDocuments: z.boolean(),
  /** Last action ids / misc app state. */
  lastBuiltAt: z.number().int().optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: "http://localhost:3000",
  passphraseSet: false,
  aiEnabled: true,
  autoExtract: true,
  confirmBeforeFill: true,
  neverOverwrite: true,
  encryptDocuments: true,
};

// ---------------------------------------------------------------------------
// Saved user answers keyed by normalized question text
// ---------------------------------------------------------------------------

export const SavedAnswerSchema = z.object({
  /** normalized question text that identifies the question */
  question: z.string(),
  answer: z.string(),
  updatedAt: z.number().int(),
});
export type SavedAnswer = z.infer<typeof SavedAnswerSchema>;

export const AnswersStoreSchema = z.record(SavedAnswerSchema);
export type AnswersStore = z.infer<typeof AnswersStoreSchema>;