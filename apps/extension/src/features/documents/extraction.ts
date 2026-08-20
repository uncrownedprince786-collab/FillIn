import type { DocumentKind} from "@fillin/schemas";
import { hashString } from "../../utils";

export interface ExtractionResult {
  text: string;
  pageTexts: string[];
  kind: DocumentKind;
  mimeType: string;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(workerUrl, location.href).href;
  return pdfjs;
}

async function extractPdf(arrayBuffer: ArrayBuffer): Promise<{ text: string; pageTexts: string[] }> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await loadPdfjs();
  } catch {
    throw new ExtractionError("We couldn't read this PDF document.");
  }
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item.str as string) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pageTexts.push(pageText);
  }
  await doc.destroy();
  return { text: pageTexts.join("\n"), pageTexts };
}

async function extractImage(arrayBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  let createWorker: typeof import("tesseract.js").createWorker;
  try {
    ({ createWorker } = await import("tesseract.js"));
  } catch {
    throw new ExtractionError("We couldn't read this image.");
  }

  const workerUrl = chrome.runtime.getURL("ocr/worker.min.js");
  const corePath = chrome.runtime.getURL("ocr/core");
  const langPath = chrome.runtime.getURL("ocr/lang");

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker("eng", 1, {
      workerPath: workerUrl,
      corePath,
      langPath,
      logger: () => undefined,
    });
    const { data } = await worker.recognize(
      new Blob([arrayBuffer], { type: mimeType || "image/png" })
    );
    return data.text ?? "";
  } catch {
    throw new ExtractionError(
      "We couldn't read this image. Make sure it's a clear photo or scan."
    );
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

/**
 * Extract plain text from a PDF or image. PDFs are the primary path; image OCR
 * is best effort and requires the OCR assets that ship with the build.
 */
export async function extractDocument(
  arrayBuffer: ArrayBuffer,
  mimeType: string
): Promise<ExtractionResult> {
  const kind: DocumentKind = mimeType === "application/pdf" ? "PDF" : mimeType.startsWith("image/") ? "IMAGE" : "TEXT";

  if (kind === "PDF") {
    const { text, pageTexts } = await extractPdf(arrayBuffer);
    return { text, pageTexts, kind, mimeType };
  }
  if (kind === "IMAGE") {
    const text = await extractImage(arrayBuffer, mimeType);
    return { text, pageTexts: [text], kind, mimeType };
  }
  const text = new TextDecoder().decode(arrayBuffer);
  return { text, pageTexts: [text], kind, mimeType };
}

/** Deterministic fingerprint for de-duplicating re-added documents. */
export async function fingerprint(arrayBuffer: ArrayBuffer): Promise<string> {
  return hashString(String.fromCharCode(...new Uint8Array(arrayBuffer).subarray(0, 1_000_000)));
}