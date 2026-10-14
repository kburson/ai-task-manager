// @story #2012
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture } from '../../../helpers/unit-runtime-root.mjs';
import {
  createRankWaveSourceLoader,
  verifyRankWaveSource,
} from '../../../../task-tracker/lib/epic-rank-wave-source.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';

const scope = { repository: 'o/r', epic: 2, rank: 4, members: [4, 5, 6, 7, 14] };
const authorization =
  'Authorize parallel execution for epic #2 rank 4 stories #4, #5, #6, #7, #14.';
const deferredPause =
  'when wave 4 is complete I need you to pause.  I will start a fresh chat session to continue #2';

// Test-owned transcript identity and timestamps; only the human wording is reproduced.
async function rescan(
  later,
  { targetScope = scope, selected = authorization, changeHash = false, through = null } = {}
) {
  const dir = createUnitRootFixture('rank-wave-deferred-pause');
  const transcriptPath = path.join(dir, 'native.jsonl');
  const source = {
    schema: 'aitm.rank-wave-source/v1',
    sessionId: 'native-session',
    messages: [{ messageId: 'selected', statementHash: hashAuthorizationStatement(selected) }],
  };
  if (changeHash) source.messages[0].statementHash = 'sha256:' + '0'.repeat(64);
  const message = (text, id, timestamp) => ({
    type: 'response_item',
    timestamp,
    payload: { type: 'message', id, role: 'user', content: [{ type: 'input_text', text }] },
  });
  const transcript = [
    { type: 'session_meta', payload: { id: 'native-session', cwd: dir } },
    message(selected, 'selected', '2026-10-14T00:40:00.000Z'),
    ...later.map((value, i) =>
      message(
        typeof value === 'string' ? value : value.text,
        'later-' + i,
        typeof value === 'string' ? '2026-10-14T00:47:01.848Z' : value.at
      )
    ),
  ]
    .map(JSON.stringify)
    .join('\n');
  try {
    writeFileSync(transcriptPath, transcript);
    const loadContext = createRankWaveSourceLoader({
      resolveTranscriptPath: async () => transcriptPath,
      resolveRepository: async () => 'o/r',
    });
    const result = await verifyRankWaveSource({
      source,
      scope: targetScope,
      recordingActor: 'codex/session:test-recorder',
      loadContext,
      through,
    });
    const context = !changeHash ? await loadContext(source, { scope: targetScope, through }) : null;
    return { result, context, source };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('exact completion pause preserves original authority during the native later-human rescan', async () => {
  assert.equal(
    hashAuthorizationStatement(authorization),
    'sha256:fb308dfe394c8c625669bf5f3bed306e641945d8209533f2b1f1e57567223c5d'
  );
  const { result, context, source } = await rescan([deferredPause]);
  assert.equal(result.status, 'verified');
  assert.deepEqual(context.subsequentStatements, []);
  assert.deepEqual(result.authority.source, source);
  assert.deepEqual(result.authority.scope, scope);
});

test('explicit current-wave completion conditions defer only their attached pause or stop', async () => {
  for (const statement of [
    'When wave 4 is complete, pause.',
    'Once rank 4 is done, stop.',
    'After wave 4 has finished please pause.',
    'When rank-wave 4 is complete I want you to pause.',
    'When wave 4 is complete please stop parallel execution for epic #2 rank 4.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'verified', statement);
  }
});

test('immediate unconditional matching pause stop and revocation still refuse', async () => {
  for (const statement of [
    'Pause epic #2 rank 4.',
    'Pause now.',
    'Stop now.',
    'Pause.',
    'Stop.',
    'Stop parallel execution for epic #2 rank 4.',
    'Revoke epic #2 rank 4.',
    'When wave 4 is complete pause now.',
    'When wave 4 is complete stop immediately.',
    'Pause parallel execution for epic #2 rank 4 until wave 4 is complete.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'blocked', statement);
    assert.equal(result.code, 'rank-wave-source-contradiction', statement);
  }
});

test('a deferred pause never conceals another matching withdrawal in the same message', async () => {
  for (const statement of [
    'When wave 4 is complete pause, but revoke parallel execution for epic #2 rank 4.',
    'Revoke epic #2 rank 4. When wave 4 is complete pause.',
    'When wave 4 is complete pause and stop parallel execution for epic #2 rank 4.',
    'When wave 4 is complete pause, but stop now.',
    'When wave 4 is complete pause and do not run epic #2 rank 4.',
    'When wave 4 is complete pause. Stop now.',
    'When wave 4 is complete pause; pause now.',
    'When wave 4 is complete pause. Stop deployment, but stop now.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'blocked', statement);
  }
});

test('ambiguous and unrelated conditions do not waive a current-wave withdrawal', async () => {
  for (const statement of [
    'If wave 4 is complete pause parallel execution for epic #2 rank 4.',
    'Unless wave 4 is complete pause parallel execution for epic #2 rank 4.',
    'When wave 4 is complete do not run epic #2 rank 4.',
    'When wave 4 is complete withdraw parallel execution for epic #2 rank 4.',
    'When wave 5 is complete pause epic #2 rank 4.',
    'When wave 4 is incomplete pause.',
    'When wave 4 is complete after CI passes pause.',
    'When wave 4 is complete. Pause now.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'blocked', statement);
  }
});

test('explicit other-wave and other-epic instructions retain their independent scope', async () => {
  for (const statement of [
    'Pause epic #2 rank 5.',
    'Stop epic #3 rank 4.',
    'Pause wave 5.',
    'When wave 5 is complete pause.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'verified', statement);
  }
});

test('a scheduled completion pause grants neither standalone nor later-wave permission', async () => {
  assert.equal((await rescan([], { selected: deferredPause })).result.status, 'blocked');
  const laterScope = { ...scope, rank: 5, members: [8] };
  assert.equal(
    (await rescan([deferredPause], { targetScope: laterScope })).result.status,
    'blocked'
  );
});

test('live scans retain later revocation beyond deferred pause and unrelated conversation', async () => {
  const later = [deferredPause, ...Array.from({ length: 65 }, () => 'Inspect CI output.')];
  later.push('Revoke parallel execution for epic #2 rank 4.');
  const { result, context } = await rescan(later);
  assert.equal(result.status, 'blocked');
  assert.equal(context.subsequentStatements.at(-1), later.at(-1));
  assert.equal(
    (await rescan([deferredPause, 'Inspect CI output.', 'Stop now.'])).result.status,
    'blocked'
  );
});

test('deferred pause does not alter exact source hashes or historical observation cutoffs', async () => {
  assert.equal((await rescan([deferredPause], { changeHash: true })).result.status, 'blocked');
  const later = [deferredPause, { text: 'Revoke epic #2 rank 4.', at: '2026-10-14T00:55:00.000Z' }];
  assert.equal(
    (await rescan(later, { through: '2026-10-14T00:50:00.000Z' })).result.status,
    'verified'
  );
  assert.equal((await rescan(later)).result.status, 'blocked');
});

test('completion-related operational chatter does not redirect independent commands to admission', async () => {
  for (const statement of [
    'When wave 4 is complete stop reviewing CI. Please hold off on deployment.',
    'When wave 4 is complete pause epic #3 rank 4. Stop deployment.',
    'When wave 4 is complete pause. Please hold off on deployment.',
    'When wave 4 is complete pause. Stop deployment.',
  ]) {
    const { result } = await rescan([statement]);
    assert.equal(result.status, 'verified', statement);
  }
});

// Independent review inputs; literal expected behavior is the owner/spec contract.
const reviewCases = [
  [
    'when wave 4 is complete I need you to pause.  I will start a fresh chat session to continue #2',
    'verified',
  ],
  ['Stop deployment and parallel execution for epic #2 rank 4.', 'blocked'],
  [
    'When wave 4 is complete pause. Stop deployment and parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  ['Hold off on deployment and parallel execution for epic #2 rank 4.', 'blocked'],
  ['When wave 4 is complete pause. Stop deployment.', 'verified'],
  ['When wave 4 is complete pause. Do not start deployment.', 'verified'],
  ['When wave 4 is complete pause. I do not want to start deployment.', 'verified'],
  ['When wave 4 is complete pause. Stop now.', 'blocked'],
  ['When wave 4 is complete pause and revoke epic #2 rank 4.', 'blocked'],
  ['When wave 4 is complete do not pause.', 'verified'],
  ['When wave 5 is complete pause.', 'verified'],
  ['When wave 4 is complete pause. Pause epic #2 rank 4 now.', 'blocked'],
  ['When wave 4 is complete pause. We should not run tests yet.', 'verified'],
  ['When wave 4 is complete pause. Do not execute tests.', 'verified'],
  ['When wave 4 is complete pause. Do not proceed with testing.', 'verified'],
  ['When wave 4 is complete pause. I do not want to run tests.', 'verified'],
  ['I do not want to run tests.', 'verified'],
  ['I do not want to start deployment.', 'verified'],
  ['When wave 4 is complete pause. I do not want to run epic #2 rank 4 in parallel.', 'blocked'],
  [
    'When wave 4 is complete pause. Stop deploying and running epic #2 rank 4 in parallel.',
    'blocked',
  ],
];

for (const [index, [statement, expected]] of reviewCases.entries()) {
  test('independent review reproduction ' + (index + 1) + ': ' + statement, async () => {
    const { result, context } = await rescan([statement]);
    assert.equal(result.status, expected, statement);
    if (expected === 'blocked') {
      assert.equal(result.code, 'rank-wave-source-contradiction');
      assert.deepEqual(context.subsequentStatements, [statement]);
    } else {
      assert.deepEqual(context.subsequentStatements, []);
    }
  });
}

test('shared withdrawal verbs evaluate every coordinated operational and admission target', async () => {
  for (const prefix of ['', 'When wave 4 is complete pause. ']) {
    for (const target of [
      'Stop deployment and parallel execution for epic #2 rank 4.',
      'Hold off on deployment and parallel execution for epic #2 rank 4.',
      'Stop deploying and running epic #2 rank 4 in parallel.',
      'Pause tests and parallel execution for epic #2 rank 4.',
      'Stop deployment or parallel execution for epic #2 rank 4.',
      'Stop deployment, and parallel execution for epic #2 rank 4.',
      'Stop deployment & parallel execution for epic #2 rank 4.',
      'Stop deployment and parallel execution for epic #2 rank 3 and 4.',
      'Stop parallel execution for epic #3 rank 4 and parallel execution for epic #2 rank 4.',
    ]) {
      assert.equal((await rescan([prefix + target])).result.status, 'blocked', prefix + target);
    }
  }
});

test('coordinated targets retain separate numeric-wave and epic scope', async () => {
  for (const statement of [
    'When wave 4 is complete pause. Stop deployment and parallel execution for epic #2 rank 5.',
    'When wave 4 is complete pause. Stop deployment and parallel execution for epic #3 rank 4.',
    'When wave 4 is complete pause. Stop deployment for epic #2 rank 4 and parallel execution for epic #3 rank 4.',
    'When wave 4 is complete pause. Stop deployment and tests.',
    'When wave 4 is complete pause. Do not stop deployment and parallel execution for epic #2 rank 4.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'verified', statement);
  }
});

test('negated preferences carry negation to the actual operation without withdrawing admission', async () => {
  for (const statement of [
    'I do not want to run tests.',
    'I do not want to start deployment.',
    'I do not want you to execute tests.',
    'I do not really want to run tests.',
    'I never want to run tests.',
    'I do not want to stop epic #2 rank 4.',
  ]) {
    for (const prefix of ['', 'When wave 4 is complete pause. ']) {
      assert.equal(
        (await rescan([prefix + statement])).result.status,
        'verified',
        prefix + statement
      );
    }
  }
});

test('negated admission preferences and mixed operational preferences still withdraw authority', async () => {
  for (const statement of [
    'I do not want to run epic #2 rank 4 in parallel.',
    'I do not want you to execute epic #2 rank 4.',
    'I do not really want to run epic #2 rank 4.',
    'I never want to run epic #2 rank 4.',
    'I do not want to run tests and parallel execution for epic #2 rank 4.',
    'I do not want to start deployment. Stop now.',
    'I do not want to run tests, but revoke epic #2 rank 4.',
  ]) {
    assert.equal(
      (await rescan(['When wave 4 is complete pause. ' + statement])).result.status,
      'blocked',
      statement
    );
  }
});

// FIX ROUND 2: immutable independent review extensions and their literal contract.
const fixRound2Cases = [
  ['Stop deployment, tests, and parallel execution for epic #2 rank 4.', 'blocked'],
  ['Stop deployment, parallel execution for epic #2 rank 4.', 'blocked'],
  [
    'When wave 4 is complete pause. Stop deployment, tests, and parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests or execute epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests and execute epic #2 rank 4.',
    'blocked',
  ],
  ['I do not want to run tests or execute epic #2 rank 4.', 'blocked'],
  [
    'When wave 4 is complete pause. I do not want you to run tests or start epic #2 rank 4.',
    'blocked',
  ],
  ['When wave 4 is complete pause. I do not want to run tests or start deployment.', 'verified'],
  [
    'When wave 4 is complete pause. Stop deployment, tests, and parallel execution for epic #2 rank 5.',
    'verified',
  ],
  ['Stop deployment & parallel execution for epic #2 rank 4.', 'blocked'],
  ['Stop deployment, and parallel execution for epic #2 rank 4.', 'blocked'],
  [
    'When wave 4 is complete pause. Stop deployment for epic #2 rank 4 and parallel execution for epic #3 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Stop deployment and parallel execution for epic #2 rank 5.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Do not stop deployment and parallel execution for epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Do not run tests and parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  ['When wave 4 is complete pause. I do not want to run tests, but stop now.', 'blocked'],
  ['When wave 4 is complete pause. I do not want to stop epic #2 rank 4.', 'verified'],
  ['Stop deployment and parallel execution for epic #2 rank 3 and 4.', 'blocked'],
  ['Stop deployment and parallel execution for epic #2 rank 3 and 5.', 'verified'],
  [
    'Stop parallel execution for epic #3 rank 4 and parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete stop deployment and parallel execution for epic #2 rank 4. Stop now.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause tests and parallel execution for epic #2 rank 4. Stop now.',
    'blocked',
  ],
  [
    'When wave 4 is complete stop deployment and parallel execution for epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete stop deployment and parallel execution for epic #2 rank 4. Stop deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete stop parallel execution for epic #2 rank 4 and deployment. Stop now.',
    'blocked',
  ],
];

for (const [index, [statement, expected]] of fixRound2Cases.entries()) {
  test('fix round 2 reproduction ' + (index + 21) + ': ' + statement, async () => {
    const { result, context } = await rescan([statement]);
    assert.equal(result.status, expected, statement);
    assert.deepEqual(context.subsequentStatements, expected === 'blocked' ? [statement] : []);
    if (expected === 'blocked') assert.equal(result.code, 'rank-wave-source-contradiction');
  });
}

test('comma target lists preserve numeric member lists and separate other-epic scope', async () => {
  for (const [statement, expected] of [
    [
      'Stop deployment, tests, and parallel stories #4, #5, #6, #7, #14 of epic #2 rank 4.',
      'blocked',
    ],
    [
      'Stop deployment for epic #2 rank 4, tests, and parallel execution for epic #3 rank 4.',
      'verified',
    ],
    ['When wave 4 is complete pause. Stop deployment, tests, and lint.', 'verified'],
    [
      'When wave 4 is complete pause. Stop deployment because tests failed and parallel execution for epic #2 rank 4 is green.',
      'verified',
    ],
  ]) {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  }
});

test('preference scope follows coordinated verbs and ends at independent subjects and clauses', async () => {
  for (const [statement, expected] of [
    [
      'When wave 4 is complete pause. I do not want to run tests and run epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests or execute tests or start epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests and I want to execute epic #2 rank 4.',
      'verified',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, but execute epic #2 rank 4.',
      'verified',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests. Execute epic #2 rank 4.',
      'verified',
    ],
    ['When wave 4 is complete pause. I want to run tests or execute epic #2 rank 4.', 'verified'],
    ['When wave 4 is complete pause. I do not want to run tests and please stop now.', 'blocked'],
  ]) {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  }
});

test('deferred coordinated targets provide only scoped relevance to later independent stops', async () => {
  for (const [statement, expected] of [
    [
      'When wave 4 is complete stop deployment, tests, and parallel execution for epic #2 rank 4. Stop now.',
      'blocked',
    ],
    [
      'When wave 4 is complete stop deployment, tests, and parallel execution for epic #2 rank 4. Stop deployment.',
      'verified',
    ],
    [
      'When wave 4 is complete stop deployment, tests, and parallel execution for epic #2 rank 4. I do not want to run tests.',
      'verified',
    ],
    [
      'When wave 4 is complete stop deployment and parallel execution for epic #3 rank 4. Stop deployment.',
      'verified',
    ],
    [
      'When wave 4 is complete stop deployment and parallel execution for epic #2 rank 5. Pause wave 5.',
      'verified',
    ],
    [
      'When wave 4 is complete stop deployment and parallel execution for epic #2 rank 4. Stop now after tests pass.',
      'blocked',
    ],
  ]) {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  }
});

test('comma-coordinated preference operations retain negation before an independent stop boundary', async () => {
  for (const [statement, expected] of [
    [
      'When wave 4 is complete pause. I do not want to run tests, execute epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, run tests, and execute epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, execute tests, and start deployment.',
      'verified',
    ],
    ['When wave 4 is complete pause. I do not want to run tests, stop now.', 'blocked'],
  ]) {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  }
});

// FIX ROUND 3: exact independent review extensions and literal outcomes.
const fixRound3Cases = [
  ['Stop lint, tests, deployment, and parallel execution for epic #2 rank 4.', 'blocked'],
  ['Stop lint, tests, deployment, and parallel execution for epic #2 rank 5.', 'verified'],
  ['Stop deployment, tests & parallel execution for epic #2 rank 4.', 'blocked'],
  ['Stop deployment, tests, or parallel execution for epic #2 rank 4.', 'blocked'],
  ['Stop tests and parallel execution for epic #2 ranks 3, 4 and 5.', 'blocked'],
  ['Stop tests and parallel execution for epic #2 ranks 3, 5 and 6.', 'verified'],
  ['Stop tests, deployment, and stories #4, #5, #6 of epic #2 rank 4.', 'blocked'],
  ['Stop tests, deployment, and stories #8, #9, #10 of epic #2 rank 5.', 'verified'],
  [
    'When wave 4 is complete pause. Stop parallel execution for epic #3 rank 4, deployment for epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Stop testing because parallel execution for epic #2 rank 4 is complete.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Stop tests, deployment, and lint because parallel execution for epic #2 rank 4 is complete.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. Stop parallel execution for epic #2 rank 4 because tests and deployment failed.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I never want to run tests, execute tests, or start epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I never want to run tests, execute tests, or start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please execute epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, I will execute epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests and we should execute epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests and please stop parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause lint, tests, and parallel execution for epic #2 rank 4. Please stop now.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause lint, tests, and parallel execution for epic #2 rank 4. Pause wave 5.',
    'verified',
  ],
  [
    'When wave 4 is complete pause tests and parallel execution for epic #3 rank 4. Stop tests.',
    'verified',
  ],
  [
    'When wave 4 is complete pause parallel execution for epic #2 rank 4, tests, and deployment. Stop immediately.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause tests, deployment, and parallel execution for epic #2 rank 4. I do not want to execute tests.',
    'verified',
  ],
  [
    'When wave 4 is complete pause tests, deployment, and parallel execution for epic #2 rank 4. I do not want to execute epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, I will start deployment.',
    'verified',
  ],
  ['I do not want to run tests, please start deployment.', 'verified'],
];

for (const [index, [statement, expected]] of fixRound3Cases.entries()) {
  test('fix round 3 reproduction ' + (index + 46) + ': ' + statement, async () => {
    const { result, context } = await rescan([statement]);
    assert.equal(result.status, expected, statement);
    assert.deepEqual(context.subsequentStatements, expected === 'blocked' ? [statement] : []);
    if (expected === 'blocked') assert.equal(result.code, 'rank-wave-source-contradiction');
  });
}

test('independent polite and subject clauses retain their own operation and negation', async () => {
  for (const [statement, expected] of [
    [
      'When wave 4 is complete pause. I do not want to run tests, please do not execute tests.',
      'verified',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, please do not execute epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, I will not execute epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, we will start deployment.',
      'verified',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, please revoke epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, please execute tests and start deployment.',
      'verified',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests or execute epic #2 rank 4.',
      'blocked',
    ],
    [
      'When wave 4 is complete pause. I do not want to run tests, execute tests, and start epic #2 rank 4.',
      'blocked',
    ],
  ]) {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  }
});

// Exact inputs from the approved 88-case review; prior 72 are retained above.
const approvedReviewExtensions = [
  [
    'When wave 4 is complete pause. I do not want to run tests, we can start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, you should execute epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please run tests and start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please do not start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, we will not execute tests.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please do not stop epic #2 rank 4.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please stop epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, we will not execute epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please never execute epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please never execute epic #2 rank 5.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please hold off on parallel execution for epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please stop the unfamiliar activity.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, execute tests, and start epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please execute tests, then start deployment.',
    'verified',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, please start deployment, but revoke epic #2 rank 4.',
    'blocked',
  ],
  [
    'When wave 4 is complete pause. I do not want to run tests, we will start deployment, and you should execute tests.',
    'verified',
  ],
];

for (const [index, [statement, expected]] of approvedReviewExtensions.entries()) {
  test('approved review extension ' + (index + 73) + ': ' + statement, async () => {
    assert.equal((await rescan([statement])).result.status, expected, statement);
  });
}

const actualSequenceOwner =
  'A — create and coordinate the two AITM chats: Sol 6.1/high to finish #2012, then Astra 6/high to review it. Resume #5 and #7, finish wave 4, then pause before #8 and save the handoff.';

test('actual consumer owner sequencing preserves the unchanged original wave authority', async () => {
  const { result, context, source } = await rescan([actualSequenceOwner]);
  assert.equal(result.status, 'verified');
  assert.deepEqual(context.subsequentStatements, []);
  assert.deepEqual(result.authority.source, source);
  assert.deepEqual(result.authority.scope, scope);
});

test('latest actual owner operational and future-handoff messages remain neutral', async () => {
  for (const statement of [
    'Finish Astra’s re-review, adopt the corrected runtime once approved, then drive #5 and #7 to Done. Keep all collateral committed and PRs current, then pause before #8 and save the handoff.',
    'make sure to commit all work, push to origin and merge to the feature trunk before marking them done.\n\nI have already started an agent session  named "Continue Epic #2" -- please let him know where the handoff doc is when you finish #5 + #7.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'verified', statement);
  }
});

test('explicit matching numeric-wave completion sequence defers only its attached stop', async () => {
  for (const statement of [
    'Finish wave 4, then pause.',
    'Complete rank 4, then stop.',
    'Please finish wave 4 then pause before #8 and save the handoff.',
    'Resume #5 and #7, finish wave 4, then pause before #8.',
    'When wave 4 is complete pause before #8 and save the handoff.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'verified', statement);
  }
});

test('completion sequences never conceal independent immediate or mixed withdrawals', async () => {
  for (const statement of [
    'Finish wave 4, then pause. Stop now.',
    'Stop now. Finish wave 4, then pause.',
    'Finish wave 4, then pause, but stop now.',
    'Finish wave 4, then pause and revoke epic #2 rank 4.',
    'Finish wave 4, then pause now.',
    'Finish wave 4, then stop immediately.',
    'Finish wave 4, then pause before #8. Stop parallel execution for epic #2 rank 4.',
    'Revoke epic #2 rank 4. Finish wave 4, then pause before #8.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'blocked', statement);
  }
});

test('unknown or unrelated completion predicates do not waive a matching-wave stop', async () => {
  for (const statement of [
    'Finish work, then pause epic #2 rank 4.',
    'Finish wave 5, then pause epic #2 rank 4.',
    'If CI is green, finish wave 4, then pause epic #2 rank 4.',
    'Maybe finish wave 4, then pause epic #2 rank 4.',
    'Do not finish wave 4, then pause epic #2 rank 4.',
    'Finish wave 4, then pause before tests.',
    'Finish wave 4, then pause before #4.',
    'Finish wave 4, then pause until tests pass.',
    'Finish wave 4, then pause whenever convenient.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'blocked', statement);
  }
});

test('unrelated-wave and neutral operation sequences stay independently scoped', async () => {
  for (const statement of [
    'Finish wave 5, then pause wave 5.',
    'Finish wave 4, then pause epic #3 rank 4.',
    'Finish wave 4, then stop reviewing CI. Do not start deployment.',
    'Finish wave 4, then pause before #8. Stop deployment.',
  ]) {
    assert.equal((await rescan([statement])).result.status, 'verified', statement);
  }
});

test('sequencing text cannot grant standalone or later-wave authority and source scans stay live', async () => {
  assert.equal((await rescan([], { selected: actualSequenceOwner })).result.status, 'blocked');
  assert.equal(
    (await rescan([actualSequenceOwner], { targetScope: { ...scope, rank: 5, members: [8] } }))
      .result.status,
    'blocked'
  );
  assert.equal(
    (await rescan([actualSequenceOwner], { changeHash: true })).result.status,
    'blocked'
  );
  const late = { text: 'Revoke epic #2 rank 4.', at: '2026-10-14T00:55:00.000Z' };
  assert.equal(
    (await rescan([actualSequenceOwner, late], { through: '2026-10-14T00:50:00.000Z' })).result
      .status,
    'verified'
  );
  assert.equal(
    (await rescan([actualSequenceOwner, ...Array.from({ length: 70 }, () => 'Inspect CI.'), late]))
      .result.status,
    'blocked'
  );
});
