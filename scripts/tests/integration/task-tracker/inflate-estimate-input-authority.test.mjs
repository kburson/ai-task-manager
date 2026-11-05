// @story #2163 — identity, semantic input and audit-provenance cases.
import { root, startFixture, inflation } from '../../fixtures/inflation-test-context.mjs';
import { registerInflationInputCases } from './inflate-estimate-input-cases.mjs';
registerInflationInputCases({ root, startFixture, inflation });
