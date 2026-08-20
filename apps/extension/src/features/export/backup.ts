import type {
  DocumentMetadata} from "@fillin/schemas";
import {
  AnswersStoreSchema,
  ProfileSchema,
} from "@fillin/schemas";
import { z } from "zod";
import type { DocumentService } from "../documents/service";
import { getAnswers, getDocuments, getProfile, loadAll, putDocument, setProfile } from "../../storage/chrome-store";
import { clearAllIndexedDB, storeBlob } from "../../storage/db";
import { getKey, encryptBytes, decryptBytes } from "../../encryption";
import { getSettings } from "../../storage/chrome-store";

const FORMAT = "fillin-backup";
const VERSION = 1;
const PBKDF2_ITERATIONS = 210_000;

const BackupContainerSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  exportedAt: z.number().int(),
  salt: z.string(),
  iv: z.string(),
  data: z.string(),
});

const BundleSchema = z.object({
  documents: z.array(
    z.object({
      metadata: z.unknown(),
      mimeType: z.string().optional(),
      blobB64: z.string().optional(),
    })
  ),
  profile: z.unknown(),
  answers: z.unknown(),
});

export interface BackupResult {
  name: string;
  blob: Blob;
}

function bytesToB64(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const u8 =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function deriveExportKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Export everything as an encrypted backup. The export passphrase is required;
 * the file is never plain JSON.
 */
export async function exportBackup(
  passphrase: string,
  docService: DocumentService
): Promise<BackupResult> {
  if (passphrase.length < 8) {
    throw new Error("Use a passphrase with at least 8 characters.");
  }
  const [documents, profile, answers] = await Promise.all([
    getDocuments(),
    getProfile(),
    getAnswers(),
  ]);

  const docs: { metadata: unknown; mimeType?: string; blobB64?: string }[] = [];
  for (const meta of documents) {
    const raw = await docService.getRawBlob(meta.id);
    docs.push({
      metadata: meta,
      mimeType: meta.mimeType,
      blobB64: raw ? bytesToB64(raw) : undefined,
    });
  }

  const bundle = BundleSchema.parse({ documents: docs, profile, answers });
  const json = JSON.stringify(bundle);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveExportKey(passphrase, salt);
  const payload = await encryptBytes(new TextEncoder().encode(json), key);
  const container = BackupContainerSchema.parse({
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    salt: bytesToB64(salt),
    iv: payload.iv,
    data: payload.data,
  });

  return {
    name: `fillin-backup-${new Date().toISOString().slice(0, 10)}.fillin`,
    blob: new Blob([JSON.stringify(container)], {
      type: "application/json",
    }),
  };
}

/**
 * Import an encrypted backup. Restores documents, profile and saved answers.
 */
export async function importBackup(
  file: File,
  passphrase: string,
  docService: DocumentService
): Promise<void> {
  const container = BackupContainerSchema.safeParse(JSON.parse(await file.text()));
  if (!container.success) {
    throw new Error("This does not look like a Fillin backup file.");
  }

  const salt = b64ToBytes(container.data.salt);
  const key = await deriveExportKey(passphrase, salt);
  let json: string;
  try {
    const buf = await decryptBytes(
      { iv: container.data.iv, data: container.data.data },
      key
    );
    json = new TextDecoder().decode(buf);
  } catch {
    throw new Error("That passphrase is incorrect.");
  }

  const bundle = BundleSchema.safeParse(JSON.parse(json));
  if (!bundle.success) {
    throw new Error("This backup could not be read.");
  }

  // Wipe current data first, then restore.
  await clearAllIndexedDB();
  await chrome.storage.local.clear();
  await loadAll();

  const deviceKey = await getKey();
  const settings = await getSettings();
  const restoreIds: string[] = [];

  for (const doc of bundle.data.documents) {
    const meta = doc.metadata as Partial<DocumentMetadata>;
    if (!meta?.name) continue;

    const id = meta.id ?? crypto.randomUUID();
    const data = doc.blobB64 ? b64ToBytes(doc.blobB64).buffer : new ArrayBuffer(0);

    if (settings.encryptDocuments && data.byteLength > 0) {
      const payload = await encryptBytes(data, deviceKey);
      await storeBlob({
        documentId: id,
        iv: payload.iv,
        data: payload.data,
        mimeType: doc.mimeType ?? meta.mimeType ?? "application/octet-stream",
        encrypted: true,
        sizeBytes: meta.sizeBytes ?? data.byteLength,
        storedAt: Date.now(),
      });
    } else {
      await storeBlob({
        documentId: id,
        iv: "",
        data: bytesToB64(data),
        mimeType: doc.mimeType ?? meta.mimeType ?? "application/octet-stream",
        encrypted: false,
        sizeBytes: meta.sizeBytes ?? data.byteLength,
        storedAt: Date.now(),
      });
    }

    await putDocument({
      id,
      name: meta.name,
      type: meta.type ?? "OTHER",
      kind: meta.kind ?? "PDF",
      sizeBytes: meta.sizeBytes ?? data.byteLength,
      addedAt: meta.addedAt ?? Date.now(),
      updatedAt: Date.now(),
      extractionStatus: "PENDING",
      mimeType: doc.mimeType ?? meta.mimeType,
      storageRef: `blob:${id}`,
    });
    restoreIds.push(id);
  }

  // Re-extract the restored documents so excerpts / profile hints work again.
  for (const id of restoreIds) {
    await docService.extract(id).catch(() => undefined);
  }

  if (bundle.data.profile) {
    await setProfile(ProfileSchema.parse(bundle.data.profile));
  }
  if (bundle.data.answers) {
    await chrome.storage.local.set({
      "fillin.answers": AnswersStoreSchema.parse(bundle.data.answers),
    });
  }
}