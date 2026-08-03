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

test('all-positive chain at default rates matches the pre-adjustable-rates numbers', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 16.8);
  assert.equal(findRow(result, 'sjInterest').ratio, 11.2);
  assert.equal(findRow(result, 'joTeam').ratio, 16.8);

  assert.deepEqual(result.rows.map((r) => r.key), [
    'annualRate', 'balanceInterest', 'afterInsurance',
    'investorReturnGross', 'sjTeamReturn', 'tax', 'investorReturnNet',
    'sjInterest', 'joTeam',
  ]);

  assert.equal(findSummary(result, 'investor').yearly, 16800);
  assert.equal(findSummary(result, 'investor').monthly, 1400);
  assert.equal(findSummary(result, 'sj').yearly, 28000);
  assert.equal(findSummary(result, 'sjMember').yearly, 11200);
  assert.equal(findSummary(result, 'jo').yearly, 16800);
  assert.equal(findSummary(result, 'joMember').yearly, 4200);
  assert.equal(findSummary(result, 'joMember').monthly, 350);

  assert.deepEqual(result.payoutSummary.map((r) => r.key), ['investor', 'sj', 'sjMember', 'jo', 'joMember']);

  assert.deepEqual(result.rows.map((r) => r.label), [
    'Annual Rate', 'Balance Interest', 'After Insurance',
    'Investor Return (Gross)', 'SJ Team Return', 'Tax', 'Investor Return (Net)',
    'SJ Interest', 'JO Team',
  ]);
  assert.deepEqual(result.payoutSummary.map((r) => r.label), [
    'Investor', 'SJ', 'SJ Member', 'JO', 'JO Member (after plug)',
  ]);

  assert.equal(result.rootCause, null);
});

test('Insurance Rate is a live input, not a hardcoded constant', () => {
  const withDefault = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES });
  const withHigherInsurance = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, ...DEFAULT_RATES, insuranceRate: 2 });

  assert.equal(findRow(withDefault, 'afterInsurance').ratio, 56);
  assert.equal(findRow(withHigherInsurance, 'afterInsurance').ratio, 55);
});

test('Investor Return / JO Rate auto-complements produce the correct split', () => {
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
  assert.equal(findRow(result, 'investorReturnGross').ratio, 39.2);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 16.8);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 39.2);
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

test('a tax rate high enough flips investorReturnNet negative while sjTeamReturn stays positive', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, insuranceRate: 1, taxRate: 60, investorReturnRate: 50, joRate: 60 });

  assert.equal(findRow(result, 'afterInsurance').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'investorReturnGross').negative, false);
  assert.equal(findRow(result, 'investorReturnNet').ratio, -5.6);
  assert.equal(findRow(result, 'sjTeamReturn').ratio, 28);
  assert.equal(findRow(result, 'sjTeamReturn').negative, false);
  assert.equal(result.rootCause.key, 'investorReturnNet');
  assert.match(result.rootCause.message, /Tax Rate/);
});
