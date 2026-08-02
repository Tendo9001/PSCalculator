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
