# Adjustable Rates, Renamed Labels, and Payout Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four hardcoded constants (Takaful/Insurance rate, Investor
split, SJ/JO split) with user-adjustable inputs, rename several labels to
match the project owner's spreadsheet ("Insurance", "JO"), remove the
MY Team / Investor tab split in favor of one flat breakdown, and add a new
Monthly/Yearly Payout Summary table.

**Architecture:** `calc.js` simplifies back to a single flat `rows` array
(no more `shared`/`myTeam`/`investor` grouping, since there are no more
tabs) plus a new `payoutSummary` array (5 roles × monthly/yearly) and a
`rootCause` object without a `scope` field (nothing needs tab-based
gating anymore). `script.js` and `index.html` drop all tab machinery.

## Global Constraints

- Business logic is unchanged from `2026-08-03-investor-tax-split-design.md`:
  tax is computed from the whole `afterInsurance` pool
  (`afterInsurance * (taxRate / 100)`) but deducted only from the
  Investor's share. SJ Team Return and everything derived from it must
  never reference `taxRate`.
- New inputs, grouped into a second input card ("Adjustable Rates"),
  separate from the original four ("Deal Terms"):
  - Insurance Rate (%) — replaces the hardcoded `takaful = 1` constant.
    Subtracted from Balance Interest as a percentage-point value, same
    convention as the old constant (not divided by 100 in that specific
    subtraction).
  - Tax Rate (%) — already existed, moves into this second card.
  - Investor Return (%) — replaces the hardcoded `investorSplit = 0.5`
    constant. SJ Team Return is **always** `afterInsurance -
    investorReturnGross` (the auto-complement) — there is no separate SJ
    Team Return input.
  - JO Rate (%) — replaces the hardcoded `myRatio = 0.6` constant. SJ
    Interest is **always** `sjTeamReturn * (1 - joRate / 100)` (the
    auto-complement) — there is no separate SJ Interest input.
- `myTeamCount = 4` stays a hardcoded constant (not adjustable).
- No more tabs. The breakdown is one flat list in calculation order:
  Annual Rate, Balance Interest, After Insurance, Investor Return (Gross),
  SJ Team Return, Tax, Investor Return (Net), SJ Interest, JO Team. No row
  is hidden — the old "hide the redundant amount-only duplicate" mechanism
  (`HIDDEN_ROW_KEYS`) is removed because nothing duplicates another row's
  value anymore.
- New Payout Summary table below the breakdown, with columns "Monthly
  Payout (PAT)" and "Yearly Payout (PAT)" (verbatim from the spreadsheet,
  kept on the owner's explicit instruction even though this app's numbers
  aren't computed via a PAT step), and 5 rows: Investor, SJ, SJ Member, JO,
  JO Member (after plug). There is no more separate "highlighted final
  result" card — this table is the final result section.
- Negative-value warning: opens whenever any computed value is negative,
  regardless of "tab" (there are none) — no more `scope`-based gating.
  Root-cause check order: `annualRate` → `balanceInterest` →
  `afterInsurance` → `investorReturnNet`.
- Principal's live-formatting behavior (`sanitizePrincipalRaw`,
  `formatPrincipalLive`, `formatPrincipalOnBlur`) carries over unchanged —
  out of scope for this plan.
- No new dependencies, no build step.

---

### Task 1: Restructure the calculation engine

**Files:**
- Modify: `calc.js`
- Modify: `calc.test.mjs` (full rewrite)

**Interfaces:**
- Produces: `calculate({ principal, monthlyRate, period, costOfFund,
  insuranceRate, taxRate, investorReturnRate, joRate })` →
  `{ rows, payoutSummary, rootCause }`.
  - `rows`: array of `{ key, label, ratio, amount, negative }`, in
    calculation order: `annualRate`, `balanceInterest`, `afterInsurance`,
    `investorReturnGross`, `sjTeamReturn`, `tax`, `investorReturnNet`,
    `sjInterest`, `joTeam`.
  - `payoutSummary`: array of `{ key, label, monthly, yearly, negative }`
    with keys `investor`, `sj`, `sjMember`, `jo`, `joMember` (in that
    order).
  - `rootCause`: `{ key, message } | null`.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `calc.test.mjs` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.js';

