// @story #2163 — every ordinary-forecast before-write interruption.
import { startFixture, inflation } from '../../fixtures/inflation-test-context.mjs';
import { registerInflationRetryCases } from './inflate-estimate-retry-cases.mjs';
registerInflationRetryCases({
  startFixture,
  inflation,
  scenarios: ['plain'],
  phases: ['before-apply'],
});
