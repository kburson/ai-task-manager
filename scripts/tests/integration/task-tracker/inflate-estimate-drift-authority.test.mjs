// @story #2163 — source/effect drift and allowed field combinations.
import { root, source, startFixture, inflation } from '../../fixtures/inflation-test-context.mjs';
import { registerInflationDriftCases } from './inflate-estimate-drift-cases.mjs';
registerInflationDriftCases({ root, source, startFixture, inflation });