function findRow(result, key) {
  const row = result.rows.find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

function findSummary(result, key) {
  const row = result.payoutSummary.find((r) => r.key === key);
  assert.ok(row, `expected a payout summary row with key "${key}"`);
  return row;
}

const DEFAULT_RATES = { insuranceRate: 1, taxRate: 20, investorReturnRate: 50, joRate: 60 };

test('all-positive chain at default rates matches the pre-adjustable-rates numbers', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 16.8);
  assert.equal(findRow(result, 'sjInterest').ratio, 11.2);
  assert.equal(findRow(result, 'joTeam').ratio, 16.8);

  assert.deepEqual(result.rows.map((r) => r.key), [
    'annualRate', 'balanceInterest', 'afterInsurance',
    'investorReturnGross', 'sjTeamReturn', 'tax', 'investorReturnNet',
    'sjInterest', 'joTeam',
  ]);

  assert.equal(findSummary(result, 'investor').yearly, 16800);
  assert.equal(findSummary(result, 'investor').monthly, 1400);
  assert.equal(findSummary(result, 'sj').yearly, 28000);
  assert.equal(findSummary(result, 'sjMember').yearly, 11200);
  assert.equal(findSummary(result, 'jo').yearly, 16800);
  assert.equal(findSummary(result, 'joMember').yearly, 4200);
  assert.equal(findSummary(result, 'joMember').monthly, 350);

  assert.deepEqual(result.payoutSummary.map((r) => r.key), ['investor', 'sj', 'sjMember', 'jo', 'joMember']);

  assert.equal(result.rootCause, null);
});

test('Insurance Rate is a live input, not a hardcoded constant', () => {
  const withDefault = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });
  const withHigherInsurance = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES, insuranceRate: 2 });

  assert.equal(findRow(withDefault, 'afterInsurance').ratio, 56);
  assert.equal(findRow(withHigherInsurance, 'afterInsurance').ratio, 55);
});

test('Investor Return / JO Rate auto-complements produce the correct split', () => {
  const result = calculate({
    principal: 100000,
    monthlyRate: 5,
    period: 12,
    costOfFund: 3,
    insuranceRate: 1,
    taxRate: 0,
    investorReturnRate: 70,
    joRate: 30,
  });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 39.2);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 16.8);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 39.2);
  assert.equal(findRow(result, 'sjInterest').ratio, 11.76);
  assert.equal(findRow(result, 'joTeam').ratio, 5.04);
});

test('cost of fund exceeding annual rate flags balanceInterest as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(result.rootCause.key, 'balanceInterest');
  assert.match(result.rootCause.message, /Cost of Fund/);
});

