import { loadAll } from "../storage/chrome-store";
import { loadKeyState } from "../encryption";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Handle content script injection requests from the side panel.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FILLIN_ENSURE_CONTENT") {
    const tabId = msg.tabId as number;
    if (!tabId) { sendResponse({ ok: false, error: "No tabId" }); return; }

    // Try pinging first
    chrome.tabs.sendMessage(tabId, { type: "FILLIN_PING" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        // Inject the content script from background (which has full permissions)
        chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        }).then(() => {
          // Wait a tick for the listener to register, then verify
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: "FILLIN_PING" }, (res2) => {
              sendResponse({ ok: !chrome.runtime.lastError && !!res2 });
            });
          }, 150);
        }).catch((err) => {
          sendResponse({ ok: false, error: String(err) });
        });
        return true; // async sendResponse
      }
      sendResponse({ ok: true });
      return true;
    });
    return true; // async sendResponse
  }
});

// Notify the side panel when the user switches tabs or navigates.
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    chrome.runtime.sendMessage({ type: "FILLIN_TAB_CHANGED", tabId: tab.id, url: tab.url }).catch(() => undefined);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    chrome.runtime.sendMessage({ type: "FILLIN_TAB_CHANGED", tabId, url: tab.url }).catch(() => undefined);
  }
});

// Prime caches so the first side-panel open is fast.
void loadKeyState().then(() => loadAll()).catch(() => undefined);

export {};