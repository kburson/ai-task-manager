#!/usr/bin/env node
// @story #1090
import { after, before, beforeEach, describe } from 'node:test';

import {
  createChoreModeFixture,
  destroyChoreModeFixture,
  resetChoreModeFixture,
} from '../../../fixtures/chore-mode/chore-mode-fixture.mjs';
import { registerChoreModeCommitGateCases } from '../../../helpers/chore-mode-commit-gate.cases.mjs';
import { registerChoreModeScopeCases } from '../../../helpers/chore-mode-scope.cases.mjs';
import { registerChoreModeStateCases } from '../../../helpers/chore-mode-state.cases.mjs';

describe('chore-mode state, scope, and commit contract', () => {
  let fixture;
  const getFixture = () => fixture;

  before(() => {
    fixture = createChoreModeFixture({ repository: { branch: 'fixture' } });
  });
  beforeEach(() => resetChoreModeFixture(fixture));
  after(() => destroyChoreModeFixture(fixture));

  registerChoreModeStateCases(getFixture);
  registerChoreModeScopeCases(getFixture);
  registerChoreModeCommitGateCases();
});
