# Adjustable Rates, Renamed Labels, and Payout Summary — Design Spec

Date: 2026-08-04

## Background

The project owner shared an updated version of their reference spreadsheet
(`Book2.xlsx`). Compared to the version this app was last reconciled
against, it:

- Renamed "Takaful" to "Insurance", and marked several previously-hardcoded
  rates as "(rate adjustable)".
- Marked two old rows ("JO Team ÷4" and "JO monthly") as
  "(deleted/ignore)", because a new summary table lower in the sheet
  replaces them.
- Added a new summary table listing Monthly and Yearly payout for five
  roles: Investor, SJ, SJ Member, JO, JO Member.
- Uses "JO" where the app currently says "MY".

**Business-logic clarification confirmed with the owner:** the
spreadsheet's `Investor Return`/`SJ Team Return` formulas are literally
`PAT × rate` (i.e. both computed from the shared post-tax pool) — this is
unchanged from the very first version of the spreadsheet, not a new edit.
The owner explicitly re-confirmed that the *app's* business logic should
stay as it is: tax is borne only by the Investor's share, computed and
deducted **after** the Investor/SJ-Team split, not before it. Only the
**labels and which values are user-adjustable** come from the new
spreadsheet — the split-then-tax-only-investor computation model from
`2026-08-03-investor-tax-split-design.md` is retained.

## New/changed inputs

Anything the spreadsheet marks "(rate adjustable)" becomes a user input,
grouped into a **second input card**, separate from the original four:

**Card 1 — Deal Terms** (unchanged from before):
- Principal (RM)
- Monthly Rate (%)
- Period (months)
- Cost of Fund (%)

**Card 2 — Adjustable Rates** (new):
- Insurance Rate (%) — replaces the hardcoded `takaful = 1` constant.
- Tax Rate (%) — already existed, moved into this card.
- Investor Return (%) — replaces the hardcoded `investorSplit = 0.5`
  constant. SJ Team Return is **not** a separate input; it's always
  `100% − Investor Return` (auto-complement, so the two can never fail to
  sum to 100%).
- JO Rate (%) — replaces the hardcoded `myRatio = 0.6` constant. SJ
  Interest is **not** a separate input; it's always `100% − JO Rate`
  (auto-complement).

`myTeamCount = 4` (the JO Member headcount divisor) stays a hardcoded
constant — the spreadsheet never marks it "(rate adjustable)".

## Calculation chain

```
annualRate          = monthlyRate * period
balanceInterest     = annualRate - costOfFund
afterInsurance      = balanceInterest - insuranceRate        (was afterTakaful; insuranceRate now a direct input, subtracted as a percentage-point value, same convention as the old hardcoded takaful=1)

investorReturnGross = afterInsurance * (investorReturnRate / 100)
sjTeamReturn        = afterInsurance - investorReturnGross    (auto-complement; untouched by tax)
tax                 = afterInsurance * (taxRate / 100)
investorReturnNet   = investorReturnGross - tax

sjInterest          = sjTeamReturn * (1 - joRate / 100)        (auto-complement of JO Rate)
joTeam              = sjTeamReturn * (joRate / 100)
joTeamAmount        = principal * (joTeam / 100)                (hidden row, same precedent as the old "Team B Amount")
joMember            = joTeamAmount / 4
joMonthly           = joMember / 12
```

`joMember`/`joMonthly` are **not** rendered as their own breakdown-list rows
(matching the spreadsheet marking their old rows "deleted/ignore") — they
only feed the new Payout Summary table below.

## UI structure

**Tabs are removed.** The MY Team / Investor tab split from the previous
design is undone — the owner no longer wants the breakdown split across two
views. Everything below the two input cards is one page, top to bottom:

1. **Card 1 — Deal Terms** (4 inputs, unchanged)
2. **Card 2 — Adjustable Rates** (4 inputs, new)
3. **Breakdown card** — a single flat list, in calculation order:
   1. Annual Rate
   2. Balance Interest
   3. After Insurance
   4. Investor Return (Gross)
   5. SJ Team Return
   6. Tax
   7. Investor Return (Net)
   8. SJ Interest
   9. JO Team

   (the `joTeamAmount` row stays computed-but-hidden, same as before)
4. **Payout Summary card** (new) — a table with two columns, Monthly
   Payout and Yearly Payout, and five rows:

   | Role | Monthly Payout | Yearly Payout |
   |---|---|---|
   | Investor | Investor Return (Net) ÷ 12 | Investor Return (Net) |
   | SJ | SJ Team Return ÷ 12 | SJ Team Return |
   | SJ Member | SJ Interest ÷ 12 | SJ Interest |
   | JO | JO Team ÷ 12 | JO Team |
   | JO Member (after plug) | JO Team ÷ 4 ÷ 12 | JO Team ÷ 4 |

There is no more "highlighted final result" card — the Payout Summary table
is the final result section, replacing it.

## Negative-value handling

Simplified from the tab-scoped design: since there's only one view now,
there's no "only warn while a specific tab is active" gating. The warning
modal opens whenever a computed value goes negative, naming the first
variable in calculation order that's negative — same detection order as
before (`annualRate` → `balanceInterest` → `afterInsurance` →
`investorReturnNet` as a fourth possible cause, since a very high Tax Rate
or a very high Investor Return % combined with low JO/SJ splits could still
push `investorReturnNet` negative independently of the shared chain).

`calculate()`'s return shape simplifies to a single flat `rows` array plus
a `payoutSummary` array (the 5-role table) plus `rootCause: { key, message
} | null` — no more `shared`/`myTeam`/`investor` grouping and no more
`scope` field, since there's nothing left that needs tab-based scoping.

## Labels

Row and input labels follow the spreadsheet's own wording where the
spreadsheet states one (Title Cased for consistency with the rest of the
UI): "Insurance Rate", "Investor Return", "JO Rate", "SJ Team Return", "SJ
Interest", "JO Team", "Investor", "SJ", "SJ Member", "JO", "JO Member
(after plug)". One deliberate deviation: the summary table's column headers
are "Monthly Payout" / "Yearly Payout" **without** the spreadsheet's
"(PAT)" suffix — since PAT is not part of this app's actual computation
(confirmed above), keeping "(PAT)" in the header would misdescribe what the
numbers are.

## Out of scope

No changes to deployment process, PWA files, Principal's live-formatting
behavior, or the headless-Chrome verification approach — this spec only
covers the new inputs, the calculation chain change, and the UI
restructuring (two input cards, no tabs, new summary table).
