export type CompoundScenario = {
  initialPrincipal: number;
  monthlyContribution: number;
  annualRate: number;
  years: number;
};

export type CompoundResult = {
  finalAsset: number;
  investedPrincipal: number;
  contributionTotal: number;
  profit: number;
  totalReturn: number;
  multipleOnInvested: number;
  multipleOnInitial: number;
  doublingYears: number | null;
};

export type GrowthPoint = {
  period: number;
  label: string;
  years: number;
  asset: number;
  invested: number;
  profit: number;
};

const EPSILON = 1e-12;

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateCompound({
  initialPrincipal,
  monthlyContribution,
  annualRate,
  years,
}: CompoundScenario): CompoundResult {
  const principal = finiteNonNegative(initialPrincipal);
  const contribution = finiteNonNegative(monthlyContribution);
  const safeYears = Number.isFinite(years) ? Math.max(0, years) : 0;
  const rate = Number.isFinite(annualRate)
    ? Math.max(-0.999999, annualRate)
    : 0;
  const months = Math.max(0, Math.round(safeYears * 12));
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  const growth = Math.pow(1 + monthlyRate, months);
  const contributionValue =
    Math.abs(monthlyRate) < EPSILON
      ? contribution * months
      : contribution * ((growth - 1) / monthlyRate);
  const finalAsset = principal * growth + contributionValue;
  const contributionTotal = contribution * months;
  const investedPrincipal = principal + contributionTotal;
  const profit = finalAsset - investedPrincipal;
  return {
    finalAsset,
    investedPrincipal,
    contributionTotal,
    profit,
    totalReturn: investedPrincipal ? profit / investedPrincipal : 0,
    multipleOnInvested: investedPrincipal
      ? finalAsset / investedPrincipal
      : 0,
    multipleOnInitial: principal ? finalAsset / principal : 0,
    doublingYears:
      contribution === 0 && principal > 0 && rate > 0
        ? Math.log(2) / Math.log(1 + rate)
        : null,
  };
}

export function generateNumericRange(
  start: number,
  end: number,
  step: number,
  maxItems: number,
) {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? end : safeStart;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const low = Math.min(safeStart, safeEnd);
  const high = Math.max(safeStart, safeEnd);
  const count = Math.min(
    maxItems,
    Math.floor((high - low) / safeStep + EPSILON) + 1,
  );
  return Array.from({ length: Math.max(1, count) }, (_, index) =>
    Number((low + index * safeStep).toFixed(8)),
  );
}

export function generateGrowthSeries(
  scenario: CompoundScenario,
  granularity: 'yearly' | 'monthly' = 'yearly',
): GrowthPoint[] {
  const principal = finiteNonNegative(scenario.initialPrincipal);
  const contribution = finiteNonNegative(scenario.monthlyContribution);
  const years = Number.isFinite(scenario.years)
    ? Math.max(0, scenario.years)
    : 0;
  const rate = Number.isFinite(scenario.annualRate)
    ? Math.max(-0.999999, scenario.annualRate)
    : 0;
  const totalMonths = Math.max(0, Math.round(years * 12));
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  const points: GrowthPoint[] = [];
  let asset = principal;

  for (let month = 0; month <= totalMonths; month += 1) {
    if (month > 0) asset = asset * (1 + monthlyRate) + contribution;
    if (
      granularity === 'monthly' ||
      month === 0 ||
      month === totalMonths ||
      month % 12 === 0
    ) {
      const invested = principal + contribution * month;
      points.push({
        period: month,
        label:
          granularity === 'monthly'
            ? `${Math.floor(month / 12)}年${month % 12}月`
            : `${Number((month / 12).toFixed(2))}年`,
        years: month / 12,
        asset,
        invested,
        profit: asset - invested,
      });
    }
  }
  return points;
}

