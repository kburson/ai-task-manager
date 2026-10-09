// @story #1855
// cspell:words nonstring
import test from 'node:test';
import assert from 'node:assert/strict';

const stage =
  await import('../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );

const original =
  '<!-- aitm-last-known-state state="develop" ts="2026-10-06T09:00:00.000Z" -->\n## Scope\nKeep this text.\n\n<!-- aitm-body-version version="4" -->\n';

const after =
  '<!-- aitm-last-known-state state="test" ts="2026-10-06T10:00:00.010Z" -->\n## Scope\nKeep this text.\n\n## AITM Progress Markers\n\n<!-- aitm-entered-test ts="2026-10-06T10:00:00.000Z" move="move-124-test" -->\n\n<!-- aitm-body-version version="5" -->\n';

function fixture() {
  const previous = 'sha256:' + '1'.repeat(64);
  return {
    repository: 'o/r',
    issue: 124,
    transitionId: 'move-124-test',
    body: original,
    ordinal: 10,
    previous,
    step: {
      ordinal: 10,
      previous,
      kind: 'entry-body',
      intent: {
        entryTs: '2026-10-06T10:00:00.000Z',
        stateTs: '2026-10-06T10:00:00.010Z',
        visit: 1,
      },
      readback: {
        request: {
          file: 'gh',
          args: ['issue', 'view', '124', '-R', 'o/r', '--json', 'body', '-q', '.body'],
        },
        response: { stdout: after, stderr: '', exitCode: 0 },
        resource: {
          request: { file: 'gh', args: ['issue', 'view', '124', '-R', 'o/r', '--json', 'body'] },
          response: { stdout: JSON.stringify({ body: after }), stderr: '', exitCode: 0 },
        },
      },
    },
  };
}

test('native stage body step derives exact fixed effect and original subject readback without admitting execution', () => {
  const input = fixture(),
    copy = structuredClone(input);
  const result = stage.reconstructNativeStageBodyStep(input);
  assert.equal(result.afterBody, after);
  assert.equal(result.readbackBody, after);
  assert.match(result.stepHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result).sort(), ['afterBody', 'readbackBody', 'stepHash']);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(input, copy);
  input.step.readback = null;
  const pending = stage.reconstructNativeStageBodyStep(input);
  assert.equal(pending.afterBody, after);
  assert.equal(pending.readbackBody, null, 'sealed intent alone does not establish readback');
  assert.notEqual(pending.stepHash, result.stepHash);
});

for (const [name, change] of [
  [
    'ordinal',
    (x) => {
      x.step.ordinal++;
    },
  ],
  [
    'predecessor',
    (x) => {
      x.step.previous = 'sha256:' + '2'.repeat(64);
    },
  ],
  [
    'kind',
    (x) => {
      x.step.kind = 'arbitrary-body';
    },
  ],
  [
    'intent bytes',
    (x) => {
      x.step.intent.afterBody = 'forged';
    },
  ],
  [
    'visit',
    (x) => {
      x.step.intent.visit = 2;
    },
  ],
  [
    'foreign issue',
    (x) => {
      x.step.readback.request.args[2] = '125';
    },
  ],
  [
    'foreign repository',
    (x) => {
      x.step.readback.request.args[4] = 'foreign/repo';
    },
  ],
  [
    'failed read',
    (x) => {
      x.step.readback.response.exitCode = 1;
    },
  ],
  [
    'partial read',
    (x) => {
      x.step.readback.response.stderr = 'partial';
    },
  ],
  [
    'unrelated body',
    (x) => {
      x.step.readback.response.stdout = after.replace('Keep this text.', 'Changed scope.');
    },
  ],
  [
    'forged version',
    (x) => {
      x.step.readback.response.stdout = after.replace('version="5"', 'version="6"');
    },
  ],
  [
    'success scalar',
    (x) => {
      x.step.readback.ok = true;
    },
  ],
  [
    'caller callback',
    (x) => {
      x.read = () => after;
    },
  ],
])
  test('native stage body step refuses ' + name + ' drift', () => {
    const input = fixture();
    change(input);
    assert.throws(
      () => stage.reconstructNativeStageBodyStep(input),
      /criteria-revision:native-stage-body-step/
    );
  });
import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { writeMoveCompleteMarker } from '../../../../../task-tracker/lib/move-state/sentinel.mjs';

