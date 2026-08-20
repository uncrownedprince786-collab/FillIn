import { z } from "zod";

export const DocumentType = z.enum([
  "RESUME",
  "CV",
  "PASSPORT",
  "CNIC",
  "DEGREE",
  "TRANSCRIPT",
  "CERTIFICATE",
  "EXPERIENCE_LETTER",
  "COVER_LETTER",
  "ADDRESS_DOCUMENT",
  "EMPLOYMENT_DOCUMENT",
  "ID_CARD",
  "OTHER",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const DocumentKind = z.enum(["PDF", "IMAGE", "TEXT", "UNSUPPORTED"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const ExtractionStatus = z.enum([
  "PENDING",
  "EXTRACTING",
  "READY",
  "FAILED",
  "PARTIAL",
]);
export type ExtractionStatus = z.infer<typeof ExtractionStatus>;

export const DocumentMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: DocumentType,
  kind: DocumentKind,
  sizeBytes: z.number().int().nonnegative(),
  addedAt: z.number().int(),
  updatedAt: z.number().int(),
  extractionStatus: ExtractionStatus,
  pageCount: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  sha256: z.string().optional(),
  mimeType: z.string().optional(),
  storageRef: z.string(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

/** Full extracted text content for a document. Stored in IndexedDB. */
export const ExtractedDocumentSchema = z.object({
  documentId: z.string(),
  text: z.string(),
  pageTexts: z.array(z.string()).optional(),
  extractedAt: z.number().int(),
  /** List of fact-like key/value pairs pulled out during extraction. */
  hints: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

/** The raw blob payload used when uploading from UI to IndexedDB. */
export const DocumentBlobSchema = z.object({
  documentId: z.string(),
  data: z.instanceof(ArrayBuffer),
  encrypted: z.boolean(),
});
export type DocumentBlob = z.infer<typeof DocumentBlobSchema>;

export const AddDocumentInputSchema = z.object({
  name: z.string().min(1).max(255),
  type: DocumentType,
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
  data: z.instanceof(ArrayBuffer),
});
export type AddDocumentInput = z.infer<typeof AddDocumentInputSchema>;
