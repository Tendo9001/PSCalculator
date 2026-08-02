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