test('native stage body readback retains CLI suffix while matching actual native write verification', async () => {
  let remote = original;
  let pushed = null;
  const ts = '2026-10-06T10:01:00.000Z';
  const actual = await versionedWriteBody({
    repo: 'o/r',
    issueNumber: 124,
    mutate: (base) => writeMoveCompleteMarker(base, 'test', ts, 'move-124-test'),
    deps: {
      fetchBody: async () => remote + '\n',
      pushBody: async (_repo, _issue, body) => {
        remote = body;
        pushed = body;
      },
    },
  });
  assert.equal(actual.status, 'ok');
  assert.equal(actual.body, pushed + '\n');
  const input = fixture();
  input.step.kind = 'sentinel-body';
  input.step.intent = { ts };
  input.step.readback.response.stdout = actual.body;
  input.step.readback.resource.response.stdout = JSON.stringify({ body: pushed });
  const reconstructed = stage.reconstructNativeStageBodyStep(input);
  assert.equal(reconstructed.afterBody, pushed);
  assert.equal(reconstructed.readbackBody, pushed);
});

for (const [name, change] of [
  [
    'missing resource',
    (x) => {
      delete x.step.readback.resource;
    },
  ],
  [
    'resource foreign issue',
    (x) => {
      x.step.readback.resource.request.args[2] = '125';
    },
  ],
  [
    'resource failed read',
    (x) => {
      x.step.readback.resource.response.exitCode = 1;
    },
  ],
  [
    'resource partial read',
    (x) => {
      x.step.readback.resource.response.stderr = 'partial';
    },
  ],
  [
    'malformed resource',
    (x) => {
      x.step.readback.resource.response.stdout = '{';
    },
  ],
  [
    'resource extra key',
    (x) => {
      x.step.readback.resource.response.stdout = JSON.stringify({ body: after, ok: true });
    },
  ],
  [
    'resource trailing byte drift',
    (x) => {
      x.step.readback.resource.response.stdout = JSON.stringify({ body: after + '\n' });
    },
  ],
  [
    'coherent raw resource delta',
    (x) => {
      const changed = after.replace('Keep this text.', 'Changed scope.');
      x.step.readback.response.stdout = changed + '\n';
      x.step.readback.resource.response.stdout = JSON.stringify({ body: changed });
    },
  ],
])
  test('native stage body readback refuses ' + name, () => {
    const input = fixture();
    change(input);
    assert.throws(
      () => stage.reconstructNativeStageBodyStep(input),
      /criteria-revision:native-stage-body-step/
    );
  });
import {
  writeTransitionCommit,
  renderTransitionCommitComment,
} from '../../../../../task-tracker/lib/move-state/transition-commit.mjs';
import { fingerprint } from '../../../../../task-tracker/lib/resident-action-ledger-codec.mjs';

async function transitionFixture() {
  const visitMarker =
    '<!-- aitm-entered-test ts="2026-10-06T10:00:00.000Z" move="move-124-test" -->';
  const sentinelMarker =
    '<!-- aitm-move-complete state=test ts=2026-10-06T10:01:00.000Z move=move-124-test -->';
  const calls = [];
  let published;
  const result = await writeTransitionCommit(
    {
      cfg: { repo: 'o/r' },
      issueArg: 124,
      transitionId: 'move-124-test',
      resolvedFromState: 'develop',
      stateArg: 'test',
      actor: 'native-actor',
      pexec: async (file, args) => {
        let response;
        if (args[2] === '--method') {
          published = args[5].slice(5);
          response = {
            id: 771,
            body: published,
            issue_url: 'https://api.github.com/repos/o/r/issues/124',
            node_id: 'IC_fixture',
          };
        } else
          response = {
            id: 771,
            body: published,
            issue_url: 'https://api.github.com/repos/o/r/issues/124',
            node_id: 'IC_fixture',
          };
        const raw = { stdout: JSON.stringify(response), stderr: '', exitCode: 0 };
        calls.push({ request: { file, args }, response: raw });
        return raw;
      },
    },
    { visitMarker, sentinelMarker }
  );
  assert.equal(result.record.actor, 'native-actor');
  assert.equal(result.record.sentinelFingerprint, fingerprint(sentinelMarker));
  assert.equal(result.commentId, '771');
  assert.equal(calls.length, 2);
  const previous = 'sha256:' + '1'.repeat(64);
  return {
    repository: 'o/r',
    issue: 124,
    transitionId: 'move-124-test',
    actor: 'native-actor',
    visitMarker,
    sentinelMarker,
    ordinal: 15,
    previous,
    step: {
      ordinal: 15,
      previous,
      kind: 'transition-comment',
      intent: { record: structuredClone(result.record) },
      readback: { create: calls[0], read: calls[1] },
    },
  };
}

test('native stage transition step reconstructs actual native publication requests and exact record readback', async () => {
  const input = await transitionFixture();
  const result = stage.reconstructNativeStageTransitionStep(input);
  assert.equal(result.commentId, '771');
  assert.equal(result.body, JSON.parse(input.step.readback.read.response.stdout).body);
  assert.match(result.stepHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result).sort(), ['body', 'commentId', 'stepHash']);
  assert.ok(Object.isFrozen(result));
  input.step.readback = null;
  assert.equal(stage.reconstructNativeStageTransitionStep(input).commentId, null);
});

