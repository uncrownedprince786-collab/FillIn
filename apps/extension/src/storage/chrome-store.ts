import type {
  AppSettings,
  AnswersStore,
  DocumentMetadata,
  Profile} from "@fillin/schemas";
import {
  AppSettingsSchema,
  AnswersStoreSchema,
  DEFAULT_SETTINGS,
  ProfileSchema,
} from "@fillin/schemas";

const KEYS = {
  settings: "fillin.settings",
  documents: "fillin.documents",
  profile: "fillin.profile",
  answers: "fillin.answers",
} as const;

let settingsCache: AppSettings = DEFAULT_SETTINGS;
let docsCache: DocumentMetadata[] = [];
let profileCache: Profile = { version: 1, facts: [], conflicts: [] };
let answersCache: AnswersStore = {};

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  const value = result[key] as T | undefined;
  return value ?? fallback;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function loadAll(): Promise<void> {
  const [settings, docs, profile, answers] = await Promise.all([
    get(KEYS.settings, DEFAULT_SETTINGS),
    get(KEYS.documents, []),
    get(KEYS.profile, { version: 1, facts: [], conflicts: [] }),
    get(KEYS.answers, {}),
  ]);
  settingsCache = AppSettingsSchema.parse(settings);
  docsCache = Array.isArray(docs) ? docs : [];
  profileCache = ProfileSchema.parse(profile);
  answersCache = AnswersStoreSchema.parse(answers);
}

export async function getSettings(): Promise<AppSettings> {
  return { ...settingsCache };
}

export async function updateSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  settingsCache = AppSettingsSchema.parse({ ...settingsCache, ...patch });
  await set(KEYS.settings, settingsCache);
  return { ...settingsCache };
}

export async function getDocuments(): Promise<DocumentMetadata[]> {
  return [...docsCache];
}

export async function putDocument(meta: DocumentMetadata): Promise<void> {
  const idx = docsCache.findIndex((d) => d.id === meta.id);
  if (idx >= 0) docsCache[idx] = meta;
  else docsCache.push(meta);
  await set(KEYS.documents, docsCache);
}

export async function removeDocument(id: string): Promise<void> {
  docsCache = docsCache.filter((d) => d.id !== id);
  await set(KEYS.documents, docsCache);
}

export async function replaceDocument(
  id: string,
  next: DocumentMetadata
): Promise<void> {
  const idx = docsCache.findIndex((d) => d.id === id);
  if (idx >= 0) docsCache[idx] = next;
  else docsCache.push(next);
  await set(KEYS.documents, docsCache);
}

export async function getProfile(): Promise<Profile> {
  return JSON.parse(JSON.stringify(profileCache)) as Profile;
}

export async function setProfile(profile: Profile): Promise<void> {
  profileCache = ProfileSchema.parse(profile);
  await set(KEYS.profile, profileCache);
}

export async function getAnswers(): Promise<AnswersStore> {
  return { ...answersCache };
}

export async function saveAnswer(question: string, answer: string): Promise<void> {
  answersCache[question] = { question, answer, updatedAt: Date.now() };
  await set(KEYS.answers, answersCache);
}

export async function deleteAnswer(question: string): Promise<void> {
  delete answersCache[question];
  await set(KEYS.answers, answersCache);
}

export async function clearAllData(): Promise<void> {
  settingsCache = { ...DEFAULT_SETTINGS };
  docsCache = [];
  profileCache = { version: 1, facts: [], conflicts: [] };
  answersCache = {};
  await chrome.storage.local.remove(Object.values(KEYS));
}

/** Complete wipe including the encryption key namespace. */
export async function wipeEverything(): Promise<void> {
  settingsCache = { ...DEFAULT_SETTINGS };
  docsCache = [];
  profileCache = { version: 1, facts: [], conflicts: [] };
  answersCache = {};
  await chrome.storage.local.clear();
}

export type StorageChangeHandler = (changes: {
  [key: string]: chrome.storage.StorageChange;
}) => void;

export function onStorageChanged(handler: StorageChangeHandler): void {
  chrome.storage.onChanged.addListener(handler);
}