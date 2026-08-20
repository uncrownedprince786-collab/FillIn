import { useState } from "react";
import { useApp } from "../sidepanel/App";
import type { ProfileKey } from "@fillin/schemas";
import { DECISION_LABEL } from "@fillin/schemas";

export default function FormView() {
  const app = useApp();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (app.scanning) {
    return (
      <div className="empty">
        <div className="spinner" />
        Reading the form…
      </div>
    );
  }

  if (app.scanError) {
    return (
      <div className="empty">
        <p>{app.scanError}</p>
        <button className="btn primary" onClick={() => void app.refresh()}>
          Try again
        </button>
      </div>
    );
  }

  if (!app.plan) {
    return (
      <div className="empty">
        <p>Open a page with a form and refresh to see it here.</p>
        <button className="btn primary" onClick={() => void app.refresh()}>
          Scan this page
        </button>
      </div>
    );
  }

  const plan = app.plan;
  const { summary } = plan;
  const preserved = plan.decisions.filter((d) => d.preserved);

  const items = [...plan.items].sort((a, b) => {
    const order: Record<string, number> = {
      CONFLICT: 0,
      SENSITIVE: 1,
      ASK_USER: 2,
      UNKNOWN: 3,
    };
    return (order[a.decision.decision] ?? 9) - (order[b.decision.decision] ?? 9);
  });

  const doFill = () => {
    if (preserved.length > 0) {
      setConfirmReplace(true);
      return;
    }
    void app.fill();
  };

  const doFillReplacing = () => {
    setConfirmReplace(false);
    void app.fillWithOverrides(
      Object.fromEntries(preserved.map((d) => [d.fieldId, d.value ?? ""]))
    );
  };

  return (
    <>
      <div className="card">
        <h3>Form detected</h3>
        <p className="muted small" style={{ margin: 0 }}>
          {summary.total} field{summary.total === 1 ? "" : "s"} found on this page.
        </p>
        <div className="summary-grid">
          <div className="summary-cell good">
            <div className="num">{summary.ready}</div>
            <div className="label">ready</div>
          </div>
          <div className="summary-cell warn">
            <div className="num">{summary.needYou}</div>
            <div className="label">need your answer</div>
          </div>
          <div className="summary-cell warn">
            <div className="num">{summary.review}</div>
            <div className="label">need review</div>
          </div>
          <div className="summary-cell">
            <div className="num">{summary.unknown}</div>
            <div className="label">unknown</div>
          </div>
        </div>
        {!app.settings.aiEnabled && (
          <p className="small muted" style={{ marginTop: 8 }}>
            AI is turned off or unreachable. Fillin will still use your saved
            information locally.
          </p>
        )}
        <button className="btn primary block" onClick={doFill} disabled={app.busy}>
          {app.busy ? "Filling…" : "Fill form"}
        </button>
      </div>

      {items.length > 0 && (
        <div>
          <h3 style={{ margin: "12px 0 8px", fontSize: 14 }}>Review before you submit</h3>
          {items.map((item) => (
            <ReviewItemView
              key={item.fieldId}
              fieldId={item.fieldId}
              question={item.question}
              decisionLabel={DECISION_LABEL[item.decision.decision]}
              reason={item.decision.reason}
              options={item.decision.options ?? []}
              decision={item.decision.decision}
              semanticKey={item.decision.semanticKey}
              value={answers[item.fieldId] ?? ""}
              onValueChange={(v) => setAnswers((a) => ({ ...a, [item.fieldId]: v }))}
              onSave={() => void app.saveAnswerForField(item.fieldId, item.question, answers[item.fieldId] ?? "")}
              onPickOption={(v) => void app.fillWithOverrides({ [item.fieldId]: v })}
              onResolveConflict={async (key, v) => {
                await app.resolveConflictForField(item.fieldId, key, v);
                await app.refresh();
                await app.fillWithOverrides({ [item.fieldId]: v });
              }}
              onPickDocument={(docId) => void app.chooseDocumentForField(item.fieldId, docId)}
              documents={app.documents}
              aiEnabled={app.settings.aiEnabled}
            />
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="card muted small">
          Nothing needs your attention. Review the filled values on the page
          before submitting.
        </div>
      )}

      {confirmReplace && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>This field already contains information</h3>
            <p className="small muted">
              {preserved.length} field{preserved.length === 1 ? "" : "s"} already
              have text in them. Replace it with Fillin's value?
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmReplace(false)}>
                Keep
              </button>
              <button className="btn primary" style={{ flex: 1 }} onClick={doFillReplacing}>
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ReviewItemProps {
  fieldId: string;
  question: string;
  decisionLabel: string;
  reason?: string;
  options: string[];
  decision: string;
  semanticKey?: string;
  value: string;
  onValueChange: (v: string) => void;
  onSave: () => void;
  onPickOption: (v: string) => void;
  onResolveConflict: (key: ProfileKey, v: string) => Promise<void>;
  onPickDocument: (docId: string) => void;
  documents: { id: string; name: string }[];
  aiEnabled: boolean;
}

function ReviewItemView(props: ReviewItemProps) {
  const { decision, options } = props;
  const isFile = decision === "ASK_USER" && options.length > 0 && /upload|attach/i.test(props.question);
  return (
    <div className="item">
      <div className="q">{props.question || "Unnamed field"}</div>
      <div className="note">{props.decisionLabel}</div>
      {props.reason && props.reason !== props.decisionLabel && (
        <div className="note">{props.reason}</div>
      )}

      {decision === "ASK_USER" && !isFile && (
        <div className="actions">
          <input
            type="text"
            value={props.value}
            onChange={(e) => props.onValueChange(e.target.value)}
            placeholder="Enter your answer"
          />
          <button className="btn primary" onClick={props.onSave} disabled={!props.value.trim()}>
            Save answer
          </button>
        </div>
      )}

      {isFile && (
        <div className="actions">
          {options.map((docName) => {
            const doc = props.documents.find((d) => d.name === docName);
            return (
              <button
                key={docName}
                className="btn"
                onClick={() => doc && props.onPickDocument(doc.id)}
              >
                Use {docName}
              </button>
            );
          })}
          {options.length === 0 && (
            <span className="small muted">Add a matching document first.</span>
          )}
        </div>
      )}

      {decision === "SENSITIVE" && (
        <div className="actions">
          {options.map((v) => (
            <button key={v} className="btn" onClick={() => props.onPickOption(v)}>
              Use my value
            </button>
          ))}
          <span className="small muted">This is sensitive. Fillin won't fill it without your choice.</span>
        </div>
      )}

      {decision === "CONFLICT" && (
        <div className="conflict-box">
          Your information differs between documents. Which should we use?
        </div>
      )}

      {decision === "CONFLICT" && (
        <div className="actions">
          {options.map((v) => (
            <button
              key={v}
              className="btn primary"
              onClick={() => {
                if (props.semanticKey) {
                  void props.onResolveConflict(props.semanticKey as ProfileKey, v);
                } else {
                  props.onPickOption(v);
                }
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {decision === "UNKNOWN" && (
        <div className="note">Fill this one manually on the page.</div>
      )}
    </div>
  );
}