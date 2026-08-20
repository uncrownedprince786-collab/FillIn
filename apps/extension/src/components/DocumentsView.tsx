import { useRef } from "react";
import { useApp } from "../sidepanel/App";
import { fmtBytes, fmtDate } from "../utils";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  EXTRACTING: "Reading…",
  READY: "Ready",
  FAILED: "Couldn't read",
  PARTIAL: "Partial",
};

export default function DocumentsView() {
  const app = useApp();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const pickFiles = () => fileInput.current?.click();

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void app.addDocuments(Array.from(files));
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <>
      <div className="card">
        <h3>Your documents</h3>
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          Add your documents once. Fillin reads them and keeps the useful
          information on this device.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/*,text/plain"
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
        <button className="btn primary block" onClick={pickFiles} disabled={app.busy}>
          {app.busy ? "Adding…" : "Add document"}
        </button>
        {app.documents.length > 0 && (
          <button className="btn block" onClick={() => void app.rebuildProfile()} disabled={app.busy}>
            Build profile
          </button>
        )}
      </div>

      {app.documents.length === 0 ? (
        <div className="empty">
          <p>No documents yet. Add a resume, degree, or passport to get started.</p>
        </div>
      ) : (
        app.documents.map((doc) => (
          <div key={doc.id} className="doc-row">
            <div>
              <div className="name">{doc.name}</div>
              <div className="small muted">
                {doc.type.replace(/_/g, " ").toLowerCase()} · {fmtBytes(doc.sizeBytes)} ·{" "}
                {fmtDate(doc.addedAt)}
              </div>
              <div className="small" style={{ marginTop: 2 }}>
                <span className="tag">{STATUS_LABEL[doc.extractionStatus] ?? doc.extractionStatus}</span>
                {doc.error && <span className="small muted">{doc.error}</span>}
              </div>
            </div>
            <div className="actions" style={{ display: "flex", gap: 6 }}>
              {doc.extractionStatus === "READY" && (
                <button className="btn ghost" onClick={() => void app.aiExtractDocument(doc.id)}>
                  Improve
                </button>
              )}
              <button className="btn ghost" style={{ color: "var(--bad)" }} onClick={() => void app.removeDocument(doc.id)}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}

      <p className="small muted" style={{ marginTop: 14 }}>
        PDF and image files are read locally. Image text is recognized on your
        device where supported.
      </p>
    </>
  );
}