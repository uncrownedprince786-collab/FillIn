import { loadAll } from "../storage/chrome-store";
import { loadKeyState } from "../encryption";

chrome.runtime.onInstalled.addListener(() => {
  // Open the side panel directly from the toolbar action.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Prime caches so the first side-panel open is fast.
void loadKeyState().then(() => loadAll()).catch(() => undefined);

export {};