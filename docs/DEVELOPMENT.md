# Fillin — Development

## Prerequisites

- Node.js >= 20 (developed on v24)
- npm >= 10
- Chrome (for the extension)

## Commands

Run from the repository root:

```bash
npm install          # install all workspaces

npm run build:packages   # build @fillin/schemas, @fillin/shared, @fillin/ai
npm run build:extension  # build the Chrome extension → apps/extension/dist
npm run build:web        # production build of the Next.js API
npm run build            # packages + web + extension

npm run typecheck   # tsc across all workspaces
npm run lint        # eslint (flat config at repo root)
npm run test        # vitest across all workspaces

npm run fixtures    # regenerate fictional fixtures into ./fixtures
npm run dev:web     # start the API locally (localhost:3000)
```

Individual workspaces:

```bash
npm run typecheck --workspace @fillin/extension
npm run test --workspace @fillin/web
npm run build --workspace @fillin/extension
```

## Environment

- `apps/web/.env.local` — copy from `apps/web/.env.example` and set
  `OPENAI_API_KEY`. Optional: `OPENAI_MODEL` (default `gpt-4o-mini`).
- Root `.env.example` documents the same variables. No secrets are committed.

## Loading the extension

1. `npm run build:extension`
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select
   `apps/extension/dist`.
3. Click the toolbar icon to open the side panel.
4. Point Settings → API base URL at your local API (`http://localhost:3000`)
   or your deployed URL.

## Testing with the API locally

```bash
copy apps/web/.env.example apps/web/.env.local   # add OPENAI_API_KEY
npm run dev:web
curl http://localhost:3000/api/health
```

The health endpoint reports whether an AI provider is configured (without
leaking the key).

## Project structure

```
apps/extension/src
  ai/client.ts            AIClient — typed calls to the web API
  background/index.ts     opens the side panel on toolbar click
  components/             FormView, DocumentsView, ProfileView, SettingsView
  content/                scanner.ts, filler.ts, index.ts (injected script)
  encryption/             AES-GCM + PBKDF2 key management
  features/
    documents/            add/extract/store documents; local hints extractor
    forms/                local decisions, AI pipeline, fill instructions
    profile/              profile builder + data-minimized retrieval
    export/backup.ts      encrypted .fillin export/import
  sidepanel/              App + host (tab messaging) + main.tsx
  storage/                chrome.storage wrapper + IndexedDB (dexie)

apps/web
  app/api/{health,ai/*}   route handlers
  lib/                    cors, rate-limit, http, ai-service, log

packages
  schemas/src             Zod schemas (documents, profile, fields, ai, app)
  shared/src              matching rules, formatting, sensitive patterns
  ai/src                  provider interface, OpenAI provider, prompts
```

## Testing notes

- `packages/*` tests run against TypeScript source directly (vitest/esbuild).
- `apps/extension` tests cover the pure decision logic: `local.ts`,
  `builder.ts` (merge/conflict/resolve), `retrieve.ts` (data minimization),
  and `hints.ts` (local extractor). Content-script DOM behaviour is exercised
  manually against `fixtures/*.html`.
- `apps/web` tests cover the hallucination guard (`guardAnalyzeResults`).
- The provider is an abstraction; swap in a fake for offline tests.

## Known limitations

- In-memory rate limiting is per serverless instance.
- Image OCR is best-effort and requires the tesseract assets shipped in
  `dist/ocr/` (they are copied at build time from `node_modules`).
- `openai` is pinned to the v4 API in `packages/ai` (`max_tokens`). If you
  upgrade to v6, switch to `max_completion_tokens`.