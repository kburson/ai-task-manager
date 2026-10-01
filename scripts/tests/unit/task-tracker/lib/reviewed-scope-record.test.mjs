// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  recordReviewedScope,
  validateReviewedDelta,
  parseReviewedCheckArgs,
} from '../../../../task-tracker/lib/reviewed-scope/record.mjs';
import {
  POLICY_MARKER,
  parsePointer,
  sha256,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

function fixture() {
  const authority = {
    repository: 'owner/repo',
    issue: 1859,
    worktree: '/bound/checkout',
    branch: 'codex/1859',
    head: 'b'.repeat(40),
    actor: { id: '123', login: 'owner' },
    state: 'develop',
  };
  let manifest = {
    schema: 'aitm.reviewed-scope-evidence/v1',
    ...Object.fromEntries(
      ['repository', 'issue', 'worktree', 'branch', 'head'].map((k) => [k, authority[k]])
    ),
    label: 'Inspect output',
    rationale: 'Saved operator inspection.',
    provenance: { kind: 'operator-inspection' },
    artifacts: [{ path: 'output.txt', sha256: sha256('output') }],
  };
  let bytes = Buffer.from(canonicalRecordJson(manifest) + '\n');
  let body = `## Scope\n${POLICY_MARKER}\n- [ ] Inspect output\n\n## Acceptance Criteria\n- [ ] Unrelated AC\n`;
  const comments = new Map();
  let creates = 0,
    pushes = 0,
    validations = 0;
  const deps = {
    readRecordingAuthority: async () => ({ ...authority }),
    readBoundManifest: async () => bytes,
    validateLocalEvidence: async ({ manifestBytes }) => {
      validations++;
      if (!bytes.equals(manifestBytes)) throw new Error('changed manifest');
      return { manifestDigest: sha256(bytes) };
    },
    readLiveBody: async () => body,
    readComment: async ({ commentId }) => comments.get(commentId),
    listComments: async () => [...comments.values()],
    createComment: async ({ body: payload }) => {
      creates++;
      const id = String(creates);
      const c = {
        id,
        body: payload,
        user: { id: '123' },
        issue_url: 'https://api.github.com/repos/owner/repo/issues/1859',
      };
      comments.set(id, c);
      return c;
    },
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      pushes++;
      body = next;
    },
    now: () => '2026-10-01T00:00:00.000Z',
    warn: () => {},
  };
  const ctx = {
    cfg: { repo: 'owner/repo' },
    projectDir: authority.worktree,
    issueNumber: 1859,
    deps: { reviewedScope: deps },
  };
  return {
    ctx,
    deps,
    authority,
    comments,
    get body() {
      return body;
    },
    set body(v) {
      body = v;
    },
    get creates() {
      return creates;
    },
    get pushes() {
      return pushes;
    },
    get validations() {
      return validations;
    },
    changeManifest(patch) {
      manifest = { ...manifest, ...patch };
      bytes = Buffer.from(canonicalRecordJson(manifest) + '\n');
    },
  };
}
const run = (f) =>
  recordReviewedScope({ ctx: f.ctx, label: 'Inspect output', manifestPath: 'manifest.json' });
