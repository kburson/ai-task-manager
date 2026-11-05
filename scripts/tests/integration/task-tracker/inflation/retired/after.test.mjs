// @story #2163 — lost-response retirement retries, bounded independently for CI.
import { startFixture, inflation } from '../../../../fixtures/inflation-test-context.mjs';
import { registerInflationRetryCases } from '../../inflate-estimate-retry-cases.mjs';
registerInflationRetryCases({
  startFixture,
  inflation,
  scenarios: ['retired-forecast'],
  phases: ['after-apply-before-response'],
});
