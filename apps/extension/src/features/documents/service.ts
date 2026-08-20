import type {
  AddDocumentInput,
  DocumentMetadata,
  DocumentType,
  ExtractedDocument,
  Profile,
  ProfileKey,
} from "@fillin/schemas";
import {
  getBlob,
  storeBlob,
  storeExtracted,
  getExtracted,
  deleteDocumentData,
  getAllExtracted,
} from "../../storage/db";
import {
  getDocuments,
  getSettings,
  getProfile,
  putDocument,
  removeDocument,
  replaceDocument,
  setProfile,
} from "../../storage/chrome-store";
import { encryptBytes, decryptBytes, getKey } from "../../encryption";
import { extractDocument, ExtractionError, fingerprint } from "./extraction";
import type { Hint } from "./hints";
import { extractHints } from "./hints";
import { mergeHints, validateFactValue } from "../profile/builder";
import type { AIClient } from "../../ai/client";
import { uid } from "../../utils";

const EXTRACT_MAX_CHARS = 30000;

export class DocumentService {
  private aiClient: AIClient | null;

  constructor(ai: AIClient | null) {
    this.aiClient = ai;
  }

  setAi(ai: AIClient | null): void {
    this.aiClient = ai;
  }

  get ai(): AIClient | null {
    return this.aiClient;
  }

  async add(input: AddDocumentInput): Promise<DocumentMetadata> {
    const settings = await getSettings();
    const id = uid();

    const encrypted = settings.encryptDocuments;
    let iv = "";
    let dataB64 = "";
    if (encrypted) {
      const payload = await encryptBytes(input.data);
      iv = payload.iv;
      dataB64 = payload.data;
    } else {
      dataB64 = bytesToB64(input.data);
    }

    await storeBlob({
      documentId: id,
      iv,
      data: dataB64,
      mimeType: input.mimeType ?? "application/octet-stream",
      encrypted,
      sizeBytes: input.sizeBytes,
      storedAt: Date.now(),
    });

    const now = Date.now();
    const meta: DocumentMetadata = {
      id,
      name: input.name,
      type: input.type,
      kind: input.mimeType === "application/pdf" ? "PDF" : input.mimeType?.startsWith("image/") ? "IMAGE" : "TEXT",
      sizeBytes: input.sizeBytes,
      addedAt: now,
      updatedAt: now,
      extractionStatus: "PENDING",
      mimeType: input.mimeType,
      storageRef: `blob:${id}`,
    };
    await putDocument(meta);

    // Extraction is async; the caller can await it or watch status.
    void this.extract(id).catch(() => undefined);
    return meta;
  }

  async replace(id: string, input: AddDocumentInput): Promise<DocumentMetadata> {
    await this.remove(id);
    return this.add(input);
  }

  async remove(id: string): Promise<void> {
    await Promise.all([removeDocument(id), deleteDocumentData(id)]);
    // Rebuild the profile without this document.
    await this.rebuildProfile();
  }

  async getRawBlob(id: string): Promise<ArrayBuffer | null> {
    const record = await getBlob(id);
    if (!record) return null;
    if (record.encrypted) {
      const key = await getKey();
      return decryptBytes({ iv: record.iv, data: record.data }, key);
    }
    return b64ToBytes(record.data);
  }

  async extract(id: string): Promise<DocumentMetadata | null> {
    const docs = await getDocuments();
    const meta = docs.find((d) => d.id === id);
    if (!meta) return null;
    const updated = { ...meta, extractionStatus: "EXTRACTING" as const, updatedAt: Date.now() };
    await replaceDocument(id, updated);

    try {
      const blob = await this.getRawBlob(id);
      if (!blob) throw new ExtractionError("Document data is missing.");
      const result = await extractDocument(blob, meta.mimeType ?? "");
      const hints = extractHints(result.text);
      const extracted: ExtractedDocument = {
        documentId: id,
        text: result.text,
        pageTexts: result.pageTexts,
        extractedAt: Date.now(),
        hints,
      };
      await storeExtracted(extracted);
      const done: DocumentMetadata = {
        ...meta,
        extractionStatus: "READY",
        pageCount: result.kind === "PDF" ? result.pageTexts.length : undefined,
        updatedAt: Date.now(),
      };
      await replaceDocument(id, done);

      // Update the profile with this document's facts (local hints first).
      await this.applyExtractionToProfile(id, done, hints, []);
      return done;
    } catch (err) {
      const failed: DocumentMetadata = {
        ...meta,
        extractionStatus: "FAILED",
        error: err instanceof Error ? err.message : "We couldn't read this document.",
        updatedAt: Date.now(),
      };
      await replaceDocument(id, failed);
      return failed;
    }
  }

