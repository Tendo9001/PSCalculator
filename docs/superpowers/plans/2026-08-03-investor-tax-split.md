# Investor/MY-Team Tax Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the calculator so Tax is borne only by the Investor's
half of the split (not the whole shared pool), and present the breakdown as
a shared section plus two tabs ("MY Team" / "Investor").

**Architecture:** `calc.js` returns three row groups (`shared`, `myTeam`,
`investor`) plus a `rootCause` object tagged with a `scope`
(`'shared'` or `'investor'`) so the UI knows whether a negative-value warning
applies regardless of the active tab or only while viewing the Investor tab.
`script.js` renders the three groups into three separate containers, toggles
which tab's container is visible, and swaps the highlighted result card's
label/value based on the active tab.

**Tech Stack:** Same as the rest of the project — plain HTML/CSS/JS, `node:test`
for `calc.js`.

## Global Constraints

- `takaful = 1`, `sjRatio = 0.4`, `myRatio = 0.6`, `investorSplit = 0.5`,
  `myTeamCount = 4` — unchanged constants, hardcoded in `calc.js`.
- Tax is computed **only** from `investorReturnGross`, never from the shared
  `afterTakaful` pool. Nothing on the MY-Team side (`teamAReturn`,
  `teamAInterest`, `teamBInterest`, `teamBAmount`, `perHeadAmount`,
  `monthlyPayout`) may reference `taxRate` — this must hold regardless of
  what `taxRate` is set to.
- The "PAT (Profit After Tax)" row from the previous design is removed
  entirely — there is no longer a shared post-tax pool.
- Row labels: "Annual Rate", "Balance Interest", "After Takaful" (shared);
  "SJ-Team Return", "SJ-Team Interest", "MY Interest", "MY Team", "MY Team
  Monthly Payout" (MY Team tab); "Investor Return (Gross)", "Tax",
  "Investor Return (Net)" (Investor tab). `teamBAmount` stays computed but
  hidden from rendering (same as before).
- MY Team tab is the default/active tab on page load.
- A negative row with `scope: 'shared'` opens the warning modal regardless
  of the active tab. A negative row with `scope: 'investor'` only opens the
  modal while the Investor tab is active, and re-arms (can show again) each
  time the user switches back to the Investor tab.
- All RM amounts: thousands separators, `RM ` prefix, 2 decimals (unchanged
  `formatRM`/`formatPercent` helpers).
- No new dependencies, no build step, no service worker (unchanged from the
  original project constraints).

---

### Task 1: Restructure the calculation engine

**Files:**
- Modify: `calc.js`
- Modify: `calc.test.mjs` (full rewrite)

**Interfaces:**
- Produces: `calculate({ principal, monthlyRate, period, costOfFund, taxRate })`
  → `{ shared, myTeam, investor, rootCause }`, where `shared`/`myTeam`/`investor`
  are arrays of `{ key, label, ratio?, amount, negative }`, and `rootCause` is
  `{ key, message, scope: 'shared' | 'investor' } | null`.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `calc.test.mjs` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.js';

function findRow(result, key) {
  const row = [...result.shared, ...result.myTeam, ...result.investor].find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

test('all-positive chain: investor side reduced by tax, MY-Team side untouched', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterTakaful').ratio, 56);

  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'tax').ratio, 5.6);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 22.4);

  assert.equal(findRow(result, 'teamAReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAInterest').ratio, 11.2);
  assert.equal(findRow(result, 'teamBInterest').ratio, 16.8);
  assert.equal(findRow(result, 'teamBAmount').amount, 16800);
  assert.equal(findRow(result, 'perHeadAmount').amount, 4200);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);

  assert.equal(result.rootCause, null);
});

test('MY-Team side is identical regardless of tax rate', () => {
  const base = { principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3 };
  const withNoTax = calculate({ ...base, taxRate: 0 });
  const withHighTax = calculate({ ...base, taxRate: 90 });

  assert.deepEqual(withNoTax.myTeam, withHighTax.myTeam);
});

