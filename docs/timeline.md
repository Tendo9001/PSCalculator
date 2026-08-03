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

## 2026-08-04 — Adjustable rates, JO rename, tabs removed, Payout Summary

The project owner shared a further-updated `Book2.xlsx`. Renamed "Takaful"
to "Insurance" and marked several previously-hardcoded splits
"(rate adjustable)"; added a new Monthly/Yearly payout summary table for
five roles (Investor, SJ, SJ Member, JO, JO Member); used "JO" everywhere
the app had said "MY".

Confirmed with the owner before touching code: the spreadsheet's
`Investor Return`/`SJ Team Return` formulas are literally `PAT × rate`
(both from the shared post-tax pool) — this was true from the very first
version of the spreadsheet, not a new edit, and the owner explicitly
re-confirmed the app's actual business logic (tax borne only by the
Investor, computed after the split) should stay as-is. Only labels and
which values are user-adjustable came from the new spreadsheet. See
`docs/superpowers/specs/2026-08-04-adjustable-rates-and-payout-summary-design.md`.

Changes, via a written spec → plan → Subagent-Driven Development execution
(3 implementation tasks + a final whole-branch review):

- `Insurance Rate`, `Investor Return`, and `JO Rate` became user inputs,
  replacing hardcoded constants. Rather than two independently-editable
  inputs per split (which could fail to sum to 100%, a footgun the
  spreadsheet itself has), each pairing has one input with the other side
  as an automatic complement: SJ Team Return = `100% − Investor Return`;
  SJ Interest = `100% − JO Rate`. `myTeamCount = 4` is the one constant
  left hardcoded — the spreadsheet never marks it adjustable.
- Inputs split into two cards: "Deal Terms" (the original four) and
  "Adjustable Rates" (the four new/moved ones), per the owner's explicit
  request to separate them visually.
- **The MY Team / Investor tab design from the previous day was undone.**
  The owner decided they no longer wanted the split-tab view; everything
  is one flat breakdown list again, followed by the new Payout Summary
  table (which became the de facto "final result" section, replacing the
  single highlighted result card).
- The final whole-branch review caught two real gaps neither task-level
  review could see: `README.md` still described the now-removed tab design
  (fixed), and the three new rate inputs had no default values — leaving
  them blank silently computed a 0%-rate result with no warning at all,
  turning the previously-safe "just fill in Deal Terms" workflow into
  silently wrong output.
- **Follow-up UX decision from the owner in response to that gap:**
  instead of adding default values, replace the popup warning modal
  entirely with a **non-interruptive inline warning banner** (a red box
  below the input cards, not a dismissible dialog) — used both for the
  existing negative-value root-cause messages and a new message when
  Insurance Rate/Investor Return/JO Rate is left blank while the Deal Terms
  card has been started. The owner's stated reason: repeated popups were
  "annoying"; a banner just reflects current state without interrupting.
- Also fixed while addressing the review: added a mobile `overflow-x`
  safeguard for the Payout Summary table (a 3-column monospace table risked
  overflowing narrow phone screens), and added label-string assertions to
  `calc.test.mjs` (only key order was tested before, not the actual label
  text, even though relabeling was half the point of this change).

**Follow-up correction (2026-08-05):** the owner clarified "JO Member
(after plug)" was never actually wanted in the Payout Summary — it had been
part of an earlier iteration and got carried into this design by mistake.
Rather than deleting it outright, the row (and its `joMemberYearly`
calculation) were commented out in `calc.js` with a note explaining why,
since the owner said they may want it back later. `calc.test.mjs`'s
key/label assertions were updated to expect 4 payout summary rows instead
of 5.

**Follow-up adjustment (2026-08-05):** moved the `Tax` row to sit directly
after `After Insurance` in the breakdown list (was previously after
`Investor Return (Gross)`/`SJ Team Return`) — a pure display reorder, since
`tax` is computed from `afterInsurance` and doesn't depend on
`investorReturnGross` either way. Also introduced a semantic color scheme
for the breakdown: rows representing a deduction/cost (currently just
`Tax`) render in red (`--danger`) regardless of their computed sign, and
all other rows default to a new green `--positive` color instead of the
plain text color — red-for-negative-value styling still overrides both when
a row's number actually goes negative. Added `white-space: nowrap` plus a
horizontal-scroll fallback on the breakdown/summary containers so rows
never wrap to a second line, which the owner said looked messy.

