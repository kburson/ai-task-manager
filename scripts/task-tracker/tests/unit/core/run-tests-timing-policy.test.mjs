#!/usr/bin/env node
// @story #1090
import { after, before, beforeEach, describe } from 'node:test';

import {
  createRunnerFixture,
  destroyRunnerFixture,
  resetRunnerFixture,
} from '../../fixtures/run-tests/runner-fixture.mjs';

describe('runner timing and ceiling policy', async () => {
  let fixture;

  before(() => {
    fixture = createRunnerFixture({ files: ['.aitm/test-timing.json'] });
  });
  beforeEach(() => resetRunnerFixture(fixture));
  after(() => destroyRunnerFixture(fixture));

  await import('./run-tests-timing.cases.mjs');
  await import('./run-tests-elapsed.cases.mjs');
  await import('./run-tests-ceiling.cases.mjs');
});