test('cost of fund exceeding annual rate flags balanceInterest as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(findRow(result, 'monthlyPayout').amount, -56.25);
  assert.equal(result.rootCause.key, 'balanceInterest');
  assert.equal(result.rootCause.scope, 'shared');
  assert.match(result.rootCause.message, /Cost of Fund/);
});

test('negative monthly rate flags annualRate as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: -5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, -60);
  assert.equal(findRow(result, 'monthlyPayout').amount, -400);
  assert.equal(result.rootCause.key, 'annualRate');
  assert.equal(result.rootCause.scope, 'shared');
});

test('a small positive balance that cannot cover Takaful flags afterTakaful as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 1, period: 1, costOfFund: 0.5, taxRate: 20 });

  assert.equal(findRow(result, 'balanceInterest').ratio, 0.5);
  assert.equal(findRow(result, 'balanceInterest').negative, false);
  assert.equal(findRow(result, 'afterTakaful').ratio, -0.5);
  assert.equal(findRow(result, 'monthlyPayout').amount, -3.125);
  assert.equal(result.rootCause.key, 'afterTakaful');
  assert.equal(result.rootCause.scope, 'shared');
});

test('a tax rate over 100% flags investorReturnNet as an investor-only root cause, leaving MY-Team positive', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 150 });

  assert.equal(findRow(result, 'afterTakaful').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'investorReturnGross').negative, false);
  assert.equal(findRow(result, 'tax').ratio, 42);
  assert.equal(findRow(result, 'investorReturnNet').ratio, -14);
  assert.equal(findRow(result, 'investorReturnNet').negative, true);

  assert.equal(findRow(result, 'teamAReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAReturn').negative, false);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);
  assert.equal(findRow(result, 'monthlyPayout').negative, false);

  assert.equal(result.rootCause.key, 'investorReturnNet');
  assert.equal(result.rootCause.scope, 'investor');
  assert.match(result.rootCause.message, /Tax Rate/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test calc.test.mjs`
Expected: FAIL — `calculate` still returns the old `{ rows, rootCauseKey, rootCauseMessage }` shape, so `result.shared` is `undefined` and the tests throw.

- [ ] **Step 3: Rewrite `calc.js`**

Replace the entire contents of `calc.js` with:

```js
'use strict';

const CONSTANTS = {
  takaful: 1,
  sjRatio: 0.4,
  myRatio: 0.6,
  investorSplit: 0.5,
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

function toAmountRow(key, label, amount) {
  const roundedAmount = round(amount);
  return { key, label, amount: roundedAmount, negative: roundedAmount < 0 };
}

const SHARED_ROOT_CAUSE_ORDER = [
  {
    key: 'annualRate',
    message: 'Monthly Rate and Period combine to a negative Annual Rate. Check your inputs.',
  },
  {
    key: 'balanceInterest',
    message: 'Cost of Fund exceeds Annual Rate, causing Balance Interest to go negative.',
  },
  {
    key: 'afterTakaful',
    message: 'Balance Interest is too low to cover the After Takaful deduction, causing it to go negative.',
  },
];

function calculate({ principal, monthlyRate, period, costOfFund, taxRate }) {
  const annualRate = monthlyRate * period;
  const balanceInterest = annualRate - costOfFund;
  const afterTakaful = balanceInterest - CONSTANTS.takaful;

  const investorReturnGross = afterTakaful * CONSTANTS.investorSplit;
  const teamAReturn = afterTakaful - investorReturnGross;
  const tax = investorReturnGross * (taxRate / 100);
  const investorReturnNet = investorReturnGross - tax;

  const teamAInterest = teamAReturn * CONSTANTS.sjRatio;
  const teamBInterest = teamAReturn * CONSTANTS.myRatio;
  const teamBAmount = principal * (teamBInterest / 100);
  const perHeadAmount = teamBAmount / CONSTANTS.myTeamCount;
  const monthlyPayout = perHeadAmount / 12;

  const shared = [
    toRatioRow('annualRate', 'Annual Rate', annualRate, principal),
    toRatioRow('balanceInterest', 'Balance Interest', balanceInterest, principal),
    toRatioRow('afterTakaful', 'After Takaful', afterTakaful, principal),
  ];

  const myTeam = [
    toRatioRow('teamAReturn', 'SJ-Team Return', teamAReturn, principal),
    toRatioRow('teamAInterest', 'SJ-Team Interest', teamAInterest, principal),
    toRatioRow('teamBInterest', 'MY Interest', teamBInterest, principal),
    toAmountRow('teamBAmount', 'Team B Amount', teamBAmount),
    toAmountRow('perHeadAmount', 'MY Team', perHeadAmount),
    toAmountRow('monthlyPayout', 'MY Team Monthly Payout', monthlyPayout),
  ];

  const investor = [
    toRatioRow('investorReturnGross', 'Investor Return (Gross)', investorReturnGross, principal),
    toRatioRow('tax', 'Tax', tax, principal),
    toRatioRow('investorReturnNet', 'Investor Return (Net)', investorReturnNet, principal),
  ];

  let rootCause = null;
  for (const candidate of SHARED_ROOT_CAUSE_ORDER) {
    const row = shared.find((r) => r.key === candidate.key);
    if (row.negative) {
      rootCause = { key: candidate.key, message: candidate.message, scope: 'shared' };
      break;
    }
  }

  if (!rootCause) {
    const investorReturnNetRow = investor.find((r) => r.key === 'investorReturnNet');
    if (investorReturnNetRow.negative) {
      rootCause = {
        key: 'investorReturnNet',
        message: 'Tax Rate is high enough to make Investor Return (Net) negative, even though Investor Return (Gross) is positive.',
        scope: 'investor',
      };
    }
  }

  return { shared, myTeam, investor, rootCause };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test calc.test.mjs`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add calc.js calc.test.mjs
git commit -m "Restructure calc engine: tax borne only by investor, shared/myTeam/investor row groups"
```

---

### Task 2: Tab markup and styling

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Produces DOM elements consumed by Task 3's `script.js`: `sharedBreakdown`,
  `myTeamBreakdown`, `investorBreakdown` (containers), `tabMyTeam`,
  `tabInvestor` (buttons), `resultLabel`, `resultValue` (replacing the old
  `monthlyPayoutValue` id).
- Produces CSS classes consumed by Task 3: `tab`, `tab--active`.

- [ ] **Step 1: Replace the breakdown/result section of `index.html`**

Find this block (from the previous version of the page):

```html
    <section class="card card--breakdown">
      <h2 class="card__heading">Breakdown</h2>
      <div class="breakdown" id="breakdown"></div>
    </section>

    <section class="card card--result" id="resultCard">
      <span class="result__label">MY Team Monthly Payout</span>
      <span class="result__value" id="monthlyPayoutValue">RM 0.00</span>
    </section>
```

Replace it with:

```html
    <section class="card card--breakdown">
      <h2 class="card__heading">Breakdown</h2>
      <div class="breakdown" id="sharedBreakdown"></div>

      <div class="tabs" role="tablist">
        <button type="button" class="tab tab--active" id="tabMyTeam" role="tab" aria-selected="true">MY Team</button>
        <button type="button" class="tab" id="tabInvestor" role="tab" aria-selected="false">Investor</button>
      </div>

      <div class="breakdown" id="myTeamBreakdown"></div>
      <div class="breakdown" id="investorBreakdown" hidden></div>
    </section>

    <section class="card card--result" id="resultCard">
      <span class="result__label" id="resultLabel">MY Team Monthly Payout</span>
      <span class="result__value" id="resultValue">RM 0.00</span>
    </section>
```

- [ ] **Step 2: Add tab styles to `styles.css`**

Add this block anywhere after the `.card__heading` rule:

```css
.tabs {
  display: flex;
  gap: 8px;
  margin: 4px 0 16px;
  border-bottom: 1px solid var(--border);
}

.tab {
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 10px 4px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--text);
}

.tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
```

- [ ] **Step 3: Visually verify**

Open `index.html` in a browser. Confirm: a "Breakdown" card shows an empty
shared section, then two tab buttons ("MY Team" highlighted amber/active,
"Investor" dimmed), then an empty area below (script.js isn't updated yet,
so no rows render — that's expected at this step).

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Add tab markup and styling for MY Team / Investor breakdown views"
```

---

### Task 3: Wire up tab switching, rendering, and scoped warnings

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `calculate` from `calc.js` (Task 1) returning
  `{ shared, myTeam, investor, rootCause }`; DOM ids from Task 2.

- [ ] **Step 1: Replace `script.js`**

Replace the entire contents of `script.js` with:

```js
const inputIds = ['principal', 'monthlyRate', 'period', 'costOfFund', 'taxRate'];
const inputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(id)]));
const sharedBreakdownEl = document.getElementById('sharedBreakdown');
const myTeamBreakdownEl = document.getElementById('myTeamBreakdown');
const investorBreakdownEl = document.getElementById('investorBreakdown');
const tabMyTeamEl = document.getElementById('tabMyTeam');
const tabInvestorEl = document.getElementById('tabInvestor');
const resultCardEl = document.getElementById('resultCard');
const resultLabelEl = document.getElementById('resultLabel');
const resultValueEl = document.getElementById('resultValue');
const modalOverlay = document.getElementById('modalOverlay');
const modalMessage = document.getElementById('modalMessage');
const modalClose = document.getElementById('modalClose');

const HIDDEN_ROW_KEYS = new Set(['teamBAmount']);

let activeTab = 'myTeam';
let lastResult = null;
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

function renderRows(container, rows) {
  container.innerHTML = '';
  for (const row of rows) {
    if (HIDDEN_ROW_KEYS.has(row.key)) {
      continue;
    }
    const rowEl = document.createElement('div');
    rowEl.className = 'breakdown-row' + (row.negative ? ' breakdown-row--negative' : '');

    const labelEl = document.createElement('span');
    labelEl.className = 'breakdown-row__label';
    labelEl.textContent = row.label;

    const valuesEl = document.createElement('span');
    valuesEl.className = 'breakdown-row__values';
    valuesEl.textContent = row.ratio === undefined
      ? formatRM(row.amount)
      : `${formatPercent(row.ratio)} / ${formatRM(row.amount)}`;

    rowEl.append(labelEl, valuesEl);
    container.append(rowEl);
  }
}

function updateResultCard() {
  if (!lastResult) {
    return;
  }
  const row = activeTab === 'myTeam'
    ? lastResult.myTeam.find((r) => r.key === 'monthlyPayout')
    : lastResult.investor.find((r) => r.key === 'investorReturnNet');
  resultLabelEl.textContent = activeTab === 'myTeam' ? 'MY Team Monthly Payout' : 'Investor Return (Net)';
  resultValueEl.textContent = formatRM(row.amount);
  resultCardEl.classList.toggle('card--result-negative', row.negative);
}

function openModal(message) {
  modalMessage.textContent = message;
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

function maybeShowModal(hasAnyInput) {
  const rootCause = lastResult ? lastResult.rootCause : null;

  if (!hasAnyInput || !rootCause) {
    closeModal();
    shownRootCauseKey = null;
    return;
  }

  const isRelevantNow = rootCause.scope === 'shared' || activeTab === 'investor';

  if (!isRelevantNow) {
    closeModal();
    shownRootCauseKey = null;
    return;
  }

  if (rootCause.key !== shownRootCauseKey) {
    openModal(rootCause.message);
    shownRootCauseKey = rootCause.key;
  }
}

function hasAnyInputValue() {
  return inputIds.some((id) => inputs[id].value !== '');
}

function setActiveTab(tab) {
  activeTab = tab;
  tabMyTeamEl.classList.toggle('tab--active', tab === 'myTeam');
  tabInvestorEl.classList.toggle('tab--active', tab === 'investor');
  tabMyTeamEl.setAttribute('aria-selected', String(tab === 'myTeam'));
  tabInvestorEl.setAttribute('aria-selected', String(tab === 'investor'));
  myTeamBreakdownEl.hidden = tab !== 'myTeam';
  investorBreakdownEl.hidden = tab !== 'investor';
  updateResultCard();
  maybeShowModal(hasAnyInputValue());
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

  lastResult = calculate(values);

  renderRows(sharedBreakdownEl, lastResult.shared);
  renderRows(myTeamBreakdownEl, lastResult.myTeam);
  renderRows(investorBreakdownEl, lastResult.investor);
  updateResultCard();
  maybeShowModal(hasAnyInputValue());
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

tabMyTeamEl.addEventListener('click', () => setActiveTab('myTeam'));
tabInvestorEl.addEventListener('click', () => setActiveTab('investor'));

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

recalculate();
```

- [ ] **Step 2: Manually verify with a headless browser**

Using the project's existing headless-Chrome verification approach (a
throwaway, isolated `--user-data-dir` profile — never the user's real Chrome
profile, and always killed by its specific PID afterward, not `taskkill
/IM`), open `index.html` and drive these scenarios via CDP
`Runtime.evaluate`, setting each input's `.value` and dispatching an
`input` event, then reading back `#sharedBreakdown`, `#myTeamBreakdown`,
`#investorBreakdown`, `#resultLabel`/`#resultValue`, and
`#modalOverlay`'s `hidden` state:

| Case | inputs | Expect |
|---|---|---|
| All positive | principal=100000, monthlyRate=5, period=12, costOfFund=3, taxRate=20 | MY Team tab active by default; `#resultValue` = `RM 350.00`; no modal |
| Switch to Investor tab | (same inputs) | `#resultLabel` = "Investor Return (Net)", `#resultValue` = `RM 22,400.00`; no modal (nothing negative) |
| Shared cause | monthlyRate=2, period=6, costOfFund=20, taxRate=20 | Modal opens immediately (before touching tabs) mentioning Cost of Fund; MY Team tab shows red rows |
| Investor-only cause, on MY Team tab | monthlyRate=5, period=12, costOfFund=3, taxRate=150 | No modal while MY Team tab active; MY Team rows stay non-red; `#resultValue` = `RM 350.00` |
| Investor-only cause, switch to Investor tab | (same as above, then click `#tabInvestor`) | Modal opens now, mentioning Tax Rate; Investor Return (Net) row is red; `#resultValue` = `RM -14,000.00` |

Confirm each row of the table matches before moving on. If any mismatch,
re-check `calc.js`'s row keys against `script.js`'s `find((r) => r.key === ...)`
calls — a typo'd key is the most likely cause of a blank result.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Wire up MY Team / Investor tabs with scoped negative-value warnings"
```

**Checkpoint:** Confirm with the user that the tab behavior (default tab,
scoped warnings, result card swapping) matches what they asked for before
deploying.

---

### Task 4: Deploy

**Files:** none (repo operations only)

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Ask the user before pushing**

This project's established workflow (see prior sessions) is to ask for
explicit confirmation before every push, since it updates the live public
GitHub Pages site. Ask, then:

```bash
git push
```

- [ ] **Step 3: Verify the live deployment**

```bash
for i in $(seq 1 10); do
  if curl -s https://tendo9001.github.io/PSCalculator/calc.js | grep -q "investorReturnNet"; then
    echo "deployed"
    break
  fi
  sleep 10
done
```
Expected: prints `deployed` within the loop.

## Self-Review Notes

- Spec coverage: calculation restructuring (Task 1), shared/tab UI (Task 2),
  tab-switching + scoped warnings + result card swap (Task 3), and
  deployment (Task 4) each map to the spec's corresponding sections. The
  spec's "Out of scope" note (Principal formatting, PWA files, deploy
  process untouched) is respected — Task 3 reuses the existing Principal
  formatting functions verbatim rather than changing them.
- No placeholders: every step has literal file contents, exact commands, or
  a concrete verification table with computed expected values.
- Type/key consistency checked: `calc.js`'s row keys (`annualRate`,
  `balanceInterest`, `afterTakaful`, `teamAReturn`, `teamAInterest`,
  `teamBInterest`, `teamBAmount`, `perHeadAmount`, `monthlyPayout`,
  `investorReturnGross`, `tax`, `investorReturnNet`) match exactly between
  Task 1's tests, Task 3's `script.js` lookups, and the plan's verification
  table.
