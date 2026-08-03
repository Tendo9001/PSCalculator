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
    toRatioRow('tax', 'Tax', tax, principal),
    toRatioRow('investorReturnGross', 'Investor Return (Gross)', investorReturnGross, principal),
    toRatioRow('sjTeamReturn', 'SJ Team Return', sjTeamReturn, principal),
    toRatioRow('investorReturnNet', 'Investor Return (Net)', investorReturnNet, principal),
    toRatioRow('sjInterest', 'SJ Interest', sjInterest, principal),
    toRatioRow('joTeam', 'JO Team', joTeam, principal),
  ];

  const joTeamAmount = rows.find((r) => r.key === 'joTeam').amount;
  // "JO Member (after plug)" (joTeamAmount / myTeamCount) is intentionally left out of
  // the Payout Summary for now — the owner asked to drop it (2026-08-05) but may want it
  // back later. Uncomment the line below (and its payoutSummary entry) to restore it.
  // const joMemberYearly = joTeamAmount / CONSTANTS.myTeamCount;

  const payoutSummary = [
    toPayoutRow('investor', 'Investor', rows.find((r) => r.key === 'investorReturnNet').amount),
    toPayoutRow('sj', 'SJ', rows.find((r) => r.key === 'sjTeamReturn').amount),
    toPayoutRow('sjMember', 'SJ Member', rows.find((r) => r.key === 'sjInterest').amount),
    toPayoutRow('jo', 'JO', joTeamAmount),
    // toPayoutRow('joMember', 'JO Member (after plug)', joMemberYearly),
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
