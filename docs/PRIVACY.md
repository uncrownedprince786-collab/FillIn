# Fillin — Privacy

This document describes how Fillin handles user data end-to-end, what is stored
where, what is ever sent to a remote service, and the security boundaries that
are enforced in code.

## Principles

1. **Local-first.** Documents and the derived profile never leave the device
   unless a specific operation needs AI.
2. **Minimum viable context.** When AI is used, only the facts relevant to the
   question (plus short excerpts) are sent — never raw documents, and never
   sensitive identifiers.
3. **No secrets, no fabrications.** The extension refuses to touch passwords,
   OTPs, CVVs, and similar. The server rejects model output that cannot be
   traced to the supplied facts.
4. **User control.** Filling requires review. Conflicts are surfaced, not
   auto-resolved. A "Wipe everything" action clears all local data.

## Data inventory

### On the device (Chrome extension)

| Data | Where | Encrypted at rest? |
|---|---|---|
| Settings (`fillin.settings`) | `chrome.storage.local` | sandboxed by Chrome |
| Document metadata (`fillin.documents`) | `chrome.storage.local` | sandboxed by Chrome |
| Profile facts + conflicts (`fillin.profile`) | `chrome.storage.local` | sandboxed by Chrome |
| Saved user answers (`fillin.answers`) | `chrome.storage.local` | sandboxed by Chrome |
| Document blobs | IndexedDB (`db.ts`) | **Yes** — AES-256-GCM |
| Extracted plain text | IndexedDB (`db.ts`) | **Yes** — AES-256-GCM (encryption layer) |
| Key material (`fillin.keys`) | `chrome.storage.local` | auto mode only; passphrase mode never persists the key |

Encryption is implemented in `src/encryption/index.ts`:

- **Auto mode** — a random 256-bit key is generated once and stored in
  `chrome.storage.local`. This is convenience encryption: the key and the
  ciphertext live in the same extension, so it protects against casual access
  to raw IndexedDB data but **not** against an attacker who compromises the
  device account. It is defence-in-depth on top of Chrome's sandboxing.
- **Passphrase mode** — the key is derived with PBKDF2-SHA256
  (210,000 iterations) from a passphrase the user chose. The key is never
  persisted; only a random salt and a verifier are stored. After a browser
  restart the user must re-enter the passphrase to unlock. `wipeKeyMaterial()`
  wipes in-memory keys.

### On the server (Vercel)

| Data | Stored? | Notes |
|---|---|---|
| `OPENAI_API_KEY` | env var | server-only, never sent to the client |
| Request bodies | no | validated, processed, discarded |
| Logs | metadata only | `lib/log.ts` filters anything sensitive |

## What is sent to the AI (and when)

AI operations happen only when the user runs Fillin on a form or asks for an
AI extraction, and only when AI is enabled in Settings.

| Endpoint | Payload sent |
|---|---|
| `/api/ai/analyze` | `AISafeField[]` (id, type, label/placeholder/name/aria/section/question text, options) + facts for the requested keys + bounded excerpts + saved answers |
| `/api/ai/answer` | one question, its category, facts, excerpts |
| `/api/ai/classify` | the question text only |
| `/api/ai/extract` | extracted document **text** (never blobs/images), document name/type |

### Never sent

- `NEVER_SEND_TO_AI` keys: `id.cnic`, `id.passport`, `id.taxNumber`,
  `id.bankAccount` — filtered in `retrieve.ts:selectRelevantContext`.
- Field **values** typed into a form (only semantics are sent).
- Password/OTP/CVV fields (`DO_NOT_FILL_PATTERNS`) and sensitive fields
  (`SENSITIVE_PATTERNS`) are classified locally and handled without AI.
- Raw document blobs or images.

## Data flow: filling a form

1. User clicks the toolbar icon → side panel opens, `activeTab` scanned.
2. The pipeline classifies each field locally and matches the profile.
3. For fields that need AI, `selectRelevantContext` assembles the minimal
   facts/excerpts (sensitive keys filtered out).
4. The side panel calls the API (if enabled and reachable); the server guards
   results against the supplied facts.
5. The user reviews the plan and approves. Only then does the content script
   write values.
6. Values the user typed into the page are never overwritten by default
   (`neverOverwrite`), and the page itself is never sent anywhere.

## Security boundaries enforced in code

- **CORS** (`lib/cors.ts`): only `chrome-extension://<id>` origins and
  localhost. Requests from other origins get `403`.
- **Rate limiting** (`lib/rate-limit.ts`): in-memory sliding window per
  instance. Bounds abuse of a single serverless instance.
- **Input validation**: every route parses the body with its Zod schema before
  any work.
- **Hallucination guard** (`ai-service.ts:guardAnalyzeResults`): model output
  is not trusted blindly. Verified below.
- **No secrets in logs** (`lib/log.ts`): key/value pairs matching sensitive
  patterns are dropped before logging.

### Hallucination guard behaviour

| Model decision | Guard outcome |
|---|---|
| `EXACT` / `DERIVED`, value matches a supplied fact | kept |
| `EXACT` / `DERIVED`, value is a single invented token | downgraded to `ASK_USER` |
| `EXACT` / `DERIVED`, multi-token value fully covered by facts | kept |
| `EXACT` / `DERIVED`, otherwise fabricated | downgraded to `ASK_USER` |
| `GENERATED` on a `textarea` | kept (value required) |
| `GENERATED` on any other field type | downgraded to `ASK_USER` |
| `SENSITIVE`, `DO_NOT_FILL`, `ASK_USER`, `UNKNOWN`, `CONFLICT` | value stripped |

## Threat model & known limitations

- **Auto-mode encryption is convenience encryption.** It does not protect
  against a fully compromised device account. Passphrase mode raises the bar.
- **Rate limiting is per-instance**, not global. Under Vercel serverless this
  is a per-instance guard; move to a shared store (e.g. Upstash) for
  multi-instance deployments.
- **The extension code is user-visible** (it's a browser extension). Treat
  client-side logic as non-secret: the real secrets are the server `OPENAI_API_KEY`
  and the user's passphrase.
- **OCR and PDF text extraction are local**, but a malicious page could still
  observe what Fillin writes into it (that's inherent to form filling). We
  mitigate by never auto-filling secrets and by defaulting `confirmBeforeFill`
  and `neverOverwrite` to `true`.
- **`aiEnabled` default is true** but the extension degrades gracefully to
  local-only decisions if the API is unreachable or disabled.

## User controls

- Settings: AI on/off, auto-extract, confirm-before-fill, never-overwrite,
  encrypt-documents, passphrase set/unlock/change.
- **Wipe everything** removes settings, documents, profile, answers, extracted
  text, and key material.
- Conflicts between documents are shown with both source values; the user picks.
