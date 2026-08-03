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

test('all-positive chain: PAT-based split, tax reduces everyone proportionally', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'pat').ratio, 44.8);
  assert.equal(findRow(result, 'investorReturn').ratio, 22.4);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 22.4);
  assert.equal(findRow(result, 'sjInterest').ratio, 8.96);
  assert.equal(findRow(result, 'joTeam').ratio, 13.44);

  assert.deepEqual(result.rows.map((r) => r.key), [
    'annualRate', 'balanceInterest', 'afterInsurance', 'tax', 'pat',
    'investorReturn', 'sjTeamReturn', 'sjInterest', 'joTeam',
  ]);
  assert.deepEqual(result.rows.map((r) => r.label), [
    'Annual Rate', 'Balance Interest', 'After Insurance', 'Tax', 'PAT',
    'Investor Return', 'SJ Team Return', 'SJ Interest', 'JO Team',
  ]);

  assert.equal(findSummary(result, 'investor').yearly, 22400);
  assert.equal(findSummary(result, 'sj').yearly, 22400);
  assert.equal(findSummary(result, 'sjMember').yearly, 8960);
  assert.equal(findSummary(result, 'jo').yearly, 13440);
  assert.deepEqual(result.payoutSummary.map((r) => r.key), ['investor', 'sj', 'sjMember', 'jo']);
  assert.deepEqual(result.payoutSummary.map((r) => r.label), ['Investor', 'SJ', 'SJ Member', 'JO']);

  assert.equal(result.rootCause, null);
});

test('Insurance Rate is a live input, not a hardcoded constant', () => {
  const withDefault = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });
  const withHigherInsurance = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES, insuranceRate: 2 });

  assert.equal(findRow(withDefault, 'afterInsurance').ratio, 56);
  assert.equal(findRow(withHigherInsurance, 'afterInsurance').ratio, 55);
});

test('Investor Return / JO Rate auto-complements still produce the correct split from PAT', () => {
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
  assert.equal(findRow(result, 'investorReturn').ratio, 39.2);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 16.8);
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

test('a tax rate over 100% flips PAT negative even though After Insurance is positive, reducing everyone', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, insuranceRate: 1, taxRate: 150, investorReturnRate: 50, joRate: 60 });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'afterInsurance').negative, false);
  assert.equal(findRow(result, 'tax').ratio, 84);
  assert.equal(findRow(result, 'pat').ratio, -28);
  assert.equal(findRow(result, 'investorReturn').ratio, -14);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, -14);
  assert.equal(findRow(result, 'sjTeamReturn').negative, true);

  assert.equal(result.rootCause.key, 'pat');
  assert.match(result.rootCause.message, /Tax Rate/);
});
