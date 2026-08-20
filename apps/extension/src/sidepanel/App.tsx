import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AppSettings,
  AnswersStore,
  DocumentMetadata,
  Profile,
  ProfileKey} from "@fillin/schemas";
import {
  DEFAULT_SETTINGS
} from "@fillin/schemas";
import { AIClient } from "../ai/client";
import { DocumentService } from "../features/documents/service";
import type { FormPlan} from "../features/forms/pipeline";
import { planForm } from "../features/forms/pipeline";
import { buildFillInstructions } from "../features/forms/fill";
import {
  getActiveTab,
  ensureContentScript,
  scanTab,
  fillTab,
  selectFileForField,
  watchTab,
  onContentMessage,
} from "./host";
import {
  getAnswers,
  getDocuments,
  getProfile,
  getSettings,
  loadAll,
  saveAnswer as persistAnswer,
  setProfile,
  updateSettings,
  wipeEverything,
} from "../storage/chrome-store";
import { getAllExtracted, clearAllIndexedDB } from "../storage/db";
import {
  hasPassphrase,
  isUnlocked,
  unlockWithPassphrase,
  setPassphrase,
  disablePassphrase,
  wipeKeyMaterial,
} from "../encryption";
import { resolveConflict } from "../features/profile/builder";
import type { FillReport, FillInstruction } from "../content/filler";
import { normalizeQuestion } from "../utils";
import { exportBackup, importBackup } from "../features/export/backup";
import FormView from "../components/FormView";
import DocumentsView from "../components/DocumentsView";
import ProfileView from "../components/ProfileView";
import SettingsView from "../components/SettingsView";

type View = "form" | "documents" | "profile" | "settings";

interface AppState {
  booted: boolean;
  view: View;
  settings: AppSettings;
  documents: DocumentMetadata[];
  profile: Profile;
  answers: AnswersStore;
  locked: boolean;
  activeTabId: number | null;
  activeUrl: string | null;
  snapshotTitle: string;
  plan: FormPlan | null;
  scanError: string | null;
  scanning: boolean;
  fillReport: FillReport | null;
  busy: boolean;
  toast: string | null;
  overrides: Record<string, string>;
}

