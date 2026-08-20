import React from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

function Popup() {
  const openPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    window.close();
  };

  return (
    <div style={{ width: 220, padding: 14 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Fillin</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 12px" }}>
        Forms, without the busywork.
      </p>
      <button className="btn primary block" onClick={openPanel}>
        Open Fillin
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}