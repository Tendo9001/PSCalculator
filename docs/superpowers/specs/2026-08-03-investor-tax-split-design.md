# Investor/MY-Team Split with Investor-Borne Tax — Design Spec

Date: 2026-08-03

## Background

The original calculator (see `2026-08-02-profit-split-calculator-design.md`)
modeled Tax as a deduction from the whole "After Takaful" pool before it was
split 50/50 between the Investor and the SJ-Team. The project owner clarified
the real business model (confirmed against their own reference spreadsheet,
`Book2.xlsx`):

- `Cost of Fund` is what the operator has already promised to pay the
  investor as a guaranteed return — it's a cost, not part of this split.
- `After Takaful` is the operator's own net profit, split 50/50 between the
  Investor (as a profit share on top of Cost of Fund) and the SJ-Team.
- **Tax is a cost the Investor alone bears on their profit-share.** It is
  not deducted from the shared pool before the split — the split happens
  first (both sides get their full pre-tax share of After Takaful), and only
  the Investor's half is then reduced by Tax. The SJ-Team's half, and
  everything computed from it (SJ-Team Interest, MY Interest, MY Team, MY
  Team Monthly Payout), is completely unaffected by Tax.

This replaces the "PAT (Profit After Tax)" concept from the previous design
— there is no longer a single shared post-tax pool to split, so PAT is
removed.

## Calculation chain

```
annualRate          = monthlyRate * period
balanceInterest     = annualRate - costOfFund
afterTakaful        = balanceInterest - takaful            (takaful = 1%)

investorReturnGross = afterTakaful * investorSplit         (investorSplit = 50%)
teamAReturn         = afterTakaful - investorReturnGross   (SJ-Team's half; untouched by tax)
tax                 = investorReturnGross * (taxRate / 100)
investorReturnNet   = investorReturnGross - tax

teamAInterest       = teamAReturn * sjRatio                (sjRatio = 40%)
teamBInterest       = teamAReturn * myRatio                (myRatio = 60%)
teamBAmount         = principal * (teamBInterest / 100)
perHeadAmount       = teamBAmount / myTeamCount             (myTeamCount = 4)
monthlyPayout       = perHeadAmount / 12
```

`taxRate` is a new 5th user input (percent number, e.g. `20` for 20%),
alongside Principal, Monthly Rate, Period, and Cost of Fund. All other
constants are unchanged from the original design.

## UI structure

**Shared section** (always visible, above the tabs): Annual Rate, Balance
Interest, After Takaful — these three numbers feed both sides of the split
and are identical regardless of which tab is active.

**Two tabs below the shared section:**

- **MY Team** (default/active tab on page load): SJ-Team Return, SJ-Team
  Interest, MY Interest, MY Team. The highlighted result card shows
  **MY Team Monthly Payout**.
- **Investor**: Investor Return (Gross), Tax, Investor Return (Net). The
  highlighted result card shows **Investor Return (Net)**.

The "Team B Amount" row (`teamBAmount`) stays computed internally but hidden
from display, same as in the original design — it's identical in value to
the amount portion of MY Interest.

The single highlighted result card at the bottom of the page is shared
between tabs — its label, value, and negative-styling update to match
whichever tab is currently active, rather than duplicating the card per tab.

## Negative-value handling

Three "shared" root-cause candidates, checked in this order (unchanged
from the original design, same messages): `annualRate`, `balanceInterest`,
`afterTakaful`. If one of these is negative, it cascades into both tabs
(both `investorReturnGross` and `teamAReturn` inherit the sign of
`afterTakaful`), so the warning modal opens **regardless of which tab is
active** — the shared section showing the negative row is always visible.

One new "investor-only" root-cause candidate: `investorReturnNet` going
negative while `investorReturnGross` stays positive (only possible if
`taxRate` exceeds 100%). This cannot affect the MY-Team side at all, since
none of the MY-Team figures derive from `investorReturnNet`. The warning
modal for this specific cause **only opens while the Investor tab is
active** — switching to the Investor tab re-checks and opens it if it
applies; switching away does not carry a lingering popup for a row the user
can't currently see.

Implementation: `calculate()` returns a `rootCause` object tagged with a
`scope` of `'shared'` or `'investor'`. The renderer opens the modal
immediately for `scope: 'shared'` causes, and only opens/re-checks
`scope: 'investor'` causes when the Investor tab is the active one (checked
both on recalculation and on tab switch).

## Data shape returned by `calculate()`

```
{
  shared: [ { key, label, ratio, amount, negative }, ... ],   // annualRate, balanceInterest, afterTakaful
  myTeam: [ { key, label, ratio?, amount, negative }, ... ],  // teamAReturn, teamAInterest, teamBInterest, teamBAmount (hidden), perHeadAmount, monthlyPayout
  investor: [ { key, label, ratio?, amount, negative }, ... ], // investorReturnGross, tax, investorReturnNet
  rootCause: { key, message, scope } | null
}
```

## Testing

`calc.test.mjs` is rewritten so each test searches across
`shared`/`myTeam`/`investor` for a given row key. Cases to cover:
- All-positive chain with a nonzero tax rate — confirms Investor Return Net
  is reduced by tax while MY-Team figures match what they'd be with
  `taxRate: 0` (proving MY-Team is tax-independent).
- Each of the three shared root causes (reusing the original design's
  numbers, now including a `taxRate`).
- A `taxRate` over 100% flipping `investorReturnNet` negative while
  `investorReturnGross`, `teamAReturn`, and everything MY-Team-side stays
  positive — confirms the investor-only isolation and `scope: 'investor'`.

## Out of scope

- No changes to Principal's live-formatting behavior, PWA files, or
  deployment process — this spec only covers the calculation restructuring
  and the tab-based breakdown UI.
