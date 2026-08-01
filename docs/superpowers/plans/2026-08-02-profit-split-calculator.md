# Profit Split Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, framework-free PWA that live-computes a profit-split
calculation chain from 4 user inputs and deploy it to GitHub Pages.

**Architecture:** A pure calculation module (`calc.mjs`) with no DOM
dependency, unit-tested with Node's built-in test runner. A static
`index.html`/`styles.css` shell. A DOM-wiring `script.js` that imports the
calc module and re-renders on every keystroke. A one-time local Python script
generates the two PWA icon PNGs (not shipped as a runtime dependency).
Finally, the whole thing is pushed to a new public GitHub repo with Pages
enabled.

**Tech Stack:** Plain HTML/CSS/JavaScript (ES modules), Node's built-in
`node:test` runner for testing `calc.mjs` only, Python + Pillow as a one-time
local dev tool for icon generation, `gh` CLI for repo creation and Pages
setup.

## Global Constraints

- Plain HTML + CSS + JS only — no frameworks, no bundler, no build step, no
  npm dependencies shipped to the browser.
- No database, no `localStorage`, no service worker, no login/auth.
- Constants are hardcoded in `calc.mjs` only: `takaful = 1`, `sjRatio = 0.4`,
  `myRatio = 0.6`, `investorSplit = 0.5`, `myTeamCount = 4`. These raw numbers
  (and any "40/60", "÷4"-style explanation) must never appear as literal text
  anywhere in the UI — only the *computed results* are shown.
- `ratio` values throughout are percentage numbers (e.g. `60` means 60%), so
  any RM amount derived from a ratio is `principal * ratio / 100`.
- UI row labels are the generic set decided with the user: Annual Rate,
  Balance Interest, After Takaful, Investor Return, Team A Return, Team A
  Interest, Team B Interest, Team B Amount, Per-Head Amount, Monthly Payout.
  No "demo" text, no debug text.
- All RM amounts are formatted with thousands separators, an `RM ` prefix,
  and exactly 2 decimal places (e.g. `RM 31,250.00`).
- Visual theme: background `#0b0d0c`, accent `#d9a441`, monospace font for
  all numeric values, dark "trading terminal" look.
- Calculation is live (recalculates on every keystroke) — no submit button.
- Negative rows render in red. The first ratio variable that goes negative,
  in formula order, is the "root cause" and triggers a custom dark-themed
  modal (not native `alert()`) naming that row.
- Repo name: `PSCalculator`, public, under the already-authenticated `gh`
  account `Tendo9001`. GitHub Pages served from the `main` branch, root
  (`/`) directory.
- Pause and confirm with the user at these milestones rather than continuing
  straight through: after Task 1 (calc logic done), after Task 4 (interactive
  UI done), after repo creation in Task 6, and after Pages is confirmed live
  in Task 6.

---

### Task 1: Calculation engine

**Files:**
- Create: `calc.mjs`
- Test: `calc.test.mjs`

**Interfaces:**
- Produces: `calculate({ principal, monthlyRate, period, costOfFund })` →
  `{ rows, rootCauseKey, rootCauseMessage }` where each entry in `rows` is
  `{ key, label, ratio?, amount, negative }`. `ratio` is present on the first
  7 rows (`annualRate`, `balanceInterest`, `afterTakaful`, `investorReturn`,
  `teamAReturn`, `teamAInterest`, `teamBInterest`) and absent on the last 3
  (`teamBAmount`, `perHeadAmount`, `monthlyPayout`), which are RM-only.
  `rootCauseKey` is one of `'annualRate' | 'balanceInterest' | 'afterTakaful' | null`.

- [ ] **Step 1: Write the failing tests**

