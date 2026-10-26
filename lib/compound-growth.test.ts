import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCompound,
  generateGrowthSeries,
  generateNumericRange,
} from './compound-growth.ts';

void test('10% annual return compounds to about 2.5937x in 10 years', () => {
  const result = calculateCompound({
    initialPrincipal: 800_000,
    monthlyContribution: 0,
    annualRate: 0.1,
    years: 10,
  });
  assert.ok(Math.abs(result.multipleOnInitial - 2.59374246) < 1e-7);
});

void test('zero return preserves principal without contributions', () => {
  const result = calculateCompound({
    initialPrincipal: 800_000,
    monthlyContribution: 0,
    annualRate: 0,
    years: 20,
  });
  assert.equal(result.finalAsset, 800_000);
  assert.equal(result.profit, 0);
});

void test('zero return with monthly contributions equals total invested', () => {
  const result = calculateCompound({
    initialPrincipal: 100_000,
    monthlyContribution: 2_000,
    annualRate: 0,
    years: 5,
  });
  assert.equal(result.finalAsset, 220_000);
  assert.equal(result.finalAsset, result.investedPrincipal);
});

void test('range generation respects fractional rate steps and year steps', () => {
  assert.equal(generateNumericRange(8, 20, 0.5, 100).length, 25);
  assert.deepEqual(generateNumericRange(1, 40, 5, 100), [1, 6, 11, 16, 21, 26, 31, 36]);
});

void test('growth series final point matches compound result', () => {
  const scenario = {
    initialPrincipal: 50_000,
    monthlyContribution: 500,
    annualRate: 0.08,
    years: 12,
  };
  const result = calculateCompound(scenario);
  const series = generateGrowthSeries(scenario, 'monthly');
  assert.ok(Math.abs(series.at(-1)!.asset - result.finalAsset) < 1e-6);
});
