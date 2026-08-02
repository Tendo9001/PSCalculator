# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal, pure front-end PWA calculator ("Profit Split Calculator"). Plain
HTML/CSS/JS only — no framework, no bundler, no build step, no npm
dependencies shipped to the browser. Deployed as a static site to GitHub
Pages: https://tendo9001.github.io/PSCalculator/

- `calc.js` — pure calculation engine, no DOM access.
- `script.js` — DOM wiring: renders `calc.js`'s output into the page,
  handles the MY Team / Investor tabs, the negative-value warning modal,
  and Principal's live thousands-separator input formatting.
- `index.html` / `styles.css` — markup and the dark "trading terminal"
  theme (background `#0b0d0c`, accent `#d9a441`).
- `manifest.json` + `icons/` — PWA metadata, no service worker.
- `scripts/generate_icons.py` — regenerates `icons/icon-192.png` and
  `icons/icon-512.png`. Requires `pip install Pillow` (a one-time local dev
  tool, never shipped to the site). Run: `python scripts/generate_icons.py`.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — historical
  design specs and implementation plans written during development. Treat
  them as point-in-time records, not living documentation — the code is the
  source of truth when they disagree.
- `docs/timeline.md` — chronological record of what was built and why,
  including decisions and real-world corrections that don't show up in the
  diff alone. Read it before making non-trivial changes, and add an entry
  after any decision worth remembering (a naming reversal, a formula
  correction, a rejected alternative) — not for routine edits.
- `README.md` — the public-facing overview; keep it in sync with this file
  when the project's structure or setup steps change.

## Data flow: `calc.js` → `script.js`

`calculate({ principal, monthlyRate, period, costOfFund, taxRate })` returns
`{ shared, myTeam, investor, rootCause }`:

- `shared` — Annual Rate, Balance Interest, After Takaful. Rendered above
  the tabs, always visible regardless of which tab is active.
- `myTeam` — SJ-Team Return/Interest, MY Interest/Team/Monthly Payout.
  Rendered in the "MY Team" tab (default). **Must never reference
  `taxRate`** — Tax is borne entirely by the Investor's side; nothing here
  should change when `taxRate` changes for the same other inputs.
- `investor` — Investor Return (Gross), Tax, Investor Return (Net).
  Rendered in the "Investor" tab.
- `rootCause` — `null`, or `{ key, message, scope: 'shared' | 'investor' }`.
  `scope: 'shared'` causes warn regardless of the active tab (they affect
  both sides); `scope: 'investor'` causes only warn while the Investor tab
  is active, and re-arm when the user switches back to it. See
  `script.js`'s `maybeShowModal` for the exact gating logic.

## Critical: `calc.js` must stay a classic script, not an ES module

`calc.js` is loaded two ways: as a plain `<script src="calc.js">` in
`index.html` (no `type="module"`), and via Node's `import`/`require` in
`calc.test.mjs`. It has no `import`/`export` keywords — it ends with:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate };
}
```

Node's ESM interop detects the named export from this pattern automatically
(cjs-module-lexer), so `calc.test.mjs` can still `import { calculate } from
'./calc.js'`. **Do not convert this to `export function calculate` /
`type="module"`** — Chrome (and most browsers) block ES module `<script>`
loading over `file://` with a CORS error, which silently breaks the app for
anyone who opens `index.html` by double-clicking it instead of going through
a server. This was a real bug hit and fixed during development.

## Testing

`node --test calc.test.mjs` runs the calculation engine's test suite
(Node's built-in test runner, no dependencies). There's no test harness for
`script.js`'s DOM logic — verify UI changes with a real or headless browser.

## Headless-Chrome verification safety rule

If you drive a headless Chrome instance to verify UI behavior (this project
has done this repeatedly via the DevTools Protocol over Node's built-in
`WebSocket`), **always launch it with a dedicated, brand-new
`--user-data-dir`** pointing at a scratch folder, and when cleaning up,
**kill only that instance's specific PID** (found by matching its
`CommandLine` against your scratch profile path via
`Get-CimInstance Win32_Process`), e.g. `taskkill //PID <n> //T //F`.

**Never run `taskkill /F /IM chrome.exe`** or any variant that matches by
image name — it force-closes every Chrome window on the machine, including
the user's own, not just the test instance. This happened once during
development and must not happen again.

## Git / deploy workflow

- Work directly on `main` — this is a solo personal project with no
  branches; that's the established preference, not an oversight.
- **Always ask for explicit confirmation before `git push`.** Pushing
  updates the live public GitHub Pages site immediately (no CI/staging
  step), so treat it like any other user-visible deploy.
- GitHub Pages is served from the `main` branch, root (`/`) directory,
  under the `gh`-authenticated `Tendo9001` account. Already configured —
  re-enabling it isn't necessary unless it's somehow disabled.

## Naming

Row labels "SJ-Team" and "MY" (e.g. "SJ-Team Return", "MY Interest", "MY
Team Monthly Payout") are the project owner's explicit, deliberate choice —
not a placeholder or an accident. Earlier in development these were
genericized to avoid exposing internal team names on this public repo, then
the owner explicitly asked to restore them. Don't "clean up" or rename these
without asking first.
