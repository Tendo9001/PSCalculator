# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal, pure front-end PWA calculator ("Profit Split Calculator"). Plain
HTML/CSS/JS only — no framework, no bundler, no build step, no npm
dependencies shipped to the browser. Deployed as a static site to GitHub
Pages: https://tendo9001.github.io/PSCalculator/

- `calc.js` — pure calculation engine, no DOM access.
- `script.js` — DOM wiring: renders `calc.js`'s output (the flat breakdown
  and the Payout Summary table) into the page, handles the inline warning
  banner, and Principal's live thousands-separator input formatting.
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

`calculate({ principal, monthlyRate, period, costOfFund, insuranceRate,
taxRate, investorReturnRate, joRate })` returns `{ rows, payoutSummary,
rootCause }`. There are no tabs — everything renders in one flat view.

- `rows` — a flat array, in calculation order: Annual Rate, Balance
  Interest, After Insurance, Tax, PAT, Investor Return, SJ Team Return, SJ
  Interest, JO Team. Every row renders (no hidden rows).
- **PAT is shown (`pat = afterInsurance - tax`, matching the spreadsheet),
  but it is NOT the base of the Investor/SJ split — the Investor alone
  bears the full cost of Tax.** `sjTeamReturn = afterInsurance * (1 -
  investorReturnRate/100)` is fixed from the *pre-tax* `afterInsurance`, so
  it (and everything derived from it: `sjInterest`, `joTeam`) never moves
  when Tax Rate changes. `investorReturn = pat - sjTeamReturn` is a
  residual — it absorbs 100% of whatever Tax removed from the pool. This
  went through two reversals during development (see `docs/timeline.md`
  2026-08-03 and 2026-08-06 entries) — the current state is the owner's
  explicitly confirmed final answer: PAT is real and shown, but the split
  itself must still protect SJ Team from Tax entirely. **Do not change
  `sjTeamReturn` to be computed from `pat` instead of `afterInsurance`** —
  that was tried, explicitly identified as wrong, and reverted.
- `payoutSummary` — a 4-role Monthly/Yearly table: Investor, SJ, SJ Member,
  JO ("JO Member (after plug)" is intentionally commented out in `calc.js`
  — see the comment there — not deleted). Each entry is `{ key, label,
  monthly, yearly, negative }`.
- `insuranceRate`, `investorReturnRate`, and `joRate` are user inputs, not
  hardcoded constants. `sjInterest` is always the auto-complement of JO
  Rate (`sjTeamReturn * (1 - joRate/100)`) — there's no separate input for
  it, specifically to avoid a split pair that could fail to sum to 100%.
  `myTeamCount = 4` is the one remaining hardcoded constant (currently
  unused now that JO Member is commented out).
- `rootCause` — `null`, or `{ key, message }`. Checked in order:
  `annualRate` → `balanceInterest` → `afterInsurance` → `investorReturn`
  (a high Tax Rate can flip `investorReturn` negative — even below the
  point where `pat` itself goes negative, since `investorReturn` is `pat`
  minus SJ Team's already-fixed cut — while `afterInsurance` and
  `sjTeamReturn` stay positive throughout).
- In the breakdown, `Tax` always renders in red (`DEDUCTION_ROW_KEYS` in
  `script.js`) regardless of its computed sign, since it's conceptually a
  cost; every other row defaults to green (`--positive`) unless its value
  is actually negative, which still overrides to red.

There is no popup/modal — warnings are an inline red banner
(`#warningBanner`/`#warningMessage`) that's just shown or hidden based on
current state, not a dismissible dialog (a popup was tried and explicitly
rejected as "annoying"; don't reintroduce one). `script.js`'s `recalculate`
picks the banner's message with this priority: (1) if Insurance Rate,
Investor Return, or JO Rate is left blank while any Deal Terms field has a
value, warn that those default to 0% — this is checked from the raw input
`.value` strings (`getMissingRateWarning`), not from `calc.js`'s output,
since `calc.js` only ever sees numbers (empty string is coerced to `0`
before `calculate()` is called); (2) otherwise, if `rootCause` is non-null
and at least one input has a value anywhere, show its message; (3)
otherwise hide the banner. No keystroke-spam or empty-load-warning
guarding is needed beyond that priority check, since the banner isn't
interruptive — it just reflects current state.

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

Row/input labels ("SJ Team Return", "SJ Interest", "SJ Member", "JO Team",
"JO", "JO Member (after plug)", "Insurance Rate") are the project owner's
explicit, deliberate choices, sourced directly from their own reference
spreadsheet (`Book2.xlsx`, not part of this repo) — not placeholders or
accidents. Naming has changed more than once during development (labels
were genericized early on to avoid exposing internal team names on this
public repo, then explicitly restored; "MY" was later explicitly renamed to
"JO" to match the spreadsheet). Don't "clean up," shorten, or rename these
without asking first — always check against the current spreadsheet or ask
the owner if a label looks inconsistent, rather than assuming it's a typo.
