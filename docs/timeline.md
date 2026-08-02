# Project Timeline & Decision Log

A chronological record of what was built and why, for anyone (including a
future Claude session) reviewing this project's history or trying to
understand why something is the way it is. Git commit messages record *what*
changed; this file records *why*, and the decisions that didn't leave a
trace in code (naming choices, rejected alternatives, real-world corrections).

## 2026-08-02 — Initial build

Brainstormed and built the calculator from scratch: dark "trading terminal"
theme, 4 inputs (Principal, Monthly Rate, Period, Cost of Fund), full
step-by-step breakdown, negative-value warnings.

Key decisions:
- **Live calculation, no submit button** — recalculates on every keystroke.
- **Custom dark-themed modal** for negative-value warnings, not the
  browser's native `alert()` — to match the visual design.
- **Repo name `PSCalculator`**, public, generic — no company/client names.
- **Row labels genericized** (e.g. avoided literal internal team names) so
  the public repo/site wouldn't expose internal business terms. This was
  explicitly reversed the next day — see 2026-08-03 (morning).
- **Percent inputs are typed as plain numbers** (e.g. `5` = 5%), not
  decimals (`0.05`).
- **Icons generated via a local, one-time Python/Pillow script**, not
  shipped as a runtime dependency.

Bugs found and fixed during the build (not present in the final code):
- ES module `import`/`export` syntax doesn't load over `file://` — Chrome
  blocks it with a CORS error. Switched `calc.js` to a classic script with a
  dual CommonJS/browser export (`if (typeof module !== 'undefined' &&
  module.exports) { module.exports = {...} }`), so the same file works as a
  browser `<script>` tag and as a Node test import.
- Empty inputs on first page load were treated as `0`, which produced a
  negative intermediate value and popped the warning modal before the user
  had typed anything. Fixed by only evaluating warnings once at least one
  field has a value.

Deployed to GitHub Pages: https://tendo9001.github.io/PSCalculator/

## 2026-08-03 (morning) — Principal formatting, label naming reversed

- Added live thousands-separator formatting to the Principal input (typing
  `1000000` live-formats to `1,000,000`; blur pads it to `.00`). Required
  careful cursor-position math (tracking digit/decimal-point position, not
  raw string index) so the cursor doesn't jump to the end while typing in
  the middle of a number.
- **Explicit reversal of the previous day's label genericization**: row
  labels changed to "SJ-Team Return/Interest" and "MY Interest/Team/Monthly
  Payout" per the project owner's direct request, with the tradeoff (this
  is now visible on the public site) confirmed and accepted.
- Hid the "Team B Amount" row from the UI — it's numerically identical to
  the amount portion of "MY Interest", so showing both was redundant. Still
  computed internally.

## 2026-08-03 (midday) — Tax Rate input, reconciling against a reference spreadsheet

The project owner shared `Book2.xlsx`, their own reference spreadsheet,
which contained formula steps the app didn't have yet: a "Tax Rate
(adjustable)" input and "Tax" / "PAT (Profit After Tax)" calculation steps.

- Cross-checked the spreadsheet's formulas against the app's logic and
  found (and flagged, rather than silently "fixing") a likely copy-paste
  error in the spreadsheet's own `SJ interest` formula — it referenced the
  wrong cell (Investor Return's ratio instead of SJ-Team Return's). The
  app's code never had this bug; no change was needed there.
- Decisions: Tax Rate became a 5th user input (not a hardcoded constant,
  since the owner described it as something that changes per calculation).
  Tax and PAT were added as visible breakdown rows between "After Takaful"
  and "Investor Return".

## 2026-08-03 (afternoon) — Investor-borne tax restructure

The project owner clarified the real business model didn't match the
spreadsheet's structure: **Tax is a cost borne only by the Investor's half
of the profit split** — it is not deducted from the shared pool before the
50/50 split happens. This meant the "PAT" concept (a single shared post-tax
pool) didn't actually exist in the real model and was removed entirely.

This was a large enough change to go through the full process: brainstorm →
written design spec → written implementation plan → Subagent-Driven
Development execution (4 tasks, each implemented and reviewed independently
by fresh subagents) → a final whole-branch review → one fix wave (added a
test guard against a row silently ending up in the wrong tab/group, a CSS
`[hidden]` backstop for the tab-hiding mechanism, and an explicit
default-tab initialization call — see `docs/superpowers/plans/
2026-08-03-investor-tax-split.md` for the full plan and
`docs/superpowers/specs/2026-08-03-investor-tax-split-design.md` for the
design rationale).

- UI restructured into a shared section (Annual Rate / Balance Interest /
  After Takaful, always visible) plus two tabs: **MY Team** (default) and
  **Investor**.
- Negative-value warnings are scoped: a cause in the shared section warns
  regardless of which tab is active (it affects both); a cause that's
  investor-only (tax pushing Investor Return negative) only warns while the
  Investor tab is active, and re-arms (can warn again) if the user switches
  away and back to that tab.

**Real-world correction, found by the owner testing with their actual
numbers** (not caught by any test, spec, or review up to this point): Tax's
calculation base was wrong. It had been computed from the Investor's half
only (`investorReturnGross × taxRate`); the owner confirmed it should be
computed from the *whole* "After Takaful" pool (`afterTakaful × taxRate`,
matching their Excel) — while the resulting tax amount still comes entirely
out of the Investor's share, not split between both sides. This roughly
doubled the effective tax deducted from the Investor for the same tax rate,
and changed the "tax high enough to make Investor Return go negative"
threshold from `taxRate > 100%` to `taxRate > 50%`.

UI polish: the tab buttons were changed from an underlined-text style to a
filled/outlined button style, after the owner pointed out the original
style didn't read as clickable.

## Standing safety note

During development, a headless-Chrome verification step once ran
`taskkill /F /IM chrome.exe` to clean up a test browser instance — this
force-closed *all* Chrome windows on the machine, not just the test
instance. No data was lost, but this must never happen again: verification
always uses a dedicated `--user-data-dir` and kills only that specific
process's PID, never by image name.
