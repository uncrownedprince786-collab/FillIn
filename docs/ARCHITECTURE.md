# Fillin — Architecture

## Overview

Fillin is split into a browser extension (everything the user touches) and a
thin Vercel/Next.js API (the only place AI credentials exist). The two halves
talk over HTTPS using a small JSON protocol defined in `@fillin/schemas`.

```
┌────────────────────────── Chrome ───────────────────────────┐
│                                                              │
│  Popup ──▶ Side Panel (React)                                │
│              │                                               │
│   ┌──────────┴──────────┐                                    │
│   │ DocumentService     │    chrome.storage.local            │
│   │ ProfileBuilder      │    ├─ settings  (fillin.settings)  │
│   │ PlanPipeline        │    ├─ documents (fillin.documents) │
│   └──────────┬──────────┘    ├─ profile   (fillin.profile)   │
│              │               ├─ answers   (fillin.answers)   │
│        content script        └─ keys      (fillin.keys)      │
│        (injected on demand)                 │                │
│              │                    IndexedDB (dexie)          │
│              │                    ├─ blobs     (encrypted)   │
│              │                    └─ extracted (plain text)  │
└──────────────┼───────────────────────────────────────────────┘
               │  HTTPS (rate-limited, CORS-restricted)
┌──────────────▼─────────────── Vercel ────────────────────────┐
│  Next.js route handlers (app/api/ai/*)                       │
│  ├─ ai-service (prompts + hallucination guard)               │
│  ├─ provider abstraction (@fillin/ai)                        │
│  └─ OpenAI (API key server-side only)                        │
└──────────────────────────────────────────────────────────────┘
```

## Monorepo

npm workspaces:

| Package | Responsibility | Consumers |
|---|---|---|
| `@fillin/schemas` | Zod schemas + types for the whole system | all |
| `@fillin/shared` | Pure logic: `normalizeText`, matching rules, do-not-fill / sensitive patterns, formatting | extension, web |
| `@fillin/ai` | `AIProvider` interface, OpenAI provider, prompt builders | web |
| `apps/web` | Next.js API routes | — |
| `apps/extension` | MV3 extension (side panel, popup, background, content script) | — |

## Extension

### Permissions (minimal)

`sidePanel`, `activeTab`, `scripting`, `storage`. There is **no** `<all_urls>`:
the content script is injected into the active tab only when the user clicks
"Run Fillin" (`chrome.scripting.executeScript`). `sidePanel.openPanelOnActionClick`
opens the panel on the toolbar click.

### Build

- `vite.config.ts` builds the side panel, popup, and background worker as
  modern-ESM modules (MV3 supports `background.service_worker` type `module`).
- `vite.content.config.ts` builds the content script as an **IIFE** so it can
  run in a page context without modules.
- `scripts/build.mjs` runs both builds, copies `manifest.json`, icons, the
  pdf.js worker, and the tesseract OCR assets into `dist/`.

### Content script (`src/content`)

- `scanner.ts` — walks the DOM for inputs/textareas/selects/custom controls.
  Collects **structural metadata only** (label, placeholder, aria-label,
  section heading, question text, current `hasValue`, visibility, options,
  accept list). Uses `FILLIN_FIELDS_CHANGED` (MutationObserver) to keep the
  side panel in sync.
- `filler.ts` — writes values through the native prototype setters
  (`HTMLInputElement.prototype.value`, etc.) so React/Vue/vanilla listeners
  fire; dispatches `input`/`change` events. Respects `shouldFill` (never
  overwrite a user-typed value unless `force`). File inputs are filled with a
  synthetic `DataTransfer`.

### Decision pipeline (`src/features/forms/pipeline.ts`)

`planForm()` turns a field snapshot into a `FormPlan`:

1. **Local pass** (`local.ts:decideLocally`) — classifies each field with
   `@fillin/shared` rules and matches against the profile:
   - `DO_NOT_FILL` for passwords/OTPs/CVVs.
   - `SENSITIVE` for CNIC/passport/tax/bank — never auto-filled.
   - `EXACT` from a single fact; `DERIVED` for safe computations (e.g. full
     name); `CONFLICT` when documents disagree; `FILE` for uploads (with
     suggested doc types); `NEEDS_AI` / `UNKNOWN` otherwise.
2. **AI pass** — only for fields that need it, the extension builds a
   `selectRelevantContext(profile, keys, extracted, questions)` payload. This
   never includes `NEVER_SEND_TO_AI` keys. Batched requests to
   `POST /api/ai/analyze`.
3. **Merge + summarize** — decisions merged by field id, plan summarized
   (ready / needs review / skipped).

### Profile (`src/features/profile`)

- `builder.ts` — `mergeHints` adds facts with source attribution and creates
  conflict records when sources disagree (never guesses). `resolveConflict`
  promotes the user's choice into a user-confirmed fact. `resolveValue` honors
  confirmed facts, then resolved conflicts, then the first fact.
- `retrieve.ts` — `selectRelevantContext` builds the minimal AI payload:
  facts for the requested keys + short targeted excerpts. Sensitive keys are
  filtered out. Excerpts are capped.

### Documents (`src/features/documents`)

- Blobs are stored encrypted in IndexedDB (`storage/db.ts`); metadata in
  `chrome.storage.local`.
- Extraction is layered: local heuristics (`hints.ts`, conservative regex
  patterns) always run; an optional AI-assisted pass
  (`POST /api/ai/extract`) adds more; the `@fillin/ai` extraction prompt only
  emits keys from the profile key list.
- PDFs via `pdfjs-dist`; images via `tesseract.js` (best effort, requires the
  OCR assets shipped with the build).

### Storage & encryption

- `chrome-store.ts` — typed accessors for settings/documents/profile/answers
  with in-memory caches and schema validation.
- `encryption/index.ts` — AES-256-GCM. Two modes:
  - **auto**: random key in `chrome.storage.local` (defence-in-depth).
  - **passphrase**: PBKDF2-SHA256 (210,000 iterations) key derivation; the key
    is never persisted, only a salt + verifier. User must unlock after a
    browser restart.
- `export/backup.ts` — encrypted `.fillin` backup/restore.

## Web API

Next.js App Router route handlers:

| Route | Purpose |
|---|---|
| `POST /api/ai/analyze` | Decide values for a batch of fields |
| `POST /api/ai/answer` | Answer a free-text form question |
| `POST /api/ai/classify` | Classify a question to select relevant facts |
| `POST /api/ai/extract` | Structured fact extraction from a document |
| `GET /api/health` | Liveness + config status |

### Request flow

1. `lib/cors.ts` — only `chrome-extension://<id>` origins and localhost.
2. `lib/rate-limit.ts` — in-memory sliding-window limiter (per instance; a
   documented limitation for multi-instance deployments).
3. Route validates the body with the matching Zod schema.
4. `lib/ai-service.ts` — builds prompts (`@fillin/ai`), calls the provider,
   and runs the **hallucination guard**:
   - `EXACT`/`DERIVED` values must match a supplied fact (exact or
     token-covered). Single invented tokens and fabricated values are
     downgraded to `ASK_USER`.
   - `GENERATED` is only allowed on `textarea` fields.
   - `SENSITIVE` / `DO_NOT_FILL` / `ASK_USER` / `UNKNOWN` / `CONFLICT`
     decisions always have their value stripped.
5. `lib/log.ts` — metadata-only logging (never bodies or values).

## Decisions worth knowing

- **No raw document data is sent to AI.** Only `AISafeField` descriptions and
  a `selectRelevantContext` slice.
- **Rate limiting is per-instance.** On Vercel serverless this bounds a single
  instance; production-scale deployments should move this to a store (e.g.
  Upstash). Noted as a known limitation.
- **The provider abstraction exists so OpenAI can be swapped** (Anthropic,
  local models) without touching routes or the extension.