Create `calc.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.mjs';

function findRow(result, key) {
  const row = result.rows.find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

test('all-positive chain computes exact values and has no root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3 });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterTakaful').ratio, 56);
  assert.equal(findRow(result, 'investorReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAInterest').ratio, 11.2);
  assert.equal(findRow(result, 'teamBInterest').ratio, 16.8);
  assert.equal(findRow(result, 'teamBAmount').amount, 16800);
  assert.equal(findRow(result, 'perHeadAmount').amount, 4200);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);
  assert.equal(result.rootCauseKey, null);
  assert.equal(result.rows.every((r) => r.negative === false), true);
});

test('cost of fund exceeding annual rate flags balanceInterest as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(findRow(result, 'monthlyPayout').amount, -56.25);
  assert.equal(result.rootCauseKey, 'balanceInterest');
  assert.match(result.rootCauseMessage, /Cost of Fund/);
});

test('negative monthly rate flags annualRate as the root cause even though later rows are also negative', () => {
  const result = calculate({ principal: 100000, monthlyRate: -5, period: 12, costOfFund: 3 });

  assert.equal(findRow(result, 'annualRate').ratio, -60);
  assert.equal(findRow(result, 'balanceInterest').ratio, -63);
  assert.equal(result.rootCauseKey, 'annualRate');
});

test('a small positive balance that cannot cover the Takaful deduction flags afterTakaful as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 1, period: 1, costOfFund: 0.5 });

  assert.equal(findRow(result, 'balanceInterest').ratio, 0.5);
  assert.equal(findRow(result, 'balanceInterest').negative, false);
  assert.equal(findRow(result, 'afterTakaful').ratio, -0.5);
  assert.equal(findRow(result, 'monthlyPayout').amount, -3.125);
  assert.equal(result.rootCauseKey, 'afterTakaful');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test calc.test.mjs`
Expected: FAIL — `calc.mjs` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `calc.mjs`:

```js
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
    key: 'afterTakaful',
    message: 'Balance Interest is too low to cover the After Takaful deduction, causing it to go negative.',
  },
];

export function calculate({ principal, monthlyRate, period, costOfFund }) {
  const annualRate = monthlyRate * period;
  const balanceInterest = annualRate - costOfFund;
  const afterTakaful = balanceInterest - CONSTANTS.takaful;
  const investorReturn = afterTakaful * CONSTANTS.investorSplit;
  const teamAReturn = afterTakaful - investorReturn;
  const teamAInterest = teamAReturn * CONSTANTS.sjRatio;
  const teamBInterest = teamAReturn * CONSTANTS.myRatio;
  const teamBAmount = principal * (teamBInterest / 100);
  const perHeadAmount = teamBAmount / CONSTANTS.myTeamCount;
  const monthlyPayout = perHeadAmount / 12;

  const ratioRows = [
    { key: 'annualRate', label: 'Annual Rate', ratio: annualRate },
    { key: 'balanceInterest', label: 'Balance Interest', ratio: balanceInterest },
    { key: 'afterTakaful', label: 'After Takaful', ratio: afterTakaful },
    { key: 'investorReturn', label: 'Investor Return', ratio: investorReturn },
    { key: 'teamAReturn', label: 'Team A Return', ratio: teamAReturn },
    { key: 'teamAInterest', label: 'Team A Interest', ratio: teamAInterest },
    { key: 'teamBInterest', label: 'Team B Interest', ratio: teamBInterest },
  ].map((row) => ({
    ...row,
    ratio: round(row.ratio),
    amount: round(principal * (row.ratio / 100)),
    negative: row.ratio < 0,
  }));

  const amountRows = [
    { key: 'teamBAmount', label: 'Team B Amount', amount: round(teamBAmount) },
    { key: 'perHeadAmount', label: 'Per-Head Amount', amount: round(perHeadAmount) },
    { key: 'monthlyPayout', label: 'Monthly Payout', amount: round(monthlyPayout) },
  ].map((row) => ({ ...row, negative: row.amount < 0 }));

  const rows = [...ratioRows, ...amountRows];

  let rootCauseKey = null;
  let rootCauseMessage = null;
  for (const candidate of ROOT_CAUSE_ORDER) {
    const row = ratioRows.find((r) => r.key === candidate.key);
    if (row.negative) {
      rootCauseKey = candidate.key;
      rootCauseMessage = candidate.message;
      break;
    }
  }

  return { rows, rootCauseKey, rootCauseMessage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test calc.test.mjs`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add calc.mjs calc.test.mjs
