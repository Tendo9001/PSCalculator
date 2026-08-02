import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.js';

function findRow(result, key) {
  const row = result.rows.find((r) => r.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row;
}

test('all-positive chain with tax computes exact values and has no root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 60);
  assert.equal(findRow(result, 'balanceInterest').ratio, 57);
  assert.equal(findRow(result, 'afterTakaful').ratio, 56);
  assert.equal(findRow(result, 'tax').ratio, 11.2);
  assert.equal(findRow(result, 'pat').ratio, 44.8);
  assert.equal(findRow(result, 'investorReturn').ratio, 22.4);
  assert.equal(findRow(result, 'teamAReturn').ratio, 22.4);
  assert.equal(findRow(result, 'teamAInterest').ratio, 8.96);
  assert.equal(findRow(result, 'teamBInterest').ratio, 13.44);
  assert.equal(findRow(result, 'teamBAmount').amount, 13440);
  assert.equal(findRow(result, 'perHeadAmount').amount, 3360);
  assert.equal(findRow(result, 'monthlyPayout').amount, 280);
  assert.equal(result.rootCauseKey, null);
  assert.equal(result.rows.every((r) => r.negative === false), true);
});

test('zero tax rate matches the pre-tax chain exactly', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 0 });

  assert.equal(findRow(result, 'tax').ratio, 0);
  assert.equal(findRow(result, 'pat').ratio, 56);
  assert.equal(findRow(result, 'monthlyPayout').amount, 350);
});

test('cost of fund exceeding annual rate flags balanceInterest as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 2, period: 6, costOfFund: 20, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, 12);
  assert.equal(findRow(result, 'annualRate').negative, false);
  assert.equal(findRow(result, 'balanceInterest').ratio, -8);
  assert.equal(findRow(result, 'monthlyPayout').amount, -45);
  assert.equal(result.rootCauseKey, 'balanceInterest');
  assert.match(result.rootCauseMessage, /Cost of Fund/);
});

test('negative monthly rate flags annualRate as the root cause even though later rows are also negative', () => {
  const result = calculate({ principal: 100000, monthlyRate: -5, period: 12, costOfFund: 3, taxRate: 20 });

  assert.equal(findRow(result, 'annualRate').ratio, -60);
  assert.equal(findRow(result, 'balanceInterest').ratio, -63);
  assert.equal(findRow(result, 'monthlyPayout').amount, -320);
  assert.equal(result.rootCauseKey, 'annualRate');
});

test('a small positive balance that cannot cover the Takaful deduction flags afterTakaful as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 1, period: 1, costOfFund: 0.5, taxRate: 20 });

  assert.equal(findRow(result, 'balanceInterest').ratio, 0.5);
  assert.equal(findRow(result, 'balanceInterest').negative, false);
  assert.equal(findRow(result, 'afterTakaful').ratio, -0.5);
  assert.equal(findRow(result, 'monthlyPayout').amount, -2.5);
  assert.equal(result.rootCauseKey, 'afterTakaful');
});

test('a tax rate over 100% flips a positive afterTakaful into a negative PAT, flagging pat as the root cause', () => {
  const result = calculate({ principal: 100000, monthlyRate: 5, period: 12, costOfFund: 3, taxRate: 150 });

  assert.equal(findRow(result, 'afterTakaful').ratio, 56);
  assert.equal(findRow(result, 'afterTakaful').negative, false);
  assert.equal(findRow(result, 'tax').ratio, 84);
  assert.equal(findRow(result, 'pat').ratio, -28);
  assert.equal(findRow(result, 'monthlyPayout').amount, -175);
  assert.equal(result.rootCauseKey, 'pat');
  assert.match(result.rootCauseMessage, /Tax Rate/);
});
