import { FieldSnapshotSchema } from "@fillin/schemas";
import type { FillInstruction, FillReport } from "./filler";
import { fillFields } from "./filler";
import { scanDocument } from "./scanner";

interface FillinMessage {
  type: string;
  fieldId?: string;
  decisions?: FillInstruction[];
  enabled?: boolean;
  fileName?: string;
  mimeType?: string;
  data?: ArrayBuffer;
}

let watching = false;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastFieldCount = -1;

function countVisibleFields(): number {
  return scanDocument().fields.filter((f) => f.visible).length;
}

function notifyFieldsChanged(): void {
  if (!watching) return;
  const count = countVisibleFields();
  if (count !== lastFieldCount) {
    lastFieldCount = count;
    chrome.runtime.sendMessage({ type: "FILLIN_FIELDS_CHANGED", count });
  }
}

function startWatching(): void {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(notifyFieldsChanged, 500);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  });
  lastFieldCount = countVisibleFields();
}

function stopWatching(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer) clearTimeout(debounceTimer);
  lastFieldCount = -1;
}

chrome.runtime.onMessage.addListener(
  (message: FillinMessage, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Unauthorized sender." });
      return undefined;
    }
    switch (message.type) {
      case "FILLIN_PING":
        sendResponse({ type: "FILLIN_PONG", ready: true });
        return undefined;
      case "FILLIN_SCAN": {
        const snapshot = scanDocument();
        FieldSnapshotSchema.parse(snapshot);
        sendResponse({ type: "FILLIN_SCAN_RESULT", snapshot });
        return undefined;
      }
      case "FILLIN_FILL": {
        const report: FillReport = fillFields(message.decisions ?? []);
        sendResponse({ type: "FILLIN_FILL_RESULT", report });
        return undefined;
      }
      case "FILLIN_WATCH": {
        watching = !!message.enabled;
        if (watching) startWatching();
        else stopWatching();
        sendResponse({ type: "FILLIN_WATCH_ACK", enabled: watching });
        return undefined;
      }
      case "FILLIN_SELECT_FILE": {
        const instructions: FillInstruction[] = [
          {
            fieldId: message.fieldId ?? "",
            kind: "file",
            fileName: message.fileName,
            mimeType: message.mimeType,
            data: message.data,
            force: true,
          },
        ];
        const report = fillFields(instructions);
        sendResponse({
          type: "FILLIN_FILE_RESULT",
          fieldId: message.fieldId,
          ok: report.filled > 0 && report.errors.length === 0,
        });
        return undefined;
      }
      default:
        sendResponse({ type: "FILLIN_UNKNOWN", ok: false });
        return undefined;
    }
  }
);