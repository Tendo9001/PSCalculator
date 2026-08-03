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
const warningBannerEl = document.getElementById('warningBanner');
const warningMessageEl = document.getElementById('warningMessage');

const DEAL_TERM_IDS = ['principal', 'monthlyRate', 'period', 'costOfFund'];
const RATE_LABELS = {
  insuranceRate: 'Insurance Rate',
  investorReturnRate: 'Investor Return',
  joRate: 'JO Rate',
};
const DEDUCTION_ROW_KEYS = new Set(['tax']);

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
    const isRed = row.negative || DEDUCTION_ROW_KEYS.has(row.key);
    rowEl.className = 'breakdown-row' + (isRed ? ' breakdown-row--negative' : '');

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

function showWarning(message) {
  warningMessageEl.textContent = message;
  warningBannerEl.hidden = false;
}

function hideWarning() {
  warningBannerEl.hidden = true;
}

function hasAnyInputValue() {
  return inputIds.some((id) => inputs[id].value !== '');
}

function getMissingRateWarning() {
  const hasStartedDealTerms = DEAL_TERM_IDS.some((id) => inputs[id].value !== '');
  if (!hasStartedDealTerms) {
    return null;
  }

  const missingLabels = Object.keys(RATE_LABELS).filter((id) => inputs[id].value === '').map((id) => RATE_LABELS[id]);
  if (missingLabels.length === 0) {
    return null;
  }

  const subject = missingLabels.length > 1 ? 'they are' : 'it is';
  return `Fill in ${missingLabels.join(', ')} to get an accurate result — until then ${subject} treated as 0%.`;
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

  const missingRateWarning = getMissingRateWarning();
  const hasAnyInput = hasAnyInputValue();

  if (missingRateWarning) {
    showWarning(missingRateWarning);
  } else if (hasAnyInput && result.rootCause) {
    showWarning(result.rootCause.message);
  } else {
    hideWarning();
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

recalculate();
