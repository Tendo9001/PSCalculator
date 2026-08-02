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

function calculate({ principal, monthlyRate, period, costOfFund }) {
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
    { key: 'teamAReturn', label: 'SJ-Team Return', ratio: teamAReturn },
    { key: 'teamAInterest', label: 'SJ-Team Interest', ratio: teamAInterest },
    { key: 'teamBInterest', label: 'MY Interest', ratio: teamBInterest },
  ].map((row) => ({
    ...row,
    ratio: round(row.ratio),
    amount: round(principal * (row.ratio / 100)),
    negative: row.ratio < 0,
  }));

  const amountRows = [
    { key: 'teamBAmount', label: 'Team B Amount', amount: round(teamBAmount) },
    { key: 'perHeadAmount', label: 'MY Team', amount: round(perHeadAmount) },
    { key: 'monthlyPayout', label: 'MY Team Monthly Payout', amount: round(monthlyPayout) },
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate };
}
