function fail() {
  throw new TypeError('estimate-hours:finite-non-negative-number-required');
}

function stableScaled(hours) {
  const scaled = hours * 2;
  const nearest = Math.round(scaled);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  return Math.abs(scaled - nearest) <= tolerance ? nearest : scaled;
}

export function ceilEstimateHours(rawHours) {
  if (typeof rawHours !== 'number' || !Number.isFinite(rawHours) || rawHours < 0) fail();
  const result = Math.ceil(stableScaled(rawHours)) / 2;
  return Object.is(result, -0) ? 0 : result;
}

export function isHalfHourEstimate(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) return false;
  const scaled = hours * 2;
  return stableScaled(hours) === Math.round(scaled);
}
