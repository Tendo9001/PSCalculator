import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.js';

function findRow(result, key) {
  const row = result.rows.find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

function findSummary(result, key) {
  const row = result.payoutSummary.find((r) => r.key === key);
  assert.ok(row, `expected a payout summary row with key "${key}"`);
  return row;
}

const DEFAULT_RATES = { insuranceRate: 1, taxRate: 20, investorReturnRate: 50, joRate: 60 };

test('all-positive chain: PAT is shown, but SJ Team is fixed from pre-tax After Insurance and Investor absorbs all of Tax', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'pat').ratio, 44.8);
  assert.equal(findRow(result, 'investorReturn').ratio, 16.8);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'sjInterest').ratio, 11.2);
  assert.equal(findRow(result, 'joTeam').ratio, 16.8);

  assert.deepEqual(result.rows.map((r) => r.key), [
    'annualRate', 'balanceInterest', 'afterInsurance', 'tax', 'pat',
    'investorReturn', 'sjTeamReturn', 'sjInterest', 'joTeam',
  ]);
  assert.deepEqual(result.rows.map((r) => r.label), [
    'Annual Rate', 'Balance Interest', 'After Insurance', 'Tax', 'PAT',
    'Investor Return', 'SJ Team Return', 'SJ Interest', 'JO Team',
  ]);

  assert.equal(findSummary(result, 'investor').yearly, 16800);
  assert.equal(findSummary(result, 'sj').yearly, 28000);
  assert.equal(findSummary(result, 'sjMember').yearly, 11200);
  assert.equal(findSummary(result, 'jo').yearly, 16800);
  assert.deepEqual(result.payoutSummary.map((r) => r.key), ['investor', 'sj', 'sjMember', 'jo']);

  assert.equal(result.rootCause, null);
});

test('SJ Team / SJ Interest / JO Team are identical regardless of tax rate', () => {
  const base = { principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, insuranceRate: 1, investorReturnRate: 50, joRate: 60 };
  const withNoTax = calculate({ ...base, taxRate: 0 });
  const withHighTax = calculate({ ...base, taxRate: 90 });

  assert.equal(findRow(withNoTax, 'sjTeamReturn').ratio, findRow(withHighTax, 'sjTeamReturn').ratio);
  assert.equal(findRow(withNoTax, 'sjInterest').ratio, findRow(withHighTax, 'sjInterest').ratio);
  assert.equal(findRow(withNoTax, 'joTeam').ratio, findRow(withHighTax, 'joTeam').ratio);
});

test('Insurance Rate is a live input, not a hardcoded constant', () => {
  const withDefault = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });
  const withHigherInsurance = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES, insuranceRate: 2 });

  assert.equal(findRow(withDefault, 'afterInsurance').ratio, 56);
  assert.equal(findRow(withHigherInsurance, 'afterInsurance').ratio, 55);
});

test('Investor Return / JO Rate auto-complements produce the correct split with zero tax', () => {
  const result = calculate({
    principal: 100000,
    monthlyRate: 5,
    period: 12,
    costOfFund: 3,
    insuranceRate: 1,
    taxRate: 0,
    investorReturnRate: 70,
    joRate: 30,
  });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'pat').ratio, 56);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 16.8);
  assert.equal(findRow(result, 'investorReturn').ratio, 39.2);
  assert.equal(findRow(result, 'sjInterest').ratio, 11.76);
  assert.equal(findRow(result, 'joTeam').ratio, 5.04);
});

test('cost of fund exceeding annual rate flags balanceInterest as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(result.rootCause.key, 'balanceInterest');
  assert.match(result.rootCause.message, /Cost of Fund/);
});

test('a tax rate over 100% flips Investor Return negative while SJ Team Return stays positive', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, insuranceRate: 1, taxRate: 150, investorReturnRate: 50, joRate: 60 });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'afterInsurance').negative, false);
  assert.equal(findRow(result, 'tax').ratio, 84);
  assert.equal(findRow(result, 'pat').ratio, -28);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'sjTeamReturn').negative, false);
  assert.equal(findRow(result, 'investorReturn').ratio, -56);
  assert.equal(findRow(result, 'investorReturn').negative, true);

  assert.equal(result.rootCause.key, 'investorReturn');
  assert.match(result.rootCause.message, /Tax Rate/);
});