  /**
   * Merge a document's hints into the profile. Optional AI-assisted pass adds
   * more hints when the server is reachable.
   */
  private async applyExtractionToProfile(
    id: string,
    meta: DocumentMetadata,
    localHints: Hint[],
    aiHints: Hint[]
  ): Promise<Profile> {
    const profile = await getProfile();
    const source = {
      documentId: id,
      documentName: meta.name,
    };
    let next = mergeHints(profile, localHints, source);
    if (aiHints.length) next = mergeHints(next, aiHints, source);
    await setProfile(next);
    return next;
  }

  /** Rebuild the whole profile from all extracted documents. */
  async rebuildProfile(): Promise<Profile> {
    const docs = await getDocuments();
    const extracted = await getAllExtracted();
    let profile = { version: 1, facts: [], conflicts: [] } as Profile;
    for (const doc of extracted) {
      const meta = docs.find((d) => d.id === doc.documentId);
      if (!meta || meta.extractionStatus !== "READY") continue;
      const hints = (doc.hints as Hint[] | undefined) ?? extractHints(doc.text);
      profile = mergeHints(profile, hints, {
        documentId: doc.documentId,
        documentName: meta.name,
      });
    }
    await setProfile(profile);
    return profile;
  }

  /** AI-assisted extraction for a single document (best effort). */
  async aiExtract(id: string): Promise<boolean> {
    if (!this.ai) return false;
    const docs = await getDocuments();
    const meta = docs.find((d) => d.id === id);
    if (!meta) return false;
    const extracted = await getExtracted(id);
    if (!extracted || !extracted.text) return false;
    try {
      const resp = await this.ai.extract({
        documentName: meta.name,
        docType: meta.type,
        text: extracted.text.slice(0, EXTRACT_MAX_CHARS),
      });
      const validKeys = new Set<string>(Object.keys(SENSITIVE_KEYS_HINT));
      const hints: Hint[] = [];
      for (const h of resp.hints) {
        if (!validKeys.has(h.key)) continue;
        if (!validateFactValue(h.key as ProfileKey, h.value)) continue;
        hints.push({ key: h.key as ProfileKey, value: h.value });
      }
      await this.applyExtractionToProfile(id, meta, [], hints);
      return true;
    } catch {
      return false;
    }
  }

  async findDocumentByFingerprint(data: ArrayBuffer): Promise<DocumentMetadata | null> {
    const fp = await fingerprint(data);
    const docs = await getDocuments();
    return docs.find((d) => d.sha256 === fp) ?? null;
  }
}

// Kept small: only allow keys we can consume safely.
const SENSITIVE_KEYS_HINT: Record<string, boolean> = {
  "personal.fullName": true,
  "personal.firstName": true,
  "personal.lastName": true,
  "personal.dateOfBirth": true,
  "personal.gender": true,
  "personal.nationality": true,
  "personal.maritalStatus": true,
  "personal.fatherName": true,
  "contact.email": true,
  "contact.phone": true,
  "contact.phoneAlt": true,
  "contact.linkedin": true,
  "contact.website": true,
  "address.street": true,
  "address.street2": true,
  "address.city": true,
  "address.state": true,
  "address.postalCode": true,
  "address.country": true,
  "education.institution": true,
  "education.degree": true,
  "education.field": true,
  "education.startDate": true,
  "education.endDate": true,
  "education.gpa": true,
  "education.level": true,
  "employment.company": true,
  "employment.jobTitle": true,
  "employment.startDate": true,
  "employment.endDate": true,
  "employment.employmentType": true,
  "employment.current": true,
  "skill.list": true,
  "certification.list": true,
  "language.list": true,
  "financial.salaryExpected": true,
  "financial.currency": true,
};

function bytesToB64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

export type { DocumentType };