interface AppContextValue extends AppState {
  setView: (v: View) => void;
  refresh: () => Promise<void>;
  fill: () => Promise<void>;
  fillWithOverrides: (overrides: Record<string, string>) => Promise<void>;
  saveAnswerForField: (fieldId: string, question: string, value: string) => Promise<void>;
  resolveConflictForField: (fieldId: string, key: ProfileKey, chosen: string) => Promise<void>;
  chooseDocumentForField: (fieldId: string, documentId: string) => Promise<void>;
  addDocuments: (files: File[]) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  aiExtractDocument: (id: string) => Promise<void>;
  rebuildProfile: () => Promise<void>;
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setPassphraseNow: (pw: string) => Promise<void>;
  unlock: (pw: string) => Promise<void>;
  disablePassphraseNow: () => Promise<void>;
  doExport: (pw: string) => Promise<{ name: string; blob: Blob }>;
  doImport: (file: File, pw: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  dismissToast: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    booted: false,
    view: "form",
    settings: DEFAULT_SETTINGS,
    documents: [],
    profile: { version: 1, facts: [], conflicts: [] },
    answers: {},
    locked: false,
    activeTabId: null,
    activeUrl: null,
    snapshotTitle: "",
    plan: null,
    scanError: null,
    scanning: false,
    fillReport: null,
    busy: false,
    toast: null,
    overrides: {},
  });
  const [ai, setAi] = useState<AIClient | null>(null);

  const docServiceRef = useRef<DocumentService | null>(null);
  if (!docServiceRef.current) {
    docServiceRef.current = new DocumentService(ai);
  }
  const docService = docServiceRef.current;
  docService.setAi(ai);

  const set = useCallback((patch: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const toast = useCallback((message: string) => {
    setState((prev) => ({ ...prev, toast: message }));
    setTimeout(() => {
      setState((prev) => (prev.toast === message ? { ...prev, toast: null } : prev));
    }, 4000);
  }, []);

  // Keep AIClient in sync with settings.apiBaseUrl.
  useEffect(() => {
    setAi(
      state.settings.aiEnabled
        ? new AIClient(state.settings.apiBaseUrl)
        : null
    );
  }, [state.settings.apiBaseUrl, state.settings.aiEnabled]);

  const refresh = useCallback(async () => {
    set({ scanning: true, scanError: null });
    try {
      const settings = await getSettings();
      const documents = await getDocuments();
      const profile = await getProfile();
      const answers = await getAnswers();
      set({ settings, documents, profile, answers });

      const tab = await getActiveTab();
      if (!tab?.id) {
        set({
          activeTabId: null,
          activeUrl: null,
          plan: null,
          scanning: false,
          scanError: "No active tab found. Click on a web page first.",
        });
        return;
      }
      set({ activeTabId: tab.id, activeUrl: tab.url ?? null });

      const ok = await ensureContentScript(tab.id);
      if (!ok) {
        set({
          plan: null,
          scanning: false,
          scanError: "Couldn't run Fillin on this page. It may be a restricted page (chrome://, edge://, Chrome Web Store). Try a regular website.",
        });
        return;
      }
      await watchTab(tab.id, true);
      const snapshot = await scanTab(tab.id);
      if (!snapshot || snapshot.fields.length === 0) {
        set({
          plan: null,
          scanning: false,
          scanError: "No form fields found on this page. Open a page with input fields and try again.",
        });
        return;
      }
      const extracted = new Map(
        (await getAllExtracted()).map((e) => [e.documentId, e])
      );
      const currentAi = new AIClient(settings.apiBaseUrl);
      const plan = await planForm(snapshot, {
        profile,
        answers,
        settings,
        documents,
        extracted,
        ai: settings.aiEnabled ? currentAi : null,
      });
      set({
        snapshotTitle: snapshot.title,
        plan,
        scanning: false,
      });
    } catch (err) {
      set({
        scanning: false,
        scanError: err instanceof Error ? err.message : "Something went wrong while scanning.",
      });
    }
  }, [set]);

  useEffect(() => {
    const boot = async () => {
      await loadAll();
      const settings = await getSettings();
      const documents = await getDocuments();
      const profile = await getProfile();
      const answers = await getAnswers();
      set({ settings, documents, profile, answers });
      await refresh();
      set({ booted: true });
    };
    void boot();
    onContentMessage(() => {
      void refresh();
    });
    const onTabChanged = (msg: { type?: string; tabId?: number; url?: string }) => {
      if (msg.type === "FILLIN_TAB_CHANGED") {
        void refresh();
      }
    };
    chrome.runtime.onMessage.addListener(onTabChanged);
    return () => chrome.runtime.onMessage.removeListener(onTabChanged);
  }, [refresh, set]);

  const fill = useCallback(async () => {
    await fillWithOverrides({});
  }, []);

  const fillWithOverrides = useCallback(
    async (overrides: Record<string, string>) => {
      const { plan, activeTabId, snapshotTitle } = state;
      if (!plan || !activeTabId) return;
      set({ busy: true });
      try {
        const snapshot = await scanTab(activeTabId);
        if (!snapshot) {
          set({ scanError: "The page changed. Re-scanning…" });
          await refresh();
          return;
        }
        const { instructions } = buildFillInstructions(plan, snapshot.fields);
        const merged: FillInstruction[] = [...instructions];
        for (const [fieldId, value] of Object.entries(overrides)) {
          const field = snapshot.fields.find((f) => f.id === fieldId);
          if (!field || !value) continue;
          if (field.kind === "select") {
            merged.push({ fieldId, kind: "select", value, force: true });
          } else if (field.kind === "custom") {
            merged.push({ fieldId, kind: "custom-text", value, force: true });
          } else if (field.fieldType === "checkbox") {
            merged.push({ fieldId, kind: "checkbox", checked: true, force: true });
          } else if (field.fieldType === "radio") {
            merged.push({ fieldId, kind: "radio", checked: true, value, force: true });
          } else {
            merged.push({ fieldId, kind: "text", value, force: true });
          }
        }
        const report = await fillTab(activeTabId, merged);
        set({
          fillReport: report,
          overrides: { ...state.overrides, ...overrides },
          busy: false,
          snapshotTitle,
        });
        if (report) {
          const parts: string[] = [`${report.filled} filled`];
          if (report.skipped) parts.push(`${report.skipped} left`);
          if (report.errors.length) parts.push(`${report.errors.length} errors`);
          toast(`Done — ${parts.join(", ")}.`);
        }
      } catch {
        set({ busy: false, scanError: "Filling failed. Please try again." });
      }
    },
    [state, set, refresh, toast]
  );

  const saveAnswerForField = useCallback(
    async (fieldId: string, question: string, value: string) => {
      if (!value.trim()) return;
      await persistAnswer(normalizeQuestion(question), value.trim());
      await refresh();
    },
    [refresh]
  );

  const resolveConflictForField = useCallback(
    async (fieldId: string, key: ProfileKey, chosen: string) => {
      const current = await getProfile();
      const next = resolveConflict(current, key, chosen);
      await setProfile(next);
      await refresh();
      void fieldId;
    },
    [refresh]
  );

  const chooseDocumentForField = useCallback(
    async (fieldId: string, documentId: string) => {
      const { activeTabId } = state;
      if (!activeTabId) return;
      const meta = state.documents.find((d) => d.id === documentId);
      if (!meta) return;
      const raw = await docService.getRawBlob(documentId);
      if (!raw) {
        toast("Couldn't read that document.");
        return;
      }
      const ok = await selectFileForField(
        activeTabId,
        fieldId,
        meta.name,
        meta.mimeType ?? "application/octet-stream",
        raw
      );
      toast(ok ? `Uploaded ${meta.name}` : "Couldn't attach that document.");
      await refresh();
    },
    [state, docService, toast, refresh]
  );

  const addDocuments = useCallback(
    async (files: File[]) => {
      set({ busy: true });
      try {
        for (const file of files) {
          const type = guessDocType(file.name);
          await docService.add({
            name: file.name,
            type,
            mimeType: file.type || guessMime(file.name),
            sizeBytes: file.size,
            data: await file.arrayBuffer(),
          });
        }
        await new Promise((r) => setTimeout(r, 1500));
        await docService.rebuildProfile();
        await refresh();
        toast(`${files.length} document${files.length === 1 ? "" : "s"} added.`);
      } finally {
        set({ busy: false });
      }
    },
    [docService, refresh, toast, set]
  );

  const removeDocument = useCallback(
    async (id: string) => {
      await docService.remove(id);
      await refresh();
    },
    [docService, refresh]
  );

  const aiExtractDocument = useCallback(
    async (id: string) => {
      set({ busy: true });
      try {
        const ok = await docService.aiExtract(id);
        toast(ok ? "Profile updated." : "Couldn't reach the AI server.");
      } finally {
        set({ busy: false });
        await refresh();
      }
    },
    [docService, toast, set, refresh]
  );

  const rebuildProfile = useCallback(async () => {
    set({ busy: true });
    try {
      await docService.rebuildProfile();
      await refresh();
      toast("Profile rebuilt from your documents.");
    } finally {
      set({ busy: false });
    }
  }, [docService, refresh, toast, set]);

  const patchSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = await updateSettings(patch);
      set({ settings: next });
    },
    [set]
  );

  const setPassphraseNow = useCallback(
    async (pw: string) => {
      await setPassphrase(pw);
      await patchSettings({ passphraseSet: true });
      await refresh();
      toast("Your data is now protected with a passphrase.");
    },
    [patchSettings, refresh, toast]
  );

  const unlock = useCallback(
    async (pw: string) => {
      await unlockWithPassphrase(pw);
      set({ locked: false });
      await refresh();
    },
    [refresh, set]
  );

  const disablePassphraseNow = useCallback(async () => {
    await disablePassphrase();
    await patchSettings({ passphraseSet: false });
    await refresh();
    toast("Passphrase protection removed.");
  }, [patchSettings, refresh, toast]);

  const doExport = useCallback(async (pw: string) => {
    return exportBackup(pw, docService);
  }, [docService]);

  const doImport = useCallback(
    async (file: File, pw: string) => {
      await importBackup(file, pw, docService);
      await loadAll();
      await refresh();
      toast("Backup imported.");
    },
    [docService, refresh, toast]
  );

  const deleteAll = useCallback(async () => {
    await wipeEverything();
    await clearAllIndexedDB();
    await wipeKeyMaterial();
    await loadAll();
    set({
      documents: [],
      profile: { version: 1, facts: [], conflicts: [] },
      answers: {},
      settings: { ...DEFAULT_SETTINGS },
    });
    await refresh();
    toast("All Fillin data deleted.");
  }, [refresh, toast, set]);

  const value: AppContextValue = {
    ...state,
    setView: (v) => set({ view: v }),
    refresh,
    fill,
    fillWithOverrides,
    saveAnswerForField,
    resolveConflictForField,
    chooseDocumentForField,
    addDocuments,
    removeDocument,
    aiExtractDocument,
    rebuildProfile,
    patchSettings,
    setPassphraseNow,
    unlock,
    disablePassphraseNow,
    doExport,
    doImport,
    deleteAll,
    dismissToast: () => set({ toast: null }),
  };

  const lockedNow = hasPassphrase() && !isUnlocked();

  return (
    <Ctx.Provider value={value}>
      {!state.booted ? (
        <div className="empty">
          <div className="spinner" />
          Loading…
        </div>
      ) : (
        <>
          <header className="app-header">
            <h1>Fillin</h1>
            {state.activeUrl && (
              <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {state.snapshotTitle || state.activeUrl}
              </span>
            )}
          </header>
          <nav className="tabs">
            {(["form", "documents", "profile", "settings"] as View[]).map((v) => (
              <button
                key={v}
                className={`tab ${state.view === v ? "active" : ""}`}
                onClick={() => value.setView(v)}
              >
                {v === "form" ? "Form" : v === "documents" ? "Documents" : v === "profile" ? "Profile" : "Settings"}
              </button>
            ))}
          </nav>
          <main className="main">
            {lockedNow && state.view !== "settings" ? (
              <SettingsView locked />
            ) : state.view === "form" ? (
              <FormView />
            ) : state.view === "documents" ? (
              <DocumentsView />
            ) : state.view === "profile" ? (
              <ProfileView />
            ) : (
              <SettingsView />
            )}
          </main>
          {state.toast && (
            <div className="toast" onClick={value.dismissToast}>
              {state.toast}
            </div>
          )}
        </>
      )}
    </Ctx.Provider>
  );
}

function guessDocType(name: string): DocumentMetadata["type"] {
  const n = name.toLowerCase();
  if (/resume|cv\b|curriculum/.test(n)) return "RESUME";
  if (/passport/.test(n)) return "PASSPORT";
  if (/cnic|national id|nic/.test(n)) return "CNIC";
  if (/degree|diploma/.test(n)) return "DEGREE";
  if (/transcript/.test(n)) return "TRANSCRIPT";
  if (/certificate|certification/.test(n)) return "CERTIFICATE";
  if (/experience|employment letter/.test(n)) return "EXPERIENCE_LETTER";
  if (/cover letter/.test(n)) return "COVER_LETTER";
  if (/address|utility/.test(n)) return "ADDRESS_DOCUMENT";
  return "OTHER";
}

function guessMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return "image/*";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}