test('a tax rate high enough flips investorReturnNet negative while sjTeamReturn stays positive', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, insuranceRate: 1, taxRate: 60, investorReturnRate: 50, joRate: 60 });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'investorReturnGross').negative, false);
  assert.equal(findRow(result, 'investorReturnNet').ratio, -5.6);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'sjTeamReturn').negative, false);
  assert.equal(result.rootCause.key, 'investorReturnNet');
  assert.match(result.rootCause.message, /Tax Rate/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test calc.test.mjs`
Expected: FAIL — `calc.js` still uses the old
`{ shared, myTeam, investor, rootCause }` shape and hardcoded constants, so
`result.rows` is `undefined` and the tests throw.

- [ ] **Step 3: Rewrite `calc.js`**

Replace the entire contents of `calc.js` with:

```js
'use strict';

const CONSTANTS = {
  myTeamCount: 4,
};

function round(n) {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

function toRatioRow(key, label, ratio, principal) {
  const roundedRatio = round(ratio);
  return {
    key,
    label,
    ratio: roundedRatio,
    amount: round(principal * (roundedRatio / 100)),
    negative: roundedRatio < 0,
  };
}

function toPayoutRow(key, label, yearlyAmount) {
  const roundedYearly = round(yearlyAmount);
  return {
    key,
    label,
    monthly: round(roundedYearly / 12),
    yearly: roundedYearly,
    negative: roundedYearly < 0,
  };
}

const ROOT_CAUSE_ORDER = [
  {
    key: 'annualRate',
    message: 'Monthly Rate and Period combine to a negative Annual Rate. Check your inputs.',
  },
  {
    key: 'balanceInterest',
    message: 'Cost of Fund exceeds Annual Rate, causing Balance Interest to go negative.',
  },
  {
    key: 'afterInsurance',
    message: 'Balance Interest is too low to cover the Insurance deduction, causing After Insurance to go negative.',
  },
  {
    key: 'investorReturnNet',
    message: 'Tax Rate is high enough to make Investor Return (Net) negative, even though Investor Return (Gross) is positive.',
  },
];

function calculate({
  principal,
  monthlyRate,
  period,
  costOfFund,
  insuranceRate,
  taxRate,
  investorReturnRate,
  joRate,
}) {
  const annualRate = monthlyRate * period;
  const balanceInterest = annualRate - costOfFund;
  const afterInsurance = balanceInterest - insuranceRate;

  const investorReturnGross = afterInsurance * (investorReturnRate / 100);
  const sjTeamReturn = afterInsurance - investorReturnGross;
  const tax = afterInsurance * (taxRate / 100);
  const investorReturnNet = investorReturnGross - tax;

  const sjInterest = sjTeamReturn * (1 - joRate / 100);
  const joTeam = sjTeamReturn * (joRate / 100);

  const rows = [
    toRatioRow('annualRate', 'Annual Rate', annualRate, principal),
    toRatioRow('balanceInterest', 'Balance Interest', balanceInterest, principal),
    toRatioRow('afterInsurance', 'After Insurance', afterInsurance, principal),
    toRatioRow('investorReturnGross', 'Investor Return (Gross)', investorReturnGross, principal),
    toRatioRow('sjTeamReturn', 'SJ Team Return', sjTeamReturn, principal),
    toRatioRow('tax', 'Tax', tax, principal),
    toRatioRow('investorReturnNet', 'Investor Return (Net)', investorReturnNet, principal),
    toRatioRow('sjInterest', 'SJ Interest', sjInterest, principal),
    toRatioRow('joTeam', 'JO Team', joTeam, principal),
  ];

  const joTeamAmount = rows.find((r) => r.key === 'joTeam').amount;
  const joMemberYearly = joTeamAmount / CONSTANTS.myTeamCount;

  const payoutSummary = [
    toPayoutRow('investor', 'Investor', rows.find((r) => r.key === 'investorReturnNet').amount),
    toPayoutRow('sj', 'SJ', rows.find((r) => r.key === 'sjTeamReturn').amount),
    toPayoutRow('sjMember', 'SJ Member', rows.find((r) => r.key === 'sjInterest').amount),
    toPayoutRow('jo', 'JO', joTeamAmount),
    toPayoutRow('joMember', 'JO Member (after plug)', joMemberYearly),
  ];

  let rootCause = null;
  for (const candidate of ROOT_CAUSE_ORDER) {
    const row = rows.find((r) => r.key === candidate.key);
    if (row.negative) {
      rootCause = { key: candidate.key, message: candidate.message };
      break;
    }
  }

  return { rows, payoutSummary, rootCause };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test calc.test.mjs`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add calc.js calc.test.mjs
git commit -m "Make Insurance/Investor/JO rates user-adjustable; rename labels; add payout summary data"
```

---

### Task 2: Two input cards, flat breakdown, and the Payout Summary table markup

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Produces DOM elements/ids consumed by Task 3's `script.js`: `principal`,
  `monthlyRate`, `period`, `costOfFund`, `insuranceRate`, `taxRate`,
  `investorReturnRate`, `joRate` (inputs), `breakdown` (single container,
  replacing `sharedBreakdown`/`myTeamBreakdown`/`investorBreakdown`),
  `summaryBody` (the payout summary `<tbody>`), `modalOverlay`,
  `modalMessage`, `modalClose`.
- Removes: `sharedBreakdown`, `myTeamBreakdown`, `investorBreakdown`,
  `tabMyTeam`, `tabInvestor`, `resultCard`, `resultLabel`, `resultValue` —
  none of these ids should remain anywhere in `index.html` after this task.

- [ ] **Step 1: Replace the body of `index.html`**

Replace everything from `<main class="app">` through the closing
`</main>` tag with:

```html
  <main class="app">
    <h1 class="app__title">Profit Split Calculator</h1>

    <section class="card card--inputs">
      <h2 class="card__heading">Deal Terms</h2>
      <div class="field">
        <label for="principal">Principal (RM)</label>
        <input type="text" id="principal" inputmode="decimal" autocomplete="off" placeholder="0.00" />
      </div>
      <div class="field">
        <label for="monthlyRate">Monthly Rate (%)</label>
        <input type="number" id="monthlyRate" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
      <div class="field">
        <label for="period">Period (months)</label>
        <input type="number" id="period" inputmode="decimal" step="any" placeholder="0" />
      </div>
      <div class="field">
        <label for="costOfFund">Cost of Fund (%)</label>
        <input type="number" id="costOfFund" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
    </section>

    <section class="card card--inputs">
      <h2 class="card__heading">Adjustable Rates</h2>
      <div class="field">
        <label for="insuranceRate">Insurance Rate (%)</label>
        <input type="number" id="insuranceRate" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
      <div class="field">
        <label for="taxRate">Tax Rate (%)</label>
        <input type="number" id="taxRate" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
      <div class="field">
        <label for="investorReturnRate">Investor Return (%)</label>
        <input type="number" id="investorReturnRate" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
      <div class="field">
        <label for="joRate">JO Rate (%)</label>
        <input type="number" id="joRate" inputmode="decimal" step="any" placeholder="0.00" />
      </div>
    </section>

    <section class="card card--breakdown">
      <h2 class="card__heading">Breakdown</h2>
      <div class="breakdown" id="breakdown"></div>
    </section>

    <section class="card card--summary">
      <h2 class="card__heading">Payout Summary</h2>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Monthly Payout (PAT)</th>
            <th>Yearly Payout (PAT)</th>
          </tr>
        </thead>
        <tbody id="summaryBody"></tbody>
      </table>
    </section>
  </main>
```

- [ ] **Step 2: Remove the now-unused tab and result-card CSS, add the summary table CSS**

In `styles.css`, delete these rules entirely (tabs and the old highlighted
result card no longer exist): `.tabs`, `.tab`, `.tab:hover`,
`.tab--active`, `.card--result`, `.card--result-negative`, `.result__label`,
`.result__value`, `.card--result-negative .result__value`, `.field--full`,
and `.breakdown[hidden]`. Also delete the `.result__value { font-size:
1.9rem; }` rule inside the `@media (max-width: 480px)` block at the bottom
(the mobile override for the now-removed result card).

Add this block after the `.breakdown-row--negative` rule:

```css
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.summary-table th,
.summary-table td {
  padding: 8px 4px;
  text-align: right;
  border-bottom: 1px solid var(--border);
}

.summary-table th:first-child,
.summary-table td:first-child {
  text-align: left;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text-dim);
  font-size: 0.85rem;
}

.summary-table th {
  color: var(--text-dim);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.summary-table tr:last-child td {
  border-bottom: none;
}

.summary-row--negative td {
  color: var(--danger);
}
```

- [ ] **Step 3: Visually verify**

Open `index.html` in a browser. Confirm: two input cards ("Deal Terms" with
4 fields, "Adjustable Rates" with 4 fields) each in a 2-column grid, a
"Breakdown" card (empty — script.js isn't updated yet), and a "Payout
Summary" card with a table header row (Role / Monthly Payout (PAT) / Yearly
Payout (PAT)) and an empty body. No tabs, no bottom highlighted card.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Split inputs into Deal Terms / Adjustable Rates cards; replace tabs with a flat breakdown and Payout Summary table"
```

---

### Task 3: Wire up the new inputs, flat breakdown, and payout summary

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `calculate` from `calc.js` (Task 1) returning `{ rows,
  payoutSummary, rootCause }`; DOM ids from Task 2.

- [ ] **Step 1: Replace `script.js`**

Replace the entire contents of `script.js` with:

```js
const inputIds = [
  'principal',
  'monthlyRate',
  'period',
  'costOfFund',
  'insuranceRate',
  'taxRate',
  'investorReturnRate',
  'joRate',
];
const inputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(id)]));
const breakdownEl = document.getElementById('breakdown');
const summaryBodyEl = document.getElementById('summaryBody');
const modalOverlay = document.getElementById('modalOverlay');
const modalMessage = document.getElementById('modalMessage');
const modalClose = document.getElementById('modalClose');

