import type { Table } from "dexie";
import Dexie from "dexie";
import type { ExtractedDocument} from "@fillin/schemas";
import { ExtractedDocumentSchema } from "@fillin/schemas";

export interface StoredBlob {
  documentId: string;
  /** IV + ciphertext, base64. Empty when encryption is disabled. */
  iv: string;
  data: string;
  mimeType: string;
  encrypted: boolean;
  sizeBytes: number;
  storedAt: number;
}

class FillinDB extends Dexie {
  blobs!: Table<StoredBlob, string>;
  extracted!: Table<ExtractedDocument, string>;

  constructor() {
    super("fillin");
    this.version(1).stores({
      blobs: "documentId",
      extracted: "documentId",
    });
  }
}

let db: FillinDB | null = null;

export function getDB(): FillinDB {
  if (!db) db = new FillinDB();
  return db;
}

export async function storeBlob(
  record: StoredBlob
): Promise<void> {
  await getDB().blobs.put(record);
}

export async function getBlob(
  documentId: string
): Promise<StoredBlob | undefined> {
  return getDB().blobs.get(documentId);
}

export async function deleteBlob(documentId: string): Promise<void> {
  await getDB().blobs.delete(documentId);
}

export async function storeExtracted(doc: ExtractedDocument): Promise<void> {
  const parsed = ExtractedDocumentSchema.parse(doc);
  await getDB().extracted.put(parsed);
}

export async function getExtracted(
  documentId: string
): Promise<ExtractedDocument | undefined> {
  return getDB().extracted.get(documentId);
}

export async function deleteExtracted(documentId: string): Promise<void> {
  await getDB().extracted.delete(documentId);
}

export async function deleteDocumentData(documentId: string): Promise<void> {
  await Promise.all([deleteBlob(documentId), deleteExtracted(documentId)]);
}

export async function clearAllIndexedDB(): Promise<void> {
  await getDB().delete();
  db = null;
}

export async function getAllExtracted(): Promise<ExtractedDocument[]> {
  return getDB().extracted.toArray();
}