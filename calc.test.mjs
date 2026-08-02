import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.js';

function findRow(result, key) {
  const row = [...result.shared, ...result.myTeam, ...result.investor].find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

test('all-positive chain: investor side reduced by tax, MY-Team side untouched', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterTakaful').ratio, 56);

  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'investorReturnNet').ratio, 16.8);

  assert.equal(findRow(result, 'teamAReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAInterest').ratio, 11.2);
  assert.equal(findRow(result, 'teamBInterest').ratio, 16.8);
  assert.equal(findRow(result, 'teamBAmount').amount, 16800);
  assert.equal(findRow(result, 'perHeadAmount').amount, 4200);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);

  assert.equal(result.rootCause, null);

  assert.deepEqual(result.shared.map((r) => r.key), ['annualRate', 'balanceInterest', 'afterTakaful']);
  assert.deepEqual(result.myTeam.map((r) => r.key), ['teamAReturn', 'teamAInterest', 'teamBInterest', 'teamBAmount', 'perHeadAmount', 'monthlyPayout']);
  assert.deepEqual(result.investor.map((r) => r.key), ['investorReturnGross', 'tax', 'investorReturnNet']);
});

test('MY-Team side is identical regardless of tax rate', () => {
  const base = { principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3 };
  const withNoTax = calculate({ ...base, taxRate: 0 });
  const withHighTax = calculate({ ...base, taxRate: 90 });

  assert.deepEqual(withNoTax.myTeam, withHighTax.myTeam);
});

test('cost of fund exceeding annual rate flags balanceInterest as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(findRow(result, 'monthlyPayout').amount, -56.25);
  assert.equal(result.rootCause.key, 'balanceInterest');
  assert.equal(result.rootCause.scope, 'shared');
  assert.match(result.rootCause.message, /Cost of Fund/);
});

test('negative monthly rate flags annualRate as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: -5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, -60);
  assert.equal(findRow(result, 'monthlyPayout').amount, -400);
  assert.equal(result.rootCause.key, 'annualRate');
  assert.equal(result.rootCause.scope, 'shared');
});

test('a small positive balance that cannot cover Takaful flags afterTakaful as a shared root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 1, period: 1, costOfFund: 0.5, taxRate: 20 });

  assert.equal(findRow(result, 'balanceInterest').ratio, 0.5);
  assert.equal(findRow(result, 'balanceInterest').negative, false);
  assert.equal(findRow(result, 'afterTakaful').ratio, -0.5);
  assert.equal(findRow(result, 'monthlyPayout').amount, -3.125);
  assert.equal(result.rootCause.key, 'afterTakaful');
  assert.equal(result.rootCause.scope, 'shared');
});

test('a tax rate over 50% flags investorReturnNet as an investor-only root cause, leaving MY-Team positive', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 60 });

  assert.equal(findRow(result, 'afterTakaful').ratio, 56);
  assert.equal(findRow(result, 'investorReturnGross').ratio, 28);
  assert.equal(findRow(result, 'investorReturnGross').negative, false);
  assert.equal(findRow(result, 'tax').ratio, 33.6);
  assert.equal(findRow(result, 'investorReturnNet').ratio, -5.6);
  assert.equal(findRow(result, 'investorReturnNet').negative, true);

  assert.equal(findRow(result, 'teamAReturn').ratio, 28);
  assert.equal(findRow(result, 'teamAReturn').negative, false);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);
  assert.equal(findRow(result, 'monthlyPayout').negative, false);

  assert.equal(result.rootCause.key, 'investorReturnNet');
  assert.equal(result.rootCause.scope, 'investor');
  assert.match(result.rootCause.message, /Tax Rate/);
});
