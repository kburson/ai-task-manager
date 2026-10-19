// @story #1989
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CODE_DEFINITIONS,
  vocabularyDigest,
  ACTION_DECISION_SCHEMA,
  ACTION_DECISION_SCHEMA_V1,
  ACTION_VOCABULARY_VERSION,
  AUTHORITY_RESOURCE_IDS,
  BOUNDARY_PRODUCER_IDS,
} from '../../task-tracker/lib/action-decision/contract.mjs';
export function registerDecompositionVocabularyCases() {
  test('the decision vocabulary exposes its version and reserved boundary producers', () => {
    assert.equal(ACTION_DECISION_SCHEMA, 'aitm.action-decision/v2');
    assert.equal(ACTION_DECISION_SCHEMA_V1, 'aitm.action-decision/v1');
    assert.equal(ACTION_VOCABULARY_VERSION, 'aitm.action-vocabulary/v2');
    assert.deepEqual(BOUNDARY_PRODUCER_IDS, [
      'authority-collection',
      'decomposition-continuation',
      'action-navigation',
      'action-result-validation',
    ]);
    assert.equal(CODE_DEFINITIONS['unclassified-refusal'].domain, 'decision-blocker');
    assert.equal(CODE_DEFINITIONS['guidance-source-diverged'].domain, 'operational-warning');
    assert.equal(CODE_DEFINITIONS['guidance-annotation-failed'].domain, 'audit-warning');
    assert.match(vocabularyDigest(), /^sha256:[a-f0-9]{64}$/);
  });

  test('authority resources include honest local session sources while remaining closed', () => {
    assert.deepEqual(AUTHORITY_RESOURCE_IDS, [
      'issue-body',
      'decomposition',
      'issue-comment',
      'project-board',
      'delivery',
      'timing-log',
      'workflow-policy',
      'local-config',
      'session-state',
      'worktree',
      'github-user',
      'occupancy',
      'migration-journal',
    ]);
  });
}
