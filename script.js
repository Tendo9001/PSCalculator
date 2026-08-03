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
