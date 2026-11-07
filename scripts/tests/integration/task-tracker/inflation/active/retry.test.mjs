// @story #2163 — full active-forecast physical interruption matrix.
import { startFixture, inflation } from '../../../../fixtures/inflation-test-context.mjs';
import { registerInflationRetryCases } from '../../inflate-estimate-retry-cases.mjs';
registerInflationRetryCases({ startFixture, inflation, scenarios: ['active-forecast'] });
