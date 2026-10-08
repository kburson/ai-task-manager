// @story #1855
import {
  assert,
  hashBytes,
  nativeCheckboxFixture,
  observeRevision,
  parseBodyVersion,
  parseFunctionalDodKeys,
  path,
  runIssueBodyVerb,
  runPlanApprove,
  test,
  verbDodStamp,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';
import { before, after } from 'node:test';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID =
    'fixture-native-continuation-27-native-checkbox-history-survives-actual-scope-correction-and-fresh-proof';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(
    currentSessionId(),
    'fixture-native-continuation-27-native-checkbox-history-survives-actual-scope-correction-and-fresh-proof'
  );
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

test('native checkbox history survives actual Scope correction and fresh proof without resurrecting old receipt', async () => {
  const { f, label, check } = await nativeCheckboxFixture('dod');
  try {
    await check('checked');
    const original = structuredClone(f.backend.snapshot.nativeProofRecords);
    const operationFile = path.join(f.projectDir, '.ai-task-manager', 'scope-correction.json');
    writeFileSync(
      operationFile,
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expectedVersion: f.backend.observation.body.version,
        expected: 'Synthetic scope',
        replacement: 'Corrected scope',
      })
    );
    await runIssueBodyVerb(
      {
        cfg: { repo: f.context.repository },
        projectDir: f.projectDir,
        statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'),
        rest: [String(f.context.issue), '--operation-file', operationFile],
      },
      {
        revisionBackend: f.backend,
        writeDeps: {
          revisionBackend: f.backend,
          fetchBody: async () => f.backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            const next = f.backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
            next.protectedSourceBindings = next.protectedSourceBindings.map((b) =>
              b.identity === 'scope' ? { ...b, hash: hashBytes(scope) } : b
            );
            f.backend.replaceAuthority(next);
            f.backend.replacePlanning({
              ...f.backend.snapshot.planning,
              bodyHash: hashBytes(body),
            });
          },
        },
      }
    );
    f.restart();
    await assert.rejects(check('checked'), (error) => error.code === 'revision-approval-stale');
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.projectDir,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    f.restart();
    const oldEligible = await withRevisionConsumer(
      {
        repository: f.context.repository,
        issue: f.context.issue,
        backend: f.backend,
        projectDir: f.projectDir,
        activity: 'issue-write',
      },
      () =>
        parseFunctionalDodKeys(f.backend.observation.body.bytes).find(
          (item) => item.key === 'tests'
        ).evidenceMarker
    );
    assert.equal(oldEligible, null);
    await verbDodStamp({
      cfg: { repo: f.context.repository },
      projectDir: f.projectDir,
      statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'),
      rest: ['tests'],
      pexec: f.pexec,
      deps: { revisionBackend: f.backend, getLiveState: async () => 'develop' },
    });
    await check('checked');
    f.restart();
    assert.equal(
      (await observeRevision({ context: f.context, deps: f.backend })).status,
      'applied'
    );
    assert.deepEqual(f.backend.snapshot.nativeProofRecords.slice(0, 2), original);
    assert.deepEqual(
      f.backend.snapshot.nativeOrder.map((r) => r.kind),
      ['plan', 'proof', 'proof', 'source', 'plan', 'proof', 'proof']
    );
  } finally {
    f.dispose();
  }
});
