import type { FieldSnapshot} from "@fillin/schemas";
import { FieldSnapshotSchema } from "@fillin/schemas";
import type { FillInstruction, FillReport } from "../content/filler";

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

export function isFillableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("file://")
  );
}

export async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "FILLIN_PING" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function scanTab(tabId: number): Promise<FieldSnapshot | null> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: "FILLIN_SCAN",
    })) as { type: string; snapshot?: unknown } | undefined;
    if (!res || res.type !== "FILLIN_SCAN_RESULT" || !res.snapshot) return null;
    return FieldSnapshotSchema.parse(res.snapshot);
  } catch {
    return null;
  }
}

export async function fillTab(
  tabId: number,
  instructions: FillInstruction[]
): Promise<FillReport | null> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: "FILLIN_FILL",
      decisions: instructions,
    })) as { type: string; report?: FillReport } | undefined;
    if (!res || res.type !== "FILLIN_FILL_RESULT") return null;
    return res.report ?? null;
  } catch {
    return null;
  }
}

export async function selectFileForField(
  tabId: number,
  fieldId: string,
  fileName: string,
  mimeType: string,
  data: ArrayBuffer
): Promise<boolean> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: "FILLIN_SELECT_FILE",
      fieldId,
      fileName,
      mimeType,
      data,
    })) as { type: string; ok?: boolean } | undefined;
    return res?.type === "FILLIN_FILE_RESULT" && !!res.ok;
  } catch {
    return false;
  }
}

export async function watchTab(tabId: number, enabled: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "FILLIN_WATCH", enabled });
  } catch {
    /* content script not present */
  }
}

/** Receive async notifications from content scripts (e.g. dynamic fields). */
export function onContentMessage(
  handler: (message: unknown, sender: chrome.runtime.MessageSender) => void
): void {
  chrome.runtime.onMessage.addListener((message, sender) => {
    const msg = message as { type?: string };
    if (msg.type === "FILLIN_FIELDS_CHANGED") {
      handler(msg, sender);
    }
  });
}