**Reversal (2026-08-06): back to a PAT-based split.** The owner explicitly
asked to undo the 2026-08-03 "tax borne only by the Investor" design (see
that date's entry and `docs/superpowers/specs/
2026-08-03-investor-tax-split-design.md`) in favor of what their
spreadsheet always computed: `PAT = After Insurance − Tax` as its own
visible row, with **both** Investor Return and SJ Team Return computed
from PAT (`investorReturn = pat × investorReturnRate/100`,
`sjTeamReturn = pat − investorReturn`) rather than from After Insurance
directly. Confirmed explicitly before implementing, since it reverses a
decision that took several rounds of clarification to reach and specifically undoes
the "SJ Team is completely unaffected by tax" guarantee that used to be
tested and true — raising Tax Rate now reduces Investor, SJ Team, SJ
Interest, and JO Team together. The root-cause check gained `pat` back (a
tax rate over 100% can flip PAT negative even while After Insurance stays
positive), replacing the old investor-only `investorReturnNet` cause.
"Investor Return (Gross)"/"(Net)" collapsed back into a single "Investor
Return" row, since there's no longer a separate pre-tax/post-tax figure —
tax happens before the split now, not after.

**Immediate correction, same day (2026-08-06):** the owner caught that the
PAT-based split above contradicted "the Investor bears the cost of Tax" —
if both Investor and SJ Team come from PAT, SJ Team is no longer protected
from Tax, which is exactly the guarantee the 2026-08-03 design existed to
provide. Reconciled both requirements: PAT is still shown as its own row
(`pat = afterInsurance - tax`), but `sjTeamReturn` is computed from the
*pre-tax* `afterInsurance` again (`afterInsurance * (1 -
investorReturnRate/100)`) so it — and `sjInterest`/`joTeam` below it — never
moves with Tax Rate. `investorReturn = pat - sjTeamReturn` is a residual
that absorbs 100% of whatever Tax removed. Verified this reproduces the
exact same numbers as the original 2026-08-03 design (e.g. Investor Return
= 16.8% at the default rates, same as the old "Investor Return (Net)") —
so the net effect of this whole two-step detour is: same math as before,
plus a real PAT row now shown for the owner's reference. The root-cause
check's fourth candidate changed from `pat` to `investorReturn`, since
Investor Return can go negative at a lower tax rate than PAT itself does
(it's PAT minus SJ Team's fixed cut, a strictly smaller number).

**Debugging detour, later the same day (2026-08-06):** the owner reported
the live site's numbers didn't match "Investor bears all Tax" — their
screenshots showed Investor Return and SJ Team Return exactly equal, which
is what you'd get from splitting PAT evenly, not from the
investor-absorbs-the-residual formula above. Verified with `curl` against
the deployed `calc.js` and with `node -e` running the exact same inputs
locally: **the deployed code was correct** and produced the
investor-absorbs-it numbers, not the equal-split numbers in the
screenshots. Concluded the owner's phone browser was showing a cached
`calc.js` from before that day's earlier deploy, and advised a hard
refresh / cache clear. Lesson for future sessions: when live behavior
contradicts what the code should do, verify the actual deployed
artifact (`curl`) and a local run with matching inputs *before* assuming
the code is wrong — this project has no service worker or CDN of its own,
but GitHub Pages responses can still be cached by the browser/network.

**Final reversal, same day (2026-08-06):** after the cache explanation,
the owner clarified that the "Investor bears all Tax" design was never
actually what they wanted after all — the *original* PAT-based
50/50-by-`investorReturnRate` split (the one from earlier the same day,
undone by the "Immediate correction" entry above) was correct, and should
stay. This was double-confirmed with concrete numbers
(`PAT × investorReturnRate/100` for both sides) before implementing, given
this was the third flip on the same question within one day. **This is the
confirmed final state** — `sjTeamReturn` and `investorReturn` are both
derived from `pat`, and Tax Rate changes affect both sides proportionally.
The root-cause check's fourth candidate moved back to `pat`. See
`CLAUDE.md`'s Data Flow section for the guidance left for future sessions:
if asked to change this yet again, treat it as a genuine new instruction
and re-verify with concrete numbers, not as "fixing" a bug.

## Standing safety note

During development, a headless-Chrome verification step once ran
`taskkill /F /IM chrome.exe` to clean up a test browser instance — this
force-closed *all* Chrome windows on the machine, not just the test
instance. No data was lost, but this must never happen again: verification
always uses a dedicated `--user-data-dir` and kills only that specific
process's PID, never by image name.