test('initial record is installed after comment readback; equivalent checked request is fully validated no-op', async () => {
  const f = fixture();
  const result = await run(f);
  assert.equal(result.status, 'ok');
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 1);
  assert.match(f.body, /- \[x\] Inspect output <!-- aitm-reviewed-scope-evidence/);
  assert.match(f.body, /- \[ \] Unrelated AC/);
  const original = f.body;
  const before = f.validations;
  assert.equal((await run(f)).status, 'no-op');
  assert.equal(f.body, original);
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 1);
  assert.ok(f.validations > before);
});
test('uncheck retains pointer; validated recheck reuses its original record', async () => {
  const f = fixture();
  await run(f);
  const pointer = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output')));
  f.body = f.body.replace('- [x] Inspect output', '- [ ] Inspect output');
  await run(f);
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 2);
  assert.deepEqual(
    parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output'))),
    pointer
  );
});
test('changed request refreshes checked target in one lineage with predecessor', async () => {
  const f = fixture();
  await run(f);
  const before = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output')));
  f.changeManifest({ head: 'c'.repeat(40) });
  f.authority.head = 'c'.repeat(40);
  await run(f);
  const after = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output')));
  assert.equal(f.creates, 2);
  assert.equal(after.lineage, before.lineage);
  assert.notEqual(after.commentId, before.commentId);
});
test('body failure preserves orphan and retry reconciles it before another create', async () => {
  const f = fixture();
  const push = f.deps.pushBody;
  f.deps.pushBody = async () => {
    throw new Error('network failed');
  };
  await assert.rejects(run(f), /network failed/);
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 0);
  f.deps.pushBody = push;
  await run(f);
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 1);
});
test('manifest mutation after comment creation refuses body write, even for checked no-op', async () => {
  const f = fixture();
  const create = f.deps.createComment;
  f.deps.createComment = async (x) => {
    const c = await create(x);
    f.changeManifest({ rationale: 'Changed after recording.' });
    return c;
  };
  await assert.rejects(run(f));
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 0);
});
test('generic writes cannot fabricate/remove/move pointer, or bypass recheck with unverified hatch', async () => {
  const f = fixture();
  await run(f);
  const original = f.body;
  for (const mutate of [
    (b) => b.replace(/ <!-- aitm-reviewed-scope-evidence[^\n]+/, ''),
    (b) => b.replace(/(<!-- aitm-reviewed-scope-evidence[^\n]+)/, '$1 $1'),
  ]) {
    await assert.rejects(
      mutateIssueBody({
        issueNumber: 1859,
        repo: 'owner/repo',
        mutate,
        deps: f.deps,
        allowMarkerLoss: true,
        allowUnverifiedTicks: true,
      })
    );
    assert.equal(f.body, original);
  }
  const marker = original.match(/<!-- aitm-reviewed-scope-evidence[^\n]+/)[0];
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 1859,
      repo: 'owner/repo',
      mutate: (b) => b.replace(' ' + marker, '').replace('Unrelated AC', 'Unrelated AC ' + marker),
      deps: f.deps,
      allowUnverifiedTicks: true,
    })
  );
  f.body = original.replace('- [x] Inspect output', '- [ ] Inspect output');
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 1859,
      repo: 'owner/repo',
      mutate: (b) => b.replace('- [ ] Inspect output', '- [x] Inspect output'),
      deps: f.deps,
      allowUnverifiedTicks: true,
    })
  );
});
test('generic policy changes and malformed reviewed prefixes stay protected', () => {
  const base = `## Scope\n${POLICY_MARKER}\n- [ ] Work\n`;
  assert.throws(() => validateReviewedDelta(base, base.replace(POLICY_MARKER, '')));
  assert.throws(() =>
    validateReviewedDelta(base, base.replace(POLICY_MARKER, POLICY_MARKER + '\n' + POLICY_MARKER))
  );
  assert.throws(() => validateReviewedDelta('## Scope\n- [ ] Work\n', base));
  const malformed = '## Scope\n- [ ] Work <!-- aitm-reviewed-scope-evidence broken -->\n';
  assert.throws(() => validateReviewedDelta(malformed, '## Scope\n- [ ] Work\n'));
  assert.equal(validateReviewedDelta(base, base.replace('Work', 'Other work')), null);
});
test('reviewed options reject all unsupported mixtures before I/O', () => {
  assert.deepEqual(
    parseReviewedCheckArgs(['Inspect output', '--reviewed-evidence', 'manifest.json'], 'checked'),
    { label: 'Inspect output', manifestPath: 'manifest.json' }
  );
  assert.equal(parseReviewedCheckArgs(['ordinary'], 'checked'), null);
  for (const args of [
    ['a', 'b', '--reviewed-evidence', 'x'],
    ['a', '--reviewed-evidence'],
    ['a', '--reviewed-evidence', 'x', '--label', 'b'],
    ['a', '--reviewed-evidence', 'x', '--allow-unverified-ticks'],
    ['a', '--reviewed-evidence', 'x', '--unknown'],
    ['deep dive complete', '--reviewed-evidence', 'x'],
    ['discussion complete', '--reviewed-evidence', 'x'],
    ['a', '--reviewed-evidence', 'x', '--reviewed-evidence', 'x'],
  ])
    assert.throws(() => parseReviewedCheckArgs(args, 'checked'));
  assert.throws(() => parseReviewedCheckArgs(['a', '--reviewed-evidence', 'x'], 'unchecked'));
});
test('fresh unrelated edit survives; same-target concurrent successor refuses without a body write', async () => {
  const f = fixture();
  const create = f.deps.createComment;
  f.deps.createComment = async (x) => {
    const c = await create(x);
    f.body = f.body.replace('Unrelated AC', 'Edited unrelated AC');
    return c;
  };
  await run(f);
  assert.match(f.body, /Edited unrelated AC/);
  assert.equal(f.pushes, 1);
  const g = fixture();
  const create2 = g.deps.createComment;
  g.deps.createComment = async (x) => {
    const c = await create2(x);
    g.body = g.body.replace('Inspect output', 'Changed target');
    return c;
  };
  await assert.rejects(run(g));
  assert.equal(g.creates, 1);
  assert.equal(g.pushes, 0);
});
test('CAS retry rebases unrelated changes and repeats validation', async () => {
  const f = fixture();
  let attempts = 0;
  f.deps.pushBody = async (_repo, _issue, next) => {
    attempts++;
    f.body = attempts === 1 ? f.body.replace('Unrelated AC', 'Concurrent AC') : next;
  };
  const result = await run(f);
  assert.equal(result.attempts, 2);
  assert.equal(attempts, 2);
  assert.equal(f.creates, 1);
  assert.match(f.body, /Concurrent AC/);
  assert.ok(f.validations >= 4);
});
test('recording preflight refusals create no comment', async () => {
  for (const change of [
    (f) => {
      f.body = f.body.replace('Inspect output', 'Different label');
    },
    (f) => {
      f.body += '\n- [ ] Inspect output\n';
    },
    (f) => {
      f.body = f.body.replace('Inspect output', 'Inspect output vc:1');
    },
    (f) => {
      f.body += '\n' + 'z'.repeat(60000);
    },
    (f) => {
      f.changeManifest({ label: 'Other label' });
    },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(run(f));
    assert.equal(f.creates, 0);
    assert.equal(f.pushes, 0);
  }
});
test('authority or comment changes after create refuse before write', async () => {
  const f = fixture();
  let reads = 0;
  f.deps.readRecordingAuthority = async () => ({
    ...f.authority,
    head: ++reads === 1 ? f.authority.head : 'f'.repeat(40),
  });
  await assert.rejects(run(f));
  assert.equal(f.pushes, 0);
  const g = fixture();
  let reads2 = 0;
  const read = g.deps.readComment;
  g.deps.readComment = async (x) => {
    const c = await read(x);
    return ++reads2 === 1 ? c : { ...c, body: c.body + 'edited' };
  };
  await assert.rejects(run(g));
  assert.equal(g.pushes, 0);
});
test('same-target content edit keeps pointer but requires a new validated record', async () => {
  const f = fixture();
  await run(f);
  const before = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output')));
  await mutateIssueBody({
    issueNumber: 1859,
    repo: 'owner/repo',
    deps: f.deps,
    mutate: (b) => b.replace('Inspect output', 'Inspect saved output'),
  });
  f.changeManifest({ label: 'Inspect saved output' });
  await recordReviewedScope({
    ctx: f.ctx,
    label: 'Inspect saved output',
    manifestPath: 'manifest.json',
  });
  const after = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect saved output')));
  assert.equal(after.lineage, before.lineage);
  assert.notEqual(after.commentId, before.commentId);
});
test('generic capability-shaped objects cannot authorize reviewed writes', async () => {
  const f = fixture();
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 1859,
      repo: 'owner/repo',
      deps: f.deps,
      reviewedEvidenceCapability: { targetDigest: 'a'.repeat(64) },
      allowUnverifiedTicks: true,
      mutate: (b) =>
        b.replace('Inspect output', 'Inspect output <!-- aitm-reviewed-scope-evidence broken -->'),
    })
  );
  assert.equal(f.pushes, 0);
});
test('same-target successor observed during async fresh validation is not overwritten', async () => {
  const f = fixture();
  let reads = 0;
  const read = f.deps.readLiveBody;
  f.deps.readLiveBody = async () => {
    if (++reads === 2) f.body = f.body.replace('Inspect output', 'Successor target');
    return read();
  };
  await assert.rejects(run(f));
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 0);
  assert.match(f.body, /Successor target/);
});
test('generic async mutation cannot bypass reviewed marker protection', async () => {
  const f = fixture();
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 1859,
      repo: 'owner/repo',
      deps: f.deps,
      allowUnverifiedTicks: true,
      mutate: async (b) =>
        b.replace('Inspect output', 'Inspect output <!-- aitm-reviewed-scope-evidence broken -->'),
    })
  );
  assert.equal(f.pushes, 0);
});
test('whitespace cannot bypass special-label exclusion; manifest uses exact visible label', async () => {
  assert.throws(() =>
    parseReviewedCheckArgs([' deep dive complete ', '--reviewed-evidence', 'x'], 'checked')
  );
  const f = fixture();
  f.changeManifest({ label: 'Inspect output <!-- extra -->' });
  await assert.rejects(
    recordReviewedScope({
      ctx: f.ctx,
      label: 'Inspect output <!-- extra -->',
      manifestPath: 'manifest.json',
    })
  );
  assert.equal(f.creates, 0);
});
test('recording refuses phase-owned lifecycle and special-label targets before comments', async () => {
  for (const label of [
    'Agent Review Passed',
    'Final Review Passed',
    'Passed final human review',
    'Story closed and moved to Done',
    'Timing data flushed to issue',
    'Deep dive complete',
    'Discussion complete',
  ]) {
    const f = fixture();
    f.body = f.body.replace('Inspect output', label);
    f.changeManifest({ label });
    await assert.rejects(
      recordReviewedScope({ ctx: f.ctx, label, manifestPath: 'manifest.json' }),
      { code: 'reviewed-scope-target' }
    );
    assert.equal(f.creates, 0);
    assert.equal(f.pushes, 0);
  }
});
test('recording refuses copied lineage before creating a successor', async () => {
  const f = fixture();
  await run(f);
  const pointer = parsePointer(f.body.split('\n').find((x) => x.includes('Inspect output')));
  f.body = f.body.replace(
    '## Acceptance Criteria',
    '- [ ] Other target ' +
      `<!-- aitm-reviewed-scope-evidence comment="${pointer.commentId}" sha256="${pointer.sha256}" lineage="${pointer.lineage}" -->` +
      '\n## Acceptance Criteria'
  );
  f.changeManifest({ rationale: 'A new request must not continue a copied lineage.' });
  await assert.rejects(run(f), { code: 'reviewed-scope-pointer-duplicate' });
  assert.equal(f.creates, 1);
  assert.equal(f.pushes, 1);
});
