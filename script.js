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

  const hasAnyInput = inputIds.some((id) => inputs[id].value !== '');

  if (hasAnyInput && result.rootCauseKey && result.rootCauseKey !== lastRootCauseKey) {
    openModal(result.rootCauseMessage);
  } else if (!hasAnyInput || !result.rootCauseKey) {
    closeModal();
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
