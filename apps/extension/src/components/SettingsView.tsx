import { useState } from "react";
import { useApp } from "../sidepanel/App";
import { hasPassphrase } from "../encryption";

export default function SettingsView({ locked = false }: { locked?: boolean }) {
  const app = useApp();
  const [apiUrl, setApiUrl] = useState(app.settings.apiBaseUrl);
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [exportPw, setExportPw] = useState("");
  const [importPw, setImportPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [busyMsg, setBusyMsg] = useState("");

  if (locked) {
    return (
      <>
        <div className="card">
          <h3>Protected data</h3>
          <p className="small muted">
            Your Fillin data is protected with a passphrase. Enter it to continue.
          </p>
          <label className="field">Passphrase</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void app.unlock(pw);
            }}
          />
          <button className="btn primary block" onClick={() => void app.unlock(pw)}>
            Unlock
          </button>
        </div>
      </>
    );
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusyMsg(label);
    try {
      await fn();
    } finally {
      setBusyMsg("");
    }
  };

  const handleExport = async () => {
    if (exportPw.length < 8) return;
    await run("Exporting…", async () => {
      const { name, blob } = await app.doExport(exportPw);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  };

  const handleImport = async () => {
    if (!importFile || importPw.length < 8) return;
    await run("Importing…", async () => {
      await app.doImport(importFile, importPw);
    });
  };

  return (
    <>
      {busyMsg && (
        <div className="empty">
          <div className="spinner" />
          {busyMsg}
        </div>
      )}

      <div className="card">
        <h3>Connection</h3>
        <label className="field">Fillin API server</label>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          onBlur={() => {
            if (apiUrl !== app.settings.apiBaseUrl) {
              void app.patchSettings({ apiBaseUrl: apiUrl.trim() || "https://fill-in-psi.vercel.app" });
            }
          }}
        />
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={app.settings.aiEnabled}
            onChange={(e) => void app.patchSettings({ aiEnabled: e.target.checked })}
          />
          Use AI for complex fields and questions
        </label>
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          Only the minimum relevant information is sent to the API. Sensitive
          identifiers are never sent.
        </p>
      </div>

      <div className="card">
        <h3>Filling</h3>
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={app.settings.neverOverwrite}
            onChange={(e) => void app.patchSettings({ neverOverwrite: e.target.checked })}
          />
          Never overwrite what you already typed
        </label>
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={app.settings.confirmBeforeFill}
            onChange={(e) => void app.patchSettings({ confirmBeforeFill: e.target.checked })}
          />
          Ask before replacing existing values
        </label>
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={app.settings.encryptDocuments}
            onChange={(e) => void app.patchSettings({ encryptDocuments: e.target.checked })}
          />
          Encrypt documents stored on this device
        </label>
      </div>

      <div className="card">
        <h3>Privacy</h3>
        {hasPassphrase() ? (
          <>
            <p className="small muted">Your data is protected with a passphrase.</p>
            <button className="btn block" onClick={() => void app.disablePassphraseNow()}>
              Remove passphrase protection
            </button>
          </>
        ) : (
          <>
            <label className="field">Protect your data with a passphrase (optional)</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Choose a passphrase"
            />
            <button
              className="btn primary block"
              disabled={newPw.length < 8}
              onClick={() => void run("Setting passphrase…", () => app.setPassphraseNow(newPw))}
            >
              Set passphrase
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Backup</h3>
        <label className="field">Export passphrase (min 8 characters)</label>
        <input
          type="password"
          value={exportPw}
          onChange={(e) => setExportPw(e.target.value)}
        />
        <button className="btn primary block" disabled={exportPw.length < 8} onClick={handleExport}>
          Export my data
        </button>

        <label className="field">Import</label>
        <input
          type="file"
          accept=".fillin,application/json"
          onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
        />
        <label className="field">Import passphrase</label>
        <input
          type="password"
          value={importPw}
          onChange={(e) => setImportPw(e.target.value)}
        />
        <button className="btn block" disabled={!importFile || importPw.length < 8} onClick={handleImport}>
          Import backup
        </button>
      </div>

      <div className="card" style={{ borderColor: "#fecaca" }}>
        <h3>Delete all Fillin data</h3>
        <p className="small muted">
          Removes your documents, profile, saved answers, and encryption keys
          from this browser. This cannot be undone.
        </p>
        {confirmDelete ? (
          <div className="actions" style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="btn danger"
              style={{ flex: 1 }}
              onClick={() => void run("Deleting…", app.deleteAll).then(() => setConfirmDelete(false))}
            >
              Delete everything
            </button>
          </div>
        ) : (
          <button className="btn danger block" onClick={() => setConfirmDelete(true)}>
            Delete all Fillin data
          </button>
        )}
      </div>

      <p className="small muted" style={{ textAlign: "center", padding: "8px 0 20px" }}>
        Fillin v0.1.0 · Your information stays on this device.
      </p>
    </>
  );
}