git commit -m "Add profit-split calculation engine with tests"
```

**Checkpoint:** This is the "calculation logic done" milestone — confirm with
the user before continuing to Task 2/3.

---

### Task 2: PWA icons

**Files:**
- Create: `scripts/generate_icons.py`
- Output (generated, then committed): `icons/icon-192.png`, `icons/icon-512.png`

**Interfaces:**
- Produces: two PNG files at `icons/icon-192.png` (192x192) and
  `icons/icon-512.png` (512x512), consumed by Task 5's `manifest.json` and
  `<head>` tags.

- [ ] **Step 1: Install Pillow (one-time local dev tool, not shipped)**

Run: `pip install Pillow`
Expected: install succeeds (already confirmed with the user).

- [ ] **Step 2: Write the icon-generation script**

Create `scripts/generate_icons.py`:

```python
import os
from PIL import Image, ImageDraw, ImageFont

BG_COLOR = "#0b0d0c"
FG_COLOR = "#d9a441"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/Arial Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_icon(size, path):
    img = Image.new("RGB", (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)
    font = load_font(int(size * 0.55))
    text = "%"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    draw.text((x, y), text, fill=FG_COLOR, font=font)
    img.save(path, "PNG")


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    make_icon(192, os.path.join(OUTPUT_DIR, "icon-192.png"))
    make_icon(512, os.path.join(OUTPUT_DIR, "icon-512.png"))
    print("Icons written to", OUTPUT_DIR)
```

- [ ] **Step 3: Run the script**

Run: `python scripts/generate_icons.py`
Expected: prints `Icons written to ...icons` and creates the two PNG files.

- [ ] **Step 4: Verify dimensions**

Run:
```bash
python -c "from PIL import Image; print(Image.open('icons/icon-192.png').size); print(Image.open('icons/icon-512.png').size)"
```
Expected: `(192, 192)` then `(512, 512)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_icons.py icons/icon-192.png icons/icon-512.png
git commit -m "Generate PWA icons"
```

---

### Task 3: Static page shell (HTML + CSS)

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Produces DOM elements with these exact IDs, consumed by Task 4's
  `script.js`: `principal`, `monthlyRate`, `period`, `costOfFund`,
  `breakdown` (empty container), `monthlyPayoutValue`, `resultCard`,
  `modalOverlay`, `modalMessage`, `modalClose`.
- Produces CSS classes consumed by Task 4: `breakdown-row`,
  `breakdown-row__label`, `breakdown-row__values`,
  `breakdown-row--negative`, `card--result-negative`.

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Profit Split Calculator</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="app">
    <h1 class="app__title">Profit Split Calculator</h1>

    <section class="card card--inputs">
      <div class="field">
        <label for="principal">Principal (RM)</label>
        <input type="number" id="principal" inputmode="decimal" step="any" placeholder="0.00" />
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

    <section class="card card--breakdown">
      <h2 class="card__heading">Breakdown</h2>
      <div class="breakdown" id="breakdown"></div>
    </section>

    <section class="card card--result" id="resultCard">
      <span class="result__label">Monthly Payout</span>
      <span class="result__value" id="monthlyPayoutValue">RM 0.00</span>
    </section>
  </main>

  <div class="modal-overlay" id="modalOverlay" hidden>
    <div class="modal" role="alertdialog" aria-live="assertive">
      <h3 class="modal__title">Check your numbers</h3>
      <p class="modal__message" id="modalMessage"></p>
      <button type="button" class="modal__close" id="modalClose">Close</button>
    </div>
  </div>

  <script type="module" src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
:root {
  --bg: #0b0d0c;
  --panel: #14171a;
  --accent: #d9a441;
  --text: #e8e6e1;
  --text-dim: #9a9691;
  --danger: #e05252;
  --border: #2a2d2a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.app {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 64px;
}

.app__title {
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
  margin-bottom: 20px;
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.card__heading {
  margin: 0 0 16px;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.card--inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.field input {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 1rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  width: 100%;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.breakdown-row:last-child {
  border-bottom: none;
}

.breakdown-row__label {
  color: var(--text-dim);
  font-size: 0.85rem;
}

.breakdown-row__values {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  text-align: right;
}

.breakdown-row--negative .breakdown-row__label,
.breakdown-row--negative .breakdown-row__values {
  color: var(--danger);
}

.card--result {
  border-color: var(--accent);
  text-align: center;
  padding: 28px 20px;
}

.card--result-negative {
  border-color: var(--danger);
}

.result__label {
  display: block;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.result__value {
  display: block;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--accent);
}

.card--result-negative .result__value {
  color: var(--danger);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-overlay[hidden] {
  display: none;
}

.modal {
  background: var(--panel);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 24px;
  max-width: 380px;
  width: 100%;
}

.modal__title {
  margin: 0 0 12px;
  color: var(--accent);
}

.modal__message {
  margin: 0 0 20px;
  color: var(--text);
  line-height: 1.5;
}

.modal__close {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}

@media (max-width: 480px) {
  .card--inputs {
    grid-template-columns: 1fr;
  }

  .result__value {
    font-size: 1.9rem;
  }
}
```

- [ ] **Step 3: Visually verify**

Open `index.html` directly in a browser (double-click, or `start index.html`
on Windows). Confirm: dark background, amber title/accents, the 4 inputs
render in a 2-column grid on desktop, the breakdown card is present but
empty, the Monthly Payout card is visually distinct with a large amber
number. Resize the window narrow (or use device toolbar) and confirm inputs
stack to a single column.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Add static page shell with dark ledger theme"
```

---

### Task 4: Wire up live calculation

**Files:**
- Create: `script.js`

**Interfaces:**
- Consumes: `calculate` from `./calc.mjs` (Task 1); DOM element IDs and CSS
  classes from Task 3.
- Produces: a fully interactive page — no further tasks depend on this one's
  internals.

- [ ] **Step 1: Write `script.js`**

```js
import { calculate } from './calc.mjs';

const inputIds = ['principal', 'monthlyRate', 'period', 'costOfFund'];
const inputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(id)]));
const breakdownEl = document.getElementById('breakdown');
const resultCardEl = document.getElementById('resultCard');
const monthlyPayoutEl = document.getElementById('monthlyPayoutValue');
const modalOverlay = document.getElementById('modalOverlay');
const modalMessage = document.getElementById('modalMessage');
const modalClose = document.getElementById('modalClose');

