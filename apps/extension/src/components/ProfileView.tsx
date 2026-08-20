import { useApp } from "../sidepanel/App";
import { toDisplayKey, maskValue } from "@fillin/shared";
import { SENSITIVE_KEYS } from "@fillin/schemas";

const GROUP_LABELS: Record<string, string> = {
  PERSONAL_INFORMATION: "Personal",
  CONTACT_INFORMATION: "Contact",
  ADDRESS: "Address",
  EDUCATION: "Education",
  EMPLOYMENT: "Employment",
  SKILLS: "Skills",
  CERTIFICATIONS: "Certifications",
  LANGUAGES: "Languages",
  FINANCIAL: "Financial",
};

export default function ProfileView() {
  const app = useApp();

  if (app.profile.facts.length === 0 && app.profile.conflicts.length === 0) {
    return (
      <div className="empty">
        <p>Your profile is empty.</p>
        <p className="small muted">Add documents and let Fillin build it for you.</p>
      </div>
    );
  }

  const groups = new Map<string, typeof app.profile.facts>();
  for (const fact of app.profile.facts) {
    const group = groupOf(fact.key);
    const list = groups.get(group) ?? [];
    list.push(fact);
    groups.set(group, list);
  }

  const openConflicts = app.profile.conflicts.filter((c) => c.status === "OPEN");

  return (
    <>
      {openConflicts.length > 0 && (
        <div className="card" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
          <h3>Conflicting information</h3>
          {openConflicts.map((c) => (
            <div key={c.key} className="conflict-box">
              <strong>{toDisplayKey(c.key)}</strong> appears differently in your
              documents.
              <div className="actions" style={{ marginTop: 6 }}>
                {c.values.map((v) => (
                  <button
                    key={v.value}
                    className="btn"
                    onClick={() => void app.resolveConflictForField("", c.key, v.value)}
                  >
                    {v.value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {[...groups.entries()].map(([group, facts]) => (
        <div className="card" key={group}>
          <h3>{GROUP_LABELS[group] ?? group}</h3>
          {facts.map((fact, i) => (
            <div key={`${fact.key}-${i}`} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              <div className="small muted">{toDisplayKey(fact.key)}</div>
              <div>
                {SENSITIVE_KEYS.includes(fact.key) && fact.value ? maskValue(fact.value) : fact.value}
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                From: {fact.sources.map((s) => s.documentName ?? s.documentId).join(", ")}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function groupOf(key: string): string {
  if (key.startsWith("personal.")) return "PERSONAL_INFORMATION";
  if (key.startsWith("contact.")) return "CONTACT_INFORMATION";
  if (key.startsWith("address.")) return "ADDRESS";
  if (key.startsWith("education.")) return "EDUCATION";
  if (key.startsWith("employment.")) return "EMPLOYMENT";
  if (key.startsWith("skill.")) return "SKILLS";
  if (key.startsWith("certification.")) return "CERTIFICATIONS";
  if (key.startsWith("language.")) return "LANGUAGES";
  if (key.startsWith("financial.")) return "FINANCIAL";
  return "PERSONAL_INFORMATION";
}