for (const [name, change] of [
  [
    'extra record key',
    (x) => {
      x.step.intent.record.savedReady = true;
    },
  ],
  [
    'foreign actor',
    (x) => {
      x.step.intent.record.actor = 'other';
    },
  ],
  [
    'foreign sentinel',
    (x) => {
      x.sentinelMarker += 'changed';
    },
  ],
  [
    'foreign visit',
    (x) => {
      x.visitMarker += 'changed';
    },
  ],
  [
    'ordinal',
    (x) => {
      x.step.ordinal++;
    },
  ],
  [
    'predecessor',
    (x) => {
      x.step.previous = 'sha256:' + '2'.repeat(64);
    },
  ],
  [
    'foreign POST issue',
    (x) => {
      x.step.readback.create.request.args[1] = 'repos/o/r/issues/125/comments';
    },
  ],
  [
    'foreign read comment',
    (x) => {
      x.step.readback.read.request.args[1] = 'repos/o/r/issues/comments/772';
    },
  ],
  [
    'partial POST',
    (x) => {
      x.step.readback.create.response.stderr = 'partial';
    },
  ],
  [
    'failed read',
    (x) => {
      x.step.readback.read.response.exitCode = 1;
    },
  ],
  [
    'foreign owner',
    (x) => {
      const v = JSON.parse(x.step.readback.read.response.stdout);
      v.issue_url = 'https://api.github.com/repos/o/r/issues/125';
      x.step.readback.read.response.stdout = JSON.stringify(v);
    },
  ],
  [
    'read id mismatch',
    (x) => {
      const v = JSON.parse(x.step.readback.read.response.stdout);
      v.id = 772;
      x.step.readback.read.response.stdout = JSON.stringify(v);
    },
  ],
  [
    'same id different record',
    (x) => {
      const v = JSON.parse(x.step.readback.read.response.stdout);
      v.body = renderTransitionCommitComment({ ...x.step.intent.record, actor: 'other' });
      x.step.readback.read.response.stdout = JSON.stringify(v);
    },
  ],
  [
    'success scalar',
    (x) => {
      x.step.readback.verified = true;
    },
  ],
])
  test('native stage transition step refuses ' + name, async () => {
    const input = await transitionFixture();
    change(input);
    assert.throws(
      () => stage.reconstructNativeStageTransitionStep(input),
      /criteria-revision:native-stage-transition-step/
    );
  });

test('ordinary transition default transport keeps receiver getter argument and stdout order', async () => {
  const events = [];
  let body;
  const cfg = {
    get repo() {
      events.push('repo');
      return 'o/r';
    },
  };
  const ctx = {
    cfg,
    get issueArg() {
      events.push('issue');
      return '124';
    },
    resolvedFromState: 'develop',
    stateArg: 'test',
    actor: 'ordinary-fixture',
    transitionId: 'move:ordinary-order',
    get pexec() {
      events.push('pexec');
      return function (file, args, options) {
        assert.equal(this, ctx);
        assert.equal(file, 'gh');
        assert.deepEqual(options, { timeout: 15000 });
        const create = args.includes('POST');
        events.push(create ? 'create' : 'read');
        if (create) body = args.at(-1).slice(5);
        else assert.deepEqual(args, ['api', 'repos/o/r/issues/comments/771']);
        return Promise.resolve({
          get stdout() {
            events.push(create ? 'create-stdout' : 'read-stdout');
            return JSON.stringify({ id: 771, body });
          },
        });
      };
    },
  };
  const result = await writeTransitionCommit(ctx, {
    visitMarker: 'visit',
    sentinelMarker: 'sentinel',
  });
  assert.equal(result.verified, true);
  assert.equal(result.commentId, '771');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.record), true);
  assert.deepEqual(events, [
    'repo',
    'issue',
    'pexec',
    'repo',
    'issue',
    'create',
    'create-stdout',
    'pexec',
    'repo',
    'read',
    'read-stdout',
  ]);
});

test('ordinary transition create rejection remains the exact original error and prevents read', async () => {
  const error = new Error('ordinary original create failure'),
    calls = [];
  const ctx = {
    cfg: { repo: 'o/r' },
    issueArg: '124',
    resolvedFromState: 'develop',
    stateArg: 'test',
    actor: 'fixture',
    transitionId: 'move:ordinary-failure',
    deps: {
      createTransitionComment: async () => {
        calls.push('create');
        throw error;
      },
      readTransitionComment: async () => {
        calls.push('read');
      },
    },
  };
  await assert.rejects(
    writeTransitionCommit(ctx, { visitMarker: 'visit', sentinelMarker: 'sentinel' }),
    (actual) => actual === error
  );
  assert.deepEqual(calls, ['create']);
});
