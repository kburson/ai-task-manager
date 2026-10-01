// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRecord,
  requestDigest,
  lineageDigest,
  encodeRecord,
  serializePointer,
  sha256,
  POLICY_MARKER,
  ReviewedScopeError,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
import { evaluateReviewedScope } from '../../../../task-tracker/lib/reviewed-scope/readiness.mjs';
import { testExitReviewedScopeGuard } from '../../../../task-tracker/lib/test-exit-reviewed-scope-guard.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../task-tracker/lib/github-records/issue-directory.mjs';
function fixture({ policy = false, checked = true, pointer = true } = {}) {
  const authority = {
    repository: 'owner/repo',
    issue: 1859,
    worktree: '/bound',
    branch: 'codex/1859',
    head: 'a'.repeat(40),
    state: 'review',
  };
  const manifest = {
    schema: 'aitm.reviewed-scope-evidence/v1',
    repository: authority.repository,
    issue: 1859,
    worktree: authority.worktree,
    branch: authority.branch,
    head: authority.head,
    label: 'Inspect output',
    provenance: { kind: 'operator-inspection' },
    rationale: 'Inspected the saved bytes.',
    artifacts: [{ path: 'evidence.txt', sha256: sha256('evidence') }],
  };
  const targetDigest = sha256('Inspect output');
  const record = makeRecord({
    manifest,
    targetDigest,
    requestDigest: requestDigest({ manifest, targetDigest }),
    lineage: lineageDigest({ repository: authority.repository, issue: 1859, targetDigest }),
    predecessor: null,
    actor: { id: '42', login: 'old-owner' },
    recordedAt: '2026-10-01T00:00:00.000Z',
  });
  const encoded = encodeRecord(record);
  const ptr = { commentId: '99', sha256: encoded.sha256, lineage: record.lineage };
  let reads = 0,
    artifacts = 0,
    contexts = 0;
  const comment = {
    id: '99',
    body: encoded.commentBody,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/1859',
    user: { id: '42', login: 'renamed' },
  };
  const deps = {
    readEvidenceContext: async (args) => {
      contexts++;
      assert.equal(args.projectDir, '/bound');
      assert.equal(args.invokingDir, '/bound');
      assert.deepEqual(args.cfg, { repo: 'owner/repo' });
      return authority;
    },
    readComment: async () => {
      reads++;
      return comment;
    },
    validateArtifacts: async (args) => {
      artifacts++;
      assert.deepEqual(args.manifest, manifest);
      assert.equal(Object.hasOwn(args, 'manifestPath'), false);
      return manifest.artifacts;
    },
  };
  return {
    body: `## Scope\n${policy ? POLICY_MARKER + '\n' : ''}- [${checked ? 'x' : ' '}] Inspect output${pointer ? ' ' + serializePointer(ptr) : ''}\n`,
    repository: 'owner/repo',
    issue: 1859,
    projectDir: '/bound',
    invokingDir: '/bound',
    lifecycleEvidence: { acceptedTest: { head: authority.head } },
    deps,
    authority,
    manifest,
    record,
    comment,
    ptr,
    get reads() {
      return reads;
    },
    get artifacts() {
      return artifacts;
    },
    get contexts() {
      return contexts;
    },
  };
}
for (const name of ['web tick', 'hatch tick', 'old generated tick', 'unchecked legacy'])
  test(`${name} preserves unadopted legacy behavior without evidence I/O`, async () => {
    const f = fixture({ pointer: false, checked: name !== 'unchecked legacy' });
    if (name === 'hatch tick')
      f.body = f.body.replace(
        'Inspect output',
        'Inspect output <!-- aitm-unverified-tick reason="inspection" -->'
      );
    if (name === 'old generated tick') f.body += 'Generated-by: split-plan\n';
    f.projectDir = undefined;
    f.invokingDir = undefined;
    assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
    assert.equal(f.contexts + f.reads + f.artifacts, 0);
  });
test('explicit current record always validates retained manifest and files despite accepted Test', async () => {
  const f = fixture();
  assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
  assert.equal(f.reads, 1);
  assert.equal(f.artifacts, 1);
});
for (const checked of [false, true])
  test(`adopted policy ${checked ? 'proofless checked' : 'unchecked'} narrative blocks without a current record`, async () => {
    const f = fixture({ policy: true, pointer: false, checked });
    const result = await evaluateReviewedScope(f);
    assert.equal(result.ok, false);
    assert.equal(result.blockers[0].code, 'reviewed-scope-current-missing');
    assert.equal(result.blockers[0].label, 'Inspect output');
    assert.equal(f.reads + f.artifacts, 0);
  });
