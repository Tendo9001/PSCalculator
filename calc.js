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
    key: 'investorReturn',
    message: 'Tax Rate is high enough to make Investor Return negative — the Investor bears the full cost of Tax, even though After Insurance and SJ Team Return are positive.',
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
  const tax = afterInsurance * (taxRate / 100);
  const pat = afterInsurance - tax;

  // SJ Team's cut is fixed from the pre-tax After Insurance pool, so it never moves
  // when Tax Rate changes. Investor Return is whatever's left of PAT after that
  // fixed cut is paid out — so the Investor alone absorbs the full impact of Tax.
  const sjTeamReturn = afterInsurance * (1 - investorReturnRate / 100);
  const investorReturn = pat - sjTeamReturn;

  const sjInterest = sjTeamReturn * (1 - joRate / 100);
  const joTeam = sjTeamReturn * (joRate / 100);

  const rows = [
    toRatioRow('annualRate', 'Annual Rate', annualRate, principal),
    toRatioRow('balanceInterest', 'Balance Interest', balanceInterest, principal),
    toRatioRow('afterInsurance', 'After Insurance', afterInsurance, principal),
    toRatioRow('tax', 'Tax', tax, principal),
    toRatioRow('pat', 'PAT', pat, principal),
    toRatioRow('investorReturn', 'Investor Return', investorReturn, principal),
    toRatioRow('sjTeamReturn', 'SJ Team Return', sjTeamReturn, principal),
    toRatioRow('sjInterest', 'SJ Interest', sjInterest, principal),
    toRatioRow('joTeam', 'JO Team', joTeam, principal),
  ];

  const joTeamAmount = rows.find((r) => r.key === 'joTeam').amount;
  // "JO Member (after plug)" (joTeamAmount / myTeamCount) is intentionally left out of
  // the Payout Summary for now — the owner asked to drop it (2026-08-05) but may want it
  // back later. Uncomment the line below (and its payoutSummary entry) to restore it.
  // const joMemberYearly = joTeamAmount / CONSTANTS.myTeamCount;

  const payoutSummary = [
    toPayoutRow('investor', 'Investor', rows.find((r) => r.key === 'investorReturn').amount),
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
