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

const HIDDEN_ROW_KEYS = new Set(['teamBAmount']);

function renderRows(rows) {
  breakdownEl.innerHTML = '';
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
    const raw = inputs[id].value.replace(/,/g, '');
    values[id] = raw === '' ? 0 : Number(raw);
  }
  return values;
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
  // Count digits + decimal point (the characters we never delete) before the
  // cursor, so the cursor lands after the digit/dot the user just typed,
  // not just after the same *count* of digits alone.
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

  const hasAnyInput = inputIds.some((id) => inputs[id].value !== '');

  if (hasAnyInput && result.rootCauseKey && result.rootCauseKey !== lastRootCauseKey) {
    openModal(result.rootCauseMessage);
  } else if (!hasAnyInput || !result.rootCauseKey) {
    closeModal();
  }
  lastRootCauseKey = result.rootCauseKey;
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
