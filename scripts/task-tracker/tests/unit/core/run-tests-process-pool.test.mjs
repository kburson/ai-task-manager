#!/usr/bin/env node
// @story #1090
import { after, before, beforeEach, describe } from 'node:test';

import {
  createRunnerFixture,
  destroyRunnerFixture,
  resetRunnerFixture,
} from '../../fixtures/run-tests/runner-fixture.mjs';

describe('runner process and pool policy', async () => {
  let fixture;

  before(() => {
    fixture = createRunnerFixture({ parallelSafety: { bounded: true, ordered: true } });
  });
  beforeEach(() => resetRunnerFixture(fixture));
  after(() => destroyRunnerFixture(fixture));

  await import('./run-tests-pool.cases.mjs');
  await import('./run-tests-kill-report.cases.mjs');
});
