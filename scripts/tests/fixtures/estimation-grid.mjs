// @story #1098
import assert from 'node:assert/strict';

import { isHalfHourEstimate } from '../../task-tracker/lib/estimation/estimate-granularity.mjs';

export function assertPublishedForecastOnHalfHourGrid(forecast) {
  const published = [
    forecast.refine.humanHours,
    forecast.plan.humanHours,
    forecast.ai.p50EngagedHours,
    forecast.ai.p80EngagedHours,
    ...forecast.wbs.map((item) => item.humanHours),
    ...Object.values(forecast.ai.stages),
  ];
  assert.ok(published.every(isHalfHourEstimate));
  assert.equal(
    forecast.wbs.reduce((sum, item) => sum + item.humanHours, 0),
    forecast.plan.humanHours
  );
  assert.equal(
    Object.values(forecast.ai.stages).reduce((sum, hours) => sum + hours, 0),
    forecast.ai.p50EngagedHours
  );
  assert.ok(forecast.ai.p80EngagedHours >= forecast.ai.p50EngagedHours);
}
