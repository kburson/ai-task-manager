#!/usr/bin/env node
// @story #1090
import { after, before, beforeEach, describe } from 'node:test';

import {
  createRunnerFixture,
  destroyRunnerFixture,
  resetRunnerFixture,
} from '../../fixtures/run-tests/runner-fixture.mjs';

describe('runner discovery and lane assignment', async () => {
  let fixture;

  before(() => {
    fixture = createRunnerFixture({ lanes: ['unit', 'integration', 'slow'] });
  });
  beforeEach(() => resetRunnerFixture(fixture));
  after(() => destroyRunnerFixture(fixture));

  await import('./run-tests-discovery.cases.mjs');
  await import('./run-tests-lanes.cases.mjs');
});
