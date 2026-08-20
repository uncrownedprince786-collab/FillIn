/**
 * Application-layer encryption for sensitive local data.
 *
 * Design (documented in docs/PRIVACY.md):
 *  - AES-256-GCM with random 12-byte IVs.
 *  - Two modes:
 *      "auto": a random key is generated once and stored in chrome.storage.local.
 *              This is convenience encryption (defence-in-depth on top of the
 *              sandboxed extension storage). The key and ciphertext live in the
 *              same extension, so it does not protect against a compromised
 *              device account.
 *      "passphrase": the key is derived with PBKDF2-SHA256 (210,000 iterations)
 *              from a passphrase the user chose. The key is never persisted;
 *              only a salt and a verifier are stored. The user must enter the
 *              passphrase after each browser restart to unlock sensitive data.
 */

const VERIFIER_CONTEXT = "fillin-verifier-v1";
const PBKDF2_ITERATIONS = 210_000;

export type KeyMode = "auto" | "passphrase" | "none";

export interface KeyState {
  mode: KeyMode;
  keyB64?: string;
  saltB64?: string;
  verifierB64?: string;
}

const KEY_STORAGE = "fillin.keys";

function bytesToB64(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const u8 =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

let keyStateCache: KeyState | null = null;
let keyStateLoaded: Promise<KeyState> | null = null;

export async function loadKeyState(): Promise<KeyState> {
  if (keyStateLoaded) return keyStateLoaded;
  keyStateLoaded = new Promise<KeyState>((resolve) => {
    chrome.storage.local.get(KEY_STORAGE, (result) => {
      const state = (result?.[KEY_STORAGE] as KeyState | undefined) ?? {
        mode: "none" as KeyMode,
      };
      keyStateCache = state;
      resolve(state);
    });
  });
  return keyStateLoaded;
}

export function getStoredKeyState(): KeyState {
  return keyStateCache ?? { mode: "none" };
}

async function setStored(state: KeyState): Promise<void> {
  keyStateCache = state;
  await chrome.storage.local.set({ [KEY_STORAGE]: state });
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importAesKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function makeVerifier(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(VERIFIER_CONTEXT)
  );
  return bytesToB64(mac);
}

async function verifyKey(key: CryptoKey, verifierB64: string): Promise<boolean> {
  const computed = await makeVerifier(key);
  return computed === verifierB64;
}

/** Generate a fresh random key and store it (auto mode). */
export async function initAutoKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  await setStored({ mode: "auto", keyB64: bytesToB64(raw) });
  return importAesKey(raw);
}

/** Set a user passphrase (passphrase mode). Returns the derived key. */
export async function setPassphrase(passphrase: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const verifier = await makeVerifier(key);
  await setStored({
    mode: "passphrase",
    saltB64: bytesToB64(salt),
    verifierB64: verifier,
  });
  return key;
}

/** Unlock with a passphrase. Throws if the passphrase is wrong. */
export async function unlockWithPassphrase(passphrase: string): Promise<CryptoKey> {
  await loadKeyState();
  const state = getStoredKeyState();
  if (state.mode !== "passphrase" || !state.saltB64 || !state.verifierB64) {
    throw new Error("No passphrase protection is configured.");
  }
  const key = await deriveKey(passphrase, b64ToBytes(state.saltB64));
  if (!(await verifyKey(key, state.verifierB64))) {
    throw new Error("That passphrase is incorrect.");
  }
  return key;
}

export function hasPassphrase(): boolean {
  return getStoredKeyState().mode === "passphrase";
}

/** Remove the passphrase and revert to a stored random key. */
export async function disablePassphrase(): Promise<CryptoKey> {
  return initAutoKey();
}

/** Get the effective encryption key for the current mode. */
export async function getKey(): Promise<CryptoKey> {
  await loadKeyState();
  const state = getStoredKeyState();
  if (state.mode === "none") return initAutoKey();
  if (state.mode === "auto" && state.keyB64) {
    return importAesKey(b64ToBytes(state.keyB64));
  }
  throw new Error("Protected with a passphrase — unlock required.");
}

export function isUnlocked(): boolean {
  const state = getStoredKeyState();
  return state.mode !== "passphrase";
}

export interface EncryptedPayload {
  iv: string;
  data: string;
}

export async function encryptBytes(
  plaintext: ArrayBuffer | Uint8Array<ArrayBuffer>,
  key?: CryptoKey
): Promise<EncryptedPayload> {
  const k = key ?? (await getKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    plaintext
  );
  return { iv: bytesToB64(iv), data: bytesToB64(ciphertext) };
}

export async function decryptBytes(
  payload: EncryptedPayload,
  key?: CryptoKey
): Promise<ArrayBuffer> {
  const k = key ?? (await getKey());
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
    k,
    b64ToBytes(payload.data)
  );
  return plaintext;
}

export async function encryptString(
  value: string,
  key?: CryptoKey
): Promise<EncryptedPayload> {
  return encryptBytes(new TextEncoder().encode(value), key);
}

export async function decryptString(
  payload: EncryptedPayload,
  key?: CryptoKey
): Promise<string> {
  const buf = await decryptBytes(payload, key);
  return new TextDecoder().decode(buf);
}

/** Remove all encryption material. Used by "Delete all Fillin data". */
export async function wipeKeyMaterial(): Promise<void> {
  keyStateCache = null;
  keyStateLoaded = null;
  await chrome.storage.local.remove(KEY_STORAGE);
}