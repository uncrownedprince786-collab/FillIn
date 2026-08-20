# Fillin — Forms, without the busywork

Fillin is a Chrome extension + Vercel/Next.js API that fills web forms from
documents the user provides once (resumes, degrees, ID cards, …). Everything
the user uploads stays on the device; a small, rate-limited API answers form
questions using the **minimum** slice of the user's information.

> Status: production-ready MVP. Built per the Fillin Master Engineering Spec.

## Features

- **Scan & fill** — detects form fields (labels, placeholders, ARIA, headings,
  custom controls), matches them to the user's profile, and fills them after a
  quick review.
- **No hallucinated data** — every filled value is traced to a supplied fact.
  The server runs a hallucination guard (`guardAnalyzeResults`) and the prompts
  enforce strict no-invention rules.
- **Local-first & private** — documents and the extracted profile live in
  `chrome.storage.local` / IndexedDB. AES-256-GCM encryption at rest, with an
  optional passphrase mode (PBKDF2, 210,000 iterations).
- **Data minimization** — sensitive identifiers (CNIC, passport, tax number,
  bank account) are **never** sent to the AI. Only the facts relevant to the
  question are included.
- **Minimal permissions** — the extension only requests `sidePanel`, `activeTab`,
  `scripting`, and `storage`. No `<all_urls>`. The content script is injected on
  demand, only when you run Fillin on a page.
- **Honest fallbacks** — passwords, OTPs, CVVs are never touched. Conflicts
  between documents are surfaced for the user to resolve.

## Repository layout

```
apps/
  extension/   Chrome extension (MV3). Vite-built; content script is IIFE.
  web/         Vercel-ready Next.js API (route handlers under app/api).
packages/
  schemas/     Zod schemas + TS types shared everywhere (@fillin/schemas).
  shared/      Pure logic: matching rules, formatting, constants (@fillin/shared).
  ai/          AI provider abstraction + prompts (@fillin/ai).
scripts/
  generate-fixtures.mjs   Fictional fixtures for local testing.
fixtures/                 Generated fixtures (npm run fixtures).
docs/                     ARCHITECTURE, PRIVACY, DEVELOPMENT.
```

## Quick start

### 1. Install

```bash
npm install
```

### 2. Build

```bash
npm run build:packages   # schemas, shared, ai (must build first)
npm run build:extension  # unpacked Chrome extension → apps/extension/dist
npm run build:web        # production Next.js build
```

### 3. Load the extension in Chrome

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `apps/extension/dist`.
3. Pin the Fillin icon. Clicking it opens the side panel.

### 4. Run the API locally

```bash
copy apps/web/.env.example apps/web/.env.local   # set OPENAI_API_KEY
npm run dev:web
```

The extension's default API base URL is `http://localhost:3000` (changeable in
Settings). For Vercel deployment, set `OPENAI_API_KEY` (and optionally
`OPENAI_MODEL`) as environment variables — nothing else is required.

### 5. Try it with the fixtures

```bash
npm run fixtures
```

Generates fictional documents (`fixtures/resume.pdf`, `cover-letter.pdf`),
`fixtures/profile.json`, and two sample forms (`job-application.html`,
`contact.html`). Open a sample form in the browser, click the Fillin icon, and
run Fillin to see it fill from the documents you upload.

## Security model

- The API key never leaves the server (`OPENAI_API_KEY` is server-only).
- The extension sends only semantic field descriptions + minimal facts; never
  raw document contents, passwords, or sensitive identifiers.
- CORS is restricted to `chrome-extension://` origins and localhost.
- All API routes are rate-limited (in-memory, per instance) and validate input
  with Zod before processing.
- See `docs/PRIVACY.md` for the full data-flow and encryption details.

## Documentation

- `docs/ARCHITECTURE.md` — system design, data flow, decision pipeline.
- `docs/PRIVACY.md` — data minimization, encryption, threat model, security
  boundaries.
- `docs/DEVELOPMENT.md` — build/test/lint commands, extension loading, API
  reference, project structure.

## License

UNLICENSED — private project.