test('unchecked explicit target validates its current record then blocks', async () => {
  const f = fixture({ checked: false });
  const result = await evaluateReviewedScope(f);
  assert.equal(result.blockers[0].code, 'reviewed-scope-current-missing');
  assert.equal(f.reads, 1);
  assert.equal(f.artifacts, 1);
});
test('policy machine-bearing targets remain owned by the existing machine route', async () => {
  const f = fixture({ policy: true, pointer: false });
  f.body = f.body.replace(
    'Inspect output',
    'Inspect output <!-- aitm-verified cmd="node test.mjs" -->'
  );
  assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
  assert.equal(f.contexts + f.reads + f.artifacts, 0);
});
for (const [name, change, code] of [
  [
    'wrong section',
    (f) => {
      f.body = f.body.replace('## Scope', '## Scope\n\n## Acceptance Criteria');
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'verifier target pointer',
    (f) => {
      f.body = f.body.replace(
        'Inspect output',
        'Inspect output <!-- aitm-verified cmd="node test.mjs" -->'
      );
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'malformed pointer',
    (f) => {
      f.body = f.body.replace('comment="99"', 'comment="0"');
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'changed target bytes',
    (f) => {
      f.body = f.body.replace('Inspect output', 'Inspect changed output');
    },
    'reviewed-scope-stale',
  ],
  [
    'changed branch',
    (f) => {
      f.authority.branch = 'changed';
    },
    'reviewed-scope-stale',
  ],
  [
    'changed HEAD',
    (f) => {
      f.authority.head = 'b'.repeat(40);
    },
    'reviewed-scope-stale',
  ],
  [
    'wrong comment author',
    (f) => {
      f.comment.user.id = '43';
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'edited current comment',
    (f) => {
      f.comment.body += '\n';
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'deleted current comment',
    (f) => {
      f.deps.readComment = async () => {
        throw Object.assign(new Error('deleted'), { status: 404 });
      };
    },
    'reviewed-scope-current-missing',
  ],
  [
    'rate-limited read',
    (f) => {
      f.deps.readComment = async () => {
        throw Object.assign(new Error('rate limited'), { status: 403 });
      };
    },
    'reviewed-scope-read-unavailable',
  ],
  [
    'changed artifact bytes',
    (f) => {
      f.deps.validateArtifacts = async () => {
        throw new ReviewedScopeError('reviewed-scope-artifact-digest');
      };
    },
    'reviewed-scope-stale',
  ],
  [
    'unavailable artifact reader',
    (f) => {
      f.deps.validateArtifacts = async () => {
        throw new Error('I/O unavailable');
      };
    },
    'reviewed-scope-read-unavailable',
  ],
  [
    'non-bound checkout',
    (f) => {
      f.deps.readEvidenceContext = async () => {
        throw new ReviewedScopeError('reviewed-scope-worktree', 'bound worktree /canonical/bound');
      };
    },
    'reviewed-scope-wrong-checkout',
  ],
  [
    'missing invokingDir',
    (f) => {
      delete f.invokingDir;
    },
    'reviewed-scope-read-unavailable',
  ],
])
  test(`readiness distinguishes ${name}`, async () => {
    const f = fixture();
    change(f);
    const result = await evaluateReviewedScope(f);
    assert.equal(result.ok, false);
    assert.equal(result.blockers[0].code, code);
    assert.equal(typeof result.blockers[0].label, 'string');
    assert.match(result.blockers[0].reason, /ensureChecked|authoritative context/);
    if (name === 'non-bound checkout') assert.match(result.blockers[0].reason, /canonical\/bound/);
  });
test('directory lane returns before parser or any evidence read', async () => {
  const f = fixture();
  f.body =
    renderIssueDirectory(
      createIssueDirectory({
        issueNodeId: 'I_1',
        singletons: {
          'delivery-contract': 'C_1',
          coordination: 'C_2',
          'evidence-projection': 'C_3',
          timing: 'C_4',
        },
      })
    ) +
    '\n## Scope\n' +
    POLICY_MARKER +
    '\n- [x] broken <!-- aitm-reviewed-scope-evidence bad -->';
  assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
  assert.equal(f.contexts + f.reads + f.artifacts, 0);
});
test('fenced and multiline-comment examples are inert even without root Scope', async () => {
  for (const body of [
    '```md\n' + POLICY_MARKER + '\n<!-- aitm-reviewed-scope-evidence broken -->\n```',
    '<!-- example\n' + POLICY_MARKER + '\n-->',
  ]) {
    const f = fixture();
    f.body = body;
    assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
    assert.equal(f.contexts + f.reads + f.artifacts, 0);
  }
});
test('guard preserves typed blocker args and remediation without accepted-Test bypass', async () => {
  const f = fixture({ policy: true, pointer: false });
  const result = await testExitReviewedScopeGuard.run({
    body: f.body,
    cfg: { repo: f.repository },
    issueNumber: f.issue,
    projectDir: f.projectDir,
    invokingDir: f.invokingDir,
    lifecycleEvidence: f.lifecycleEvidence,
    deps: { reviewedScope: f.deps },
    toState: 'review',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.refusals.map((x) => x.code),
    ['reviewed-scope-current-missing']
  );
  assert.equal(result.refusals[0].args.label, 'Inspect output');
  assert.equal(result.refusals[0].args.reason, result.reason);
  assert.deepEqual(result.refusals[0].noAutomaticRemediation, {
    reason: 'operator-reviewed-evidence-required',
  });
  assert.equal(Object.hasOwn(result, 'typedRefusals'), false);
  assert.deepEqual(await testExitReviewedScopeGuard.run({ toState: 'done' }), { ok: true });
});
test('copying a current pointer to another checkbox refuses duplicate lineage', async () => {
  const f = fixture();
  f.body += f.body.split('\n')[1] + '\n';
  const evaluated = await evaluateReviewedScope(f);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.blockers[0].code, 'reviewed-scope-comment-invalid');
  assert.equal(f.reads + f.artifacts, 0);
});
test('unadopted legacy text has no new parser obligations', async () => {
  const f = fixture({ pointer: false });
  f.body = 'Old legacy content\n```example without closing fence';
  assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
  assert.equal(f.contexts + f.reads + f.artifacts, 0);
});
test('adopted target must have one visible label across all live issue checkboxes', async () => {
  for (const extra of [
    '- [ ] Inspect output',
    '  - [X] Inspect output',
    '## Acceptance Criteria\n- [ ] Inspect output',
  ]) {
    const f = fixture();
    f.body += extra + '\n';
    const evaluated = await evaluateReviewedScope(f);
    assert.equal(evaluated.ok, false);
    assert.equal(evaluated.blockers[0].code, 'reviewed-scope-comment-invalid');
    assert.equal(evaluated.blockers[0].label, 'Inspect output');
    assert.equal(f.reads + f.artifacts, 0);
  }
});
test('record-retained manifest label must equal the current visible target label', async () => {
  const f = fixture();
  const old = serializePointer(f.ptr);
  f.manifest.label = 'Another visible label';
  f.record.requestDigest = requestDigest({
    manifest: f.manifest,
    targetDigest: f.record.targetDigest,
  });
  const encoded = encodeRecord(f.record);
  f.comment.body = encoded.commentBody;
  f.ptr.sha256 = encoded.sha256;
  f.body = f.body.replace(old, serializePointer(f.ptr));
  const evaluated = await evaluateReviewedScope(f);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.blockers[0].code, 'reviewed-scope-stale');
  assert.equal(evaluated.blockers[0].label, 'Inspect output');
  assert.equal(f.artifacts, 0);
});
for (const label of [
  'Agent Review Passed',
  'Final Review Passed',
  'Passed final human review',
  'Story closed and moved to Done',
  'Timing data flushed to issue',
  'Deep dive complete',
  'Discussion complete',
]) {
  test(`policy does not adopt phase-owned ${label}`, async () => {
    const f = fixture({ policy: true, pointer: false, checked: false });
    f.body = f.body.replace('Inspect output', label);
    assert.deepEqual(await evaluateReviewedScope(f), { ok: true, blockers: [] });
    assert.equal(f.contexts + f.reads + f.artifacts, 0);
  });
  test(`explicit reviewed pointer refuses phase-owned ${label}`, async () => {
    const f = fixture();
    f.body = f.body.replace('Inspect output', label);
    const evaluated = await evaluateReviewedScope(f);
    assert.equal(evaluated.ok, false);
    assert.equal(evaluated.blockers[0].code, 'reviewed-scope-comment-invalid');
    assert.equal(evaluated.blockers[0].label, label);
    assert.equal(f.reads + f.artifacts, 0);
  });
}
test('guard accepts the actual registry repo context field', async () => {
  const f = fixture({ policy: true, pointer: false });
  const evaluated = await testExitReviewedScopeGuard.run({
    body: f.body,
    repo: f.repository,
    issueNumber: f.issue,
    projectDir: f.projectDir,
    invokingDir: f.invokingDir,
    deps: { reviewedScope: f.deps },
    toState: 'review',
  });
  assert.equal(evaluated.refusals[0].code, 'reviewed-scope-current-missing');
});

test('checked narrative mention of a verifier name still requires reviewed evidence', async () => {
  const body = '## Scope\n' + POLICY_MARKER + '\n- [x] Document the `aitm-verified` marker format';
  const result = await evaluateReviewedScope({
    ...fixture({ policy: true, pointer: false }),
    body,
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers[0].code, 'reviewed-scope-current-missing');
});
