import { loadAll } from "../storage/chrome-store";
import { loadKeyState } from "../encryption";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
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