let shownRootCauseKey = null;

function formatRM(amount) {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `RM ${formatted}`;
}

function formatPercent(ratio) {
  return `${ratio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function renderRows(rows) {
  breakdownEl.innerHTML = '';
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'breakdown-row' + (row.negative ? ' breakdown-row--negative' : '');

    const labelEl = document.createElement('span');
    labelEl.className = 'breakdown-row__label';
    labelEl.textContent = row.label;

    const valuesEl = document.createElement('span');
    valuesEl.className = 'breakdown-row__values';
    valuesEl.textContent = `${formatPercent(row.ratio)} / ${formatRM(row.amount)}`;

    rowEl.append(labelEl, valuesEl);
    breakdownEl.append(rowEl);
  }
}

function renderSummary(payoutSummary) {
  summaryBodyEl.innerHTML = '';
  for (const row of payoutSummary) {
    const rowEl = document.createElement('tr');
    rowEl.className = row.negative ? 'summary-row--negative' : '';

    const labelCell = document.createElement('td');
    labelCell.textContent = row.label;

    const monthlyCell = document.createElement('td');
    monthlyCell.textContent = formatRM(row.monthly);

    const yearlyCell = document.createElement('td');
    yearlyCell.textContent = formatRM(row.yearly);

    rowEl.append(labelCell, monthlyCell, yearlyCell);
    summaryBodyEl.append(rowEl);
  }
}

function openModal(message) {
  modalMessage.textContent = message;
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

function hasAnyInputValue() {
  return inputIds.some((id) => inputs[id].value !== '');
}

function sanitizePrincipalRaw(raw) {
  let seenDot = false;
  let result = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if (ch === '.' && !seenDot) {
      result += ch;
      seenDot = true;
    }
  }
  return result;
}

function addThousandsSeparators(intDigits) {
  const stripped = intDigits.replace(/^0+(?=\d)/, '');
  return stripped.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPrincipalLive(raw, cursorPos) {
  const before = raw.slice(0, cursorPos);
  let meaningfulBeforeCursor = 0;
  let dotSeenInBefore = false;
  for (const ch of before) {
    if (ch >= '0' && ch <= '9') {
      meaningfulBeforeCursor++;
    } else if (ch === '.' && !dotSeenInBefore) {
      meaningfulBeforeCursor++;
      dotSeenInBefore = true;
    }
  }

  const sanitized = sanitizePrincipalRaw(raw);
  const dotIndex = sanitized.indexOf('.');
  const intDigits = dotIndex === -1 ? sanitized : sanitized.slice(0, dotIndex);
  const decDigits = dotIndex === -1 ? '' : sanitized.slice(dotIndex + 1);

  const formattedInt = addThousandsSeparators(intDigits);
  const formattedValue = dotIndex === -1 ? formattedInt : `${formattedInt}.${decDigits}`;

  let count = 0;
  let newPos = formattedValue.length;
  if (meaningfulBeforeCursor === 0) {
    newPos = 0;
  } else {
    for (let i = 0; i < formattedValue.length; i++) {
      if (formattedValue[i] !== ',') {
        count++;
        if (count === meaningfulBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
    }
  }

  return { formattedValue, newPos };
}

function formatPrincipalOnBlur(raw) {
  const sanitized = sanitizePrincipalRaw(raw);
  if (sanitized === '' || sanitized === '.') {
    return '';
  }
  const numeric = Number(sanitized);
  if (Number.isNaN(numeric)) {
    return '';
  }
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readInputs() {
  const values = {};
  for (const id of inputIds) {
    const raw = inputs[id].value.replace(/,/g, '');
    values[id] = raw === '' ? 0 : Number(raw);
  }
  return values;
}

function recalculate() {
  const values = readInputs();
  if (Object.values(values).some((v) => Number.isNaN(v))) {
    return;
  }

  const result = calculate(values);
  renderRows(result.rows);
  renderSummary(result.payoutSummary);

  const hasAnyInput = hasAnyInputValue();

  if (!hasAnyInput || !result.rootCause) {
    closeModal();
    shownRootCauseKey = null;
  } else if (result.rootCause.key !== shownRootCauseKey) {
    openModal(result.rootCause.message);
    shownRootCauseKey = result.rootCause.key;
  }
}

inputs.principal.addEventListener('input', (event) => {
  const el = event.target;
  const { formattedValue, newPos } = formatPrincipalLive(el.value, el.selectionStart);
  el.value = formattedValue;
  el.setSelectionRange(newPos, newPos);
  recalculate();
});
inputs.principal.addEventListener('blur', (event) => {
  event.target.value = formatPrincipalOnBlur(event.target.value);
  recalculate();
});

inputIds
  .filter((id) => id !== 'principal')
  .forEach((id) => inputs[id].addEventListener('input', recalculate));

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

recalculate();
```

- [ ] **Step 2: Manually verify with a headless browser**

Using the project's established headless-Chrome verification approach (a
throwaway, isolated `--user-data-dir` profile — never the user's real
Chrome profile, and killed by its specific PID afterward, never
`taskkill /IM`), open `index.html` and drive these scenarios via CDP
`Runtime.evaluate`, setting each input's `.value` and dispatching an
`input` event, then reading back `#breakdown`'s rows and `#summaryBody`'s
rows:

| Case | inputs | Expect |
|---|---|---|
| Default rates, all positive | principal=100000, monthlyRate=5, period=12, costOfFund=3, insuranceRate=1, taxRate=20, investorReturnRate=50, joRate=60 | Breakdown's `joTeam` row shows `16.80% / RM 16,800.00`; summary's `JO Member (after plug)` row shows monthly `RM 350.00`, yearly `RM 4,200.00`; no modal |
| Shared cause | monthlyRate=2, period=6, costOfFund=20, other rates same as above | Modal opens immediately mentioning Cost of Fund; breakdown rows from `balanceInterest` onward are red |
| Investor-only cause | principal=100000, monthlyRate=5, period=12, costOfFund=3, insuranceRate=1, taxRate=60, investorReturnRate=50, joRate=60 | Modal opens mentioning Tax Rate; `investorReturnNet` row is red; `sjTeamReturn`/`joTeam` rows and the `JO`/`JO Member` summary rows are NOT red |

Also run `node --test calc.test.mjs` once to confirm Task 1's 5 tests are
still green (this task doesn't touch `calc.js`, but confirm nothing broke).

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Wire up two input cards, flat breakdown, and payout summary table"
```

**Checkpoint:** Confirm with the user that the new layout (two input cards,
no tabs, flat breakdown, payout summary table) matches what they asked for
before deploying.

---

### Task 4: Deploy

**Files:** none (repo operations only)

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Ask the user before pushing**

This project's established workflow is to ask for explicit confirmation
before every push, since it updates the live public GitHub Pages site.
Ask, then:

```bash
git push
```

- [ ] **Step 3: Verify the live deployment**

```bash
for i in $(seq 1 10); do
  if curl -s https://tendo9001.github.io/PSCalculator/calc.js | grep -q "insuranceRate"; then
    echo "deployed"
    break
  fi
  sleep 10
done
```
Expected: prints `deployed` within the loop.

## Self-Review Notes

- Spec coverage: new adjustable-rate inputs (Task 1 + 2), renamed labels
  (Task 1's row labels + Task 2's input labels), removed tabs / flat
  breakdown (Task 2 + 3), Payout Summary table (Task 1's data + Task 2's
  markup + Task 3's rendering), and deployment (Task 4) each map to the
  spec's corresponding sections.
- No placeholders: every step has literal file contents or exact commands.
- Type/key consistency checked: `calc.js`'s row keys (`annualRate`,
  `balanceInterest`, `afterInsurance`, `investorReturnGross`,
  `sjTeamReturn`, `tax`, `investorReturnNet`, `sjInterest`, `joTeam`) and
  payout summary keys (`investor`, `sj`, `sjMember`, `jo`, `joMember`)
  match exactly between Task 1's tests, Task 3's `script.js`, and the
  verification table.