let lastRootCauseKey = null;

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
    valuesEl.textContent = row.ratio === undefined
      ? formatRM(row.amount)
      : `${formatPercent(row.ratio)} / ${formatRM(row.amount)}`;

    rowEl.append(labelEl, valuesEl);
    breakdownEl.append(rowEl);
  }
}

function openModal(message) {
  modalMessage.textContent = message;
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

function readInputs() {
  const values = {};
  for (const id of inputIds) {
    const raw = inputs[id].value;
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

  const payoutRow = result.rows.find((row) => row.key === 'monthlyPayout');
  monthlyPayoutEl.textContent = formatRM(payoutRow.amount);
  resultCardEl.classList.toggle('card--result-negative', payoutRow.negative);

  if (result.rootCauseKey && result.rootCauseKey !== lastRootCauseKey) {
    openModal(result.rootCauseMessage);
  }
  lastRootCauseKey = result.rootCauseKey;
}

inputIds.forEach((id) => inputs[id].addEventListener('input', recalculate));
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

recalculate();
```

Note: the modal only re-opens when the root cause *changes* (e.g. from none
to `balanceInterest`, or from `balanceInterest` to `annualRate`) — not on
every keystroke while the same row stays negative. This avoids the modal
popping repeatedly while the user is still typing.

- [ ] **Step 2: Manually verify against the same 4 cases used in Task 1's tests**

Open `index.html` in a browser and type each case's inputs, confirming the
displayed breakdown and Monthly Payout match:

| Case | principal | monthlyRate | period | costOfFund | Monthly Payout shown | Modal? |
|---|---|---|---|---|---|---|
| A | 100000 | 5 | 12 | 3 | `RM 350.00` | No |
| B | 100000 | 2 | 6 | 20 | `RM -56.25` | Yes — mentions Cost of Fund |
| C | 100000 | -5 | 12 | 3 | `RM -400.00` | Yes — mentions Annual Rate |
| D | 100000 | 1 | 1 | 0.5 | `RM -3.13` (rounded display) | Yes — mentions After Takaful |

Also confirm: in case B/C/D, the rows from the root cause onward render in
red text; rows before the root cause stay normal-colored.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Wire up live calculation and negative-value modal"
```

**Checkpoint:** This is the "UI done" milestone — confirm with the user
before continuing to Task 5.

---

### Task 5: PWA manifest and meta tags

**Files:**
- Create: `manifest.json`
- Modify: `index.html` (`<head>`)

**Interfaces:**
- Consumes: `icons/icon-192.png`, `icons/icon-512.png` from Task 2.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "name": "Profit Split Calculator",
  "short_name": "Split Calc",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0b0d0c",
  "theme_color": "#0b0d0c",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Add PWA tags to `index.html`'s `<head>`**

In `index.html`, replace:

```html
  <link rel="stylesheet" href="styles.css" />
</head>
```

with:

```html
  <link rel="stylesheet" href="styles.css" />
  <link rel="manifest" href="manifest.json" />
  <link rel="apple-touch-icon" href="icons/icon-192.png" />
  <meta name="theme-color" content="#0b0d0c" />
</head>
```

- [ ] **Step 3: Verify**

Run: `python -m json.tool manifest.json`
Expected: pretty-printed JSON with no error (confirms valid JSON).

Run: `grep -c "manifest\|apple-touch-icon\|theme-color" index.html`
Expected: `3` (or more) — confirms all three tags are present.

- [ ] **Step 4: Commit**

```bash
git add manifest.json index.html
git commit -m "Add PWA manifest and head meta tags"
```

---

### Task 6: Deploy to GitHub Pages

**Files:** none (repo operations only)

- [ ] **Step 1: Push everything so far, if anything is uncommitted**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (all prior tasks already
committed).

- [ ] **Step 2: Create the GitHub repo and push**

```bash
gh repo create PSCalculator --public --source=. --remote=origin --push
```
Expected: repo created at `https://github.com/Tendo9001/PSCalculator`,
`main` branch pushed.

**Checkpoint:** This is the "repo created" milestone — confirm with the user
before enabling Pages.

- [ ] **Step 3: Enable GitHub Pages from `main` branch root**

```bash
gh api -X POST repos/Tendo9001/PSCalculator/pages -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/"
```
Expected: JSON response describing the new Pages site, `status` field
present (may be `null`/`building` initially).

If this API call fails (e.g. because Pages was already enabled or the API
shape changed), fall back to the GitHub web UI: repo → Settings → Pages →
Source: Deploy from a branch → Branch: `main` / `/(root)` → Save.

- [ ] **Step 4: Wait for the build and verify the site is live**

Run (retry every ~20s for up to a few minutes until it returns `200`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tendo9001.github.io/PSCalculator/
```
Expected: `200`.

- [ ] **Step 5: Report the final URL to the user**

`https://tendo9001.github.io/PSCalculator/`

**Checkpoint:** This is the "deployed" milestone — confirm with the user that
the live site works as expected (test on their own phone/browser too, since
this is where PWA "Add to Home Screen" behavior can only be verified on a
real device).

---

## Self-Review Notes

- Spec coverage: all spec sections (inputs, constants, calculation chain,
  negative handling, row labels, visual design, PWA requirements, deployment)
  each map to a task above.
- No placeholders: every step has literal file contents or literal commands.
- Type/name consistency checked: `calc.mjs`'s row `key`s (`annualRate`,
  `balanceInterest`, `afterTakaful`, `investorReturn`, `teamAReturn`,
  `teamAInterest`, `teamBInterest`, `teamBAmount`, `perHeadAmount`,
  `monthlyPayout`) are the same strings used in `script.js`'s
  `renderRows`/`find` calls and in the manual verification table.
