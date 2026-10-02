// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import {
  buildSplitProposals,
  writeProposalFragments,
} from '../../../../task-tracker/lib/split-plan.mjs';
import { stampEntryMarker } from '../../../../task-tracker/lib/stage-entry-markers.mjs';
import { stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { stripBodyVersion } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { createAitmRecordEnvelope } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  projectLifecycleGateEvidence,
  hasAcceptedTestEvidence,
} from '../../../../task-tracker/lib/github-records/lifecycle-gate-source.mjs';
import { recordReviewedScope } from '../../../../task-tracker/lib/reviewed-scope/record.mjs';
import { evaluateReviewedScope } from '../../../../task-tracker/lib/reviewed-scope/readiness.mjs';
import { scanScope } from '../../../../task-tracker/lib/reviewed-scope/targets.mjs';
import {
  LIMITS,
  POLICY_MARKER,
  parseRecordComment,
  serializePointer,
  sha256,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';

const packageRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const repository = 'owner/repo';
const issue = 1859;
const branch = 'codex/1859';
const labels = [
  'Inspect the generated package inventory',
  'Compare the published command surface',
  'Review the local verification transcript',
  'Confirm the recorded artifact identities',
  'Inspect the final release notes',
  'Review the final delivery summary',
];
const recordId = '01J00000000000000000000001';
const grantId = '01J00000000000000000000002';
const timestamp = '2026-10-01T12:00:00.000Z';

function acceptedTestEvidence(head) {
  const envelope = createAitmRecordEnvelope({
    recordId,
    recordType: 'verification-evidence',
    repository,
    issue,
    actor: 'codex',
    epoch: 1,
    grantId,
    predecessor: null,
    supersedes: null,
    createdAt: timestamp,
    payload: {
      schema: 'aitm.lifecycle-evidence/v1',
      evidenceKind: 'test',
      contractEpoch: 2,
      commitSha: head,
      result: 'passed',
      provenance: 'agent',
    },
  });
  const projection = projectLifecycleGateEvidence({
    repository,
    issue,
    expectedSha: head,
    records: [{ commentNodeId: 'IC_Test1859', envelope }],
    contractSource: {
      sourceKind: 'github-records/v1',
      contract: { acceptedRecordIds: [recordId] },
      authority: {
        contractRecordId: '01J00000000000000000000003',
        contractEpoch: 2,
        authorityEpoch: 1,
        coordinatorGrantId: grantId,
        commentNodeId: 'IC_Contract1859',
      },
    },
  });
  assert.equal(hasAcceptedTestEvidence(projection), true);
  return projection;
}

async function generatedChild(root) {
  const planText = Array.from(
    { length: 6 },
    (_, index) => `
### Task ${index + 1}: Inspect release component ${index + 1}
#### Story Intent
- **Beneficiary:** release operator
- **Capability:** stop partial publication
- **Need:** registry checks can fail
- **Value or failure prevented:** consumers receive complete releases
#### Scope
${(index === 0 ? labels : [`Inspect release component ${index + 1}`]).map((label) => `- [ ] ${label}`).join('\n')}
Run: \`node --test release-component.test.mjs\`
`
  ).join('\n');
  const proposals = buildSplitProposals({
    sourceIssue: 1858,
    planPath: 'docs/plans/release-components.md',
    planCommit: 'a'.repeat(40),
    governingSpec: 'docs/specs/release-components.md',
    planText,
  });
  assert.equal(proposals.length, 6);
  const fragments = await writeProposalFragments({ proposal: proposals[0], scratchDir: root });
  // Compose through the shipped creation renderer, which performs canonical
  // template, AC/verifier, Story Origin, and VC-membership validation locally.
  // Its read-only guidance lookup uses the real project; evidence stays in root.
  let body = execFileSync(
    process.execPath,
    [
      path.join(packageRoot, 'scripts/task-tracker/preflight-issue.mjs'),
      '--shape',
      'sub-issue',
      '--parent',
      '1858',
      '--user-story-file',
      fragments.userStory,
      '--scope-file',
      fragments.scope,
      '--ac-file',
      fragments.ac,
      '--story-origin-file',
      fragments.storyOrigin,
      '--plan-metadata-file',
      fragments.planMetadata,
      '--verification-commands-file',
      fragments.verificationCommands,
    ],
    { cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  assert.equal(body.split(POLICY_MARKER).length - 1, 1);
  assert.deepEqual(
    scanScope(body).targets.map(({ label }) => label),
    labels
  );
  // The local fixture projects completed machine VCs separately from reviewed
  // narrative Scope; the accepted exact-SHA Test capsule is built above.
  body = body.replace(/(## Verification Commands\n[\s\S]*?)(?=\n## )/, (section) =>
    section.replace(/^- \[ \]/gm, '- [x]')
  );
  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test']) {
    body = stampEntryMarker(body, state, timestamp);
  }
  // Keep concurrency-version digit width constant in the body-growth assertion.
  return stampBodyVersion(body, 1000);
}

async function fixture(t) {
  const root = await fs.realpath(
    mkdtempProjectIsolated('reviewed-scope-flow-', 'reviewed-scope-1859')
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let body = await generatedChild(root);
  let head = 'b'.repeat(40);
  const comments = new Map();
  const externalCalls = [];
  let sequence = 10000000000000000000n;
  let pushes = 0;
  let creates = 0;
  await fs.mkdir(path.join(root, 'evidence'));
  for (let index = 0; index < labels.length; index++) {
    await fs.writeFile(
      path.join(root, `evidence/step-${index + 1}.txt`),
      `Operator inspected release component ${index + 1}.\n`
    );
  }
  const deps = {
    sessionId: 'session-1859',
    resolveCurrentSessionWorktreeBinding: async ({ invokingDir }) => {
      assert.equal(invokingDir, root);
      return { issueNumber: issue, worktreePath: root, worktreeBranch: branch };
    },
    readWorktreeIdentity: async ({ projectDir }) => {
      assert.equal(projectDir, root);
      return { worktreePath: root, worktreeBranch: branch };
    },
    readBoundState: async (projectDir, { sessionId }) => {
      assert.equal(projectDir, root);
      assert.equal(sessionId, 'session-1859');
      return { activeIssue: '#1859', state: 'test' };
    },
    fetchAssignmentSnapshot: async ({ issueNumber, cfg }) => {
      assert.equal(issueNumber, issue);
      assert.equal(cfg.repo, repository);
      return { state: 'test', assignees: ['Owner'] };
    },
    pexec: async (command, args, options) => {
      externalCalls.push([command, args]);
      if (command === 'git') {
        assert.deepEqual(args, ['rev-parse', '--verify', 'HEAD']);
        assert.equal(options.cwd, root);
        return { stdout: head };
      }
      assert.equal(command, 'gh');
      assert.deepEqual(args, ['api', 'user', '--jq', '{id:(.id|tostring),login}']);
      return { stdout: JSON.stringify({ id: '42', login: 'Owner' }) };
    },
    readLiveBody: async () => body,
    readComment: async ({ repository: repo, commentId }) => {
      assert.equal(repo, repository);
      return comments.get(commentId);
    },
    listComments: async ({ repository: repo, issue: number, page, perPage }) => {
      assert.equal(repo, repository);
      assert.equal(number, issue);
      return [...comments.values()].slice((page - 1) * perPage, page * perPage);
    },
    createComment: async ({ repository: repo, issue: number, body: payload }) => {
      creates++;
      assert.equal(repo, repository);
      assert.equal(number, issue);
      const id = String(++sequence);
      const comment = Object.freeze({
        id,
        body: payload,
        user: Object.freeze({ id: '42', login: 'Owner' }),
        issue_url: `https://api.github.com/repos/${repository}/issues/${issue}`,
      });
      comments.set(id, comment);
      return comment;
    },
    fetchBody: async () => body,
    pushBody: async (repo, number, next) => {
      assert.equal(repo, repository);
      assert.equal(number, issue);
      pushes++;
      body = next;
    },
    now: () => timestamp,
    warn: () => {},
  };
  const ctx = {
    cfg: { repo: repository },
    issueNumber: issue,
    projectDir: root,
    invokingDir: root,
    deps: { reviewedScope: deps },
  };
  async function prepareRecord(index) {
    const artifact = `evidence/step-${index + 1}.txt`;
    const manifest = {
      schema: 'aitm.reviewed-scope-evidence/v1',
      repository,
      issue,
      worktree: root,
      branch,
      head,
      label: labels[index],
      provenance: { kind: 'operator-inspection' },
      rationale:
        'The saved operator inspection supports this bounded Scope step; it makes no command execution claim.',
      artifacts: [{ path: artifact, sha256: sha256(await fs.readFile(path.join(root, artifact))) }],
    };
    const manifestPath = `evidence/step-${index + 1}.json`;
    await fs.writeFile(path.join(root, manifestPath), canonicalRecordJson(manifest) + '\n');
    return manifestPath;
  }
  async function record(index) {
    const manifestPath = await prepareRecord(index);
    const result = await recordReviewedScope({ ctx, label: labels[index], manifestPath });
    assert.equal(result.status, 'ok', JSON.stringify(result));
    // Readiness must depend on the manifest retained in the immutable comment,
    // not on the author's disposable original manifest file.
    await fs.unlink(path.join(root, manifestPath));
    return result.pointer;
  }
  const readiness = () =>
    evaluateReviewedScope({
      body,
      repository,
      issue,
      projectDir: root,
      invokingDir: root,
      lifecycleEvidence: acceptedTestEvidence(head),
      deps,
    });
  const registry = () =>
    runGuards('test', 'review', {
      ...ctx,
      body,
      fromState: 'test',
      toState: 'review',
      lifecycleEvidence: acceptedTestEvidence(head),
      deps: {
        reviewedScope: deps,
        observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
        reconcileDependencyDisposition: async () => {},
        fetchParentIssue: async () => 1858,
        readParentStatus: async () => 'test',
      },
    });
  return {
    root,
    comments,
    externalCalls,
    ctx,
    deps,
    prepareRecord,
    record,
    readiness,
    registry,
    get body() {
      return body;
    },
    get creates() {
      return creates;
    },
    get pushes() {
      return pushes;
    },
    setBody(next) {
      body = next;
    },
    get head() {
      return head;
    },
    setHead(value) {
      head = value;
    },
  };
}

test('generated child records six final-HEAD targets, blocks artifact drift, recovers, and bounds twenty refresh rounds', async (t) => {
  const f = await fixture(t);
  const unrecorded = await f.registry();
  assert.equal(unrecorded.status, 'blocked');
  assert.deepEqual(
    unrecorded.refusals.map(({ code, args }) => ({ code, label: args.label })),
    labels.map((label) => ({ code: 'reviewed-scope-current-missing', label }))
  );
  for (let index = 0; index < labels.length; index++) await f.record(index);
  assert.deepEqual(await f.readiness(), { ok: true, blockers: [] });
  assert.equal((await f.registry()).status, 'ready');
  const initialComments = new Map([...f.comments].map(([id, comment]) => [id, comment.body]));
  const bodyBytes = Buffer.byteLength(f.body);
  const payloadBytes = Buffer.byteLength(stripBodyVersion(f.body));
  const initialLineages = scanScope(f.body).pointers.map(({ pointer }) => pointer.lineage);
  for (const comment of f.comments.values()) {
    const { record } = parseRecordComment(comment.body);
    assert.equal(record.manifest.head, f.head);
    assert.equal(record.predecessor, null);
    assert.equal(Object.hasOwn(record, 'exitCode'), false);
    assert.equal(Object.hasOwn(record.manifest, 'executionProof'), false);
  }
  await fs.appendFile(
    path.join(f.root, 'evidence/step-3.txt'),
    'A later inspection changed the artifact.\n'
  );
  assert.deepEqual(
    (await f.readiness()).blockers.map(({ code, label }) => ({ code, label })),
    [{ code: 'reviewed-scope-stale', label: labels[2] }]
  );
  assert.deepEqual(
    (await f.registry()).refusals.map(({ code, args }) => ({ code, label: args.label })),
    [{ code: 'reviewed-scope-stale', label: labels[2] }]
  );
  await f.record(2);
  assert.equal((await f.registry()).status, 'ready');
  for (let round = 1; round <= 20; round++) {
    const predecessors = scanScope(f.body).pointers.map(({ pointer }) => pointer);
    f.setHead(round.toString(16).padStart(40, '0'));
    assert.deepEqual(
      (await f.readiness()).blockers.map(({ label }) => label),
      labels
    );
    for (let index = 0; index < labels.length; index++) await f.record(index);
    const current = scanScope(f.body).pointers;
    assert.equal(current.length, 6);
    assert.deepEqual(
      current.map(({ pointer }) => pointer.lineage),
      initialLineages
    );
    assert.equal(Buffer.byteLength(f.body), bodyBytes, `body growth at refresh ${round}`);
    assert.equal(
      Buffer.byteLength(stripBodyVersion(f.body)),
      payloadBytes,
      'version-independent payload remains bounded'
    );
    assert.ok(Buffer.byteLength(f.body) <= LIMITS.body);
    for (let index = 0; index < current.length; index++) {
      const pointer = current[index].pointer;
      assert.ok(Buffer.byteLength(serializePointer(pointer)) <= LIMITS.pointer);
      const { record } = parseRecordComment(f.comments.get(pointer.commentId).body);
      assert.equal(record.manifest.head, f.head);
      assert.deepEqual(record.predecessor, {
        commentId: predecessors[index].commentId,
        sha256: predecessors[index].sha256,
      });
    }
    assert.equal((await f.registry()).status, 'ready', `registry at refresh ${round}`);
    for (const [id, original] of initialComments) assert.equal(f.comments.get(id).body, original);
    for (const [id, comment] of f.comments) {
      assert.equal(Object.isFrozen(comment), true);
      initialComments.set(id, comment.body);
    }
  }
  assert.equal(f.comments.size, 6 + 1 + 20 * 6);
  for (const [id, original] of initialComments) assert.equal(f.comments.get(id).body, original);
  assert.equal(f.body.includes('aitm-reviewed-scope-record:v1'), false);
  assert.equal(f.body.includes('A later inspection changed'), false);
  assert.ok(f.externalCalls.some(([command]) => command === 'git'));
  assert.ok(f.externalCalls.some(([command]) => command === 'gh'));
});

for (const heading of ['Acceptance Criteria', 'Definition of Done', 'Verification Commands']) {
  test(`recording an ineligible ${heading} target refuses before comment or body writes`, async (t) => {
    const f = await fixture(t);
    const manifestPath = await f.prepareRecord(0);
    const line = `- [ ] ${labels[0]}\n`;
    f.setBody(f.body.replace(line, '').replace(`## ${heading}\n`, `## ${heading}\n${line}`));
    const before = f.body;
    await assert.rejects(
      () => recordReviewedScope({ ctx: f.ctx, label: labels[0], manifestPath }),
      { code: 'reviewed-scope-target' }
    );
    assert.equal(f.creates, 0);
    assert.equal(f.comments.size, 0);
    assert.equal(f.pushes, 0);
    assert.equal(f.body, before);
  });
}

test('recording a directory-backed target refuses before comment or body writes', async (t) => {
  const f = await fixture(t);
  const manifestPath = await f.prepareRecord(0);
  const directory = createIssueDirectory({
    issueNodeId: 'I_1859',
    singletons: {
      'delivery-contract': 'IC_Contract1859',
      coordination: 'IC_Coordination1859',
      'evidence-projection': 'IC_Evidence1859',
      timing: 'IC_Timing1859',
    },
  });
  f.setBody(`${f.body}\n${renderIssueDirectory(directory)}\n`);
  const before = f.body;
  await assert.rejects(() => recordReviewedScope({ ctx: f.ctx, label: labels[0], manifestPath }), {
    code: 'reviewed-scope-directory',
  });
  assert.equal(f.creates, 0);
  assert.equal(f.comments.size, 0);
  assert.equal(f.pushes, 0);
  assert.equal(f.body, before);
});

test('wrong session binding refuses before comment or body writes', async (t) => {
  const f = await fixture(t);
  const manifestPath = await f.prepareRecord(0);
  f.deps.resolveCurrentSessionWorktreeBinding = async () => ({
    issueNumber: 1858,
    worktreePath: f.root,
    worktreeBranch: branch,
  });
  const before = f.body;
  await assert.rejects(() => recordReviewedScope({ ctx: f.ctx, label: labels[0], manifestPath }), {
    code: 'reviewed-scope-issue',
  });
  assert.equal(f.creates, 0);
  assert.equal(f.comments.size, 0);
  assert.equal(f.pushes, 0);
  assert.equal(f.body, before);
});

test('a missing physical artifact refuses before comment or body writes', async (t) => {
  const f = await fixture(t);
  const manifestPath = await f.prepareRecord(0);
  await fs.unlink(path.join(f.root, 'evidence/step-1.txt'));
  const before = f.body;
  await assert.rejects(() => recordReviewedScope({ ctx: f.ctx, label: labels[0], manifestPath }), {
    code: 'reviewed-scope-artifact-path',
  });
  assert.equal(f.creates, 0);
  assert.equal(f.comments.size, 0);
  assert.equal(f.pushes, 0);
  assert.equal(f.body, before);
});

test('stale raw manifest bytes refuse before comment or body writes', async (t) => {
  const f = await fixture(t);
  const manifestPath = await f.prepareRecord(0);
  const physicalPath = path.join(f.root, manifestPath);
  const bytes = await fs.readFile(physicalPath);
  let replaced = false;
  // Keep real descriptor reads and path/identity validation. Change the physical
  // file only after the initial manifest descriptor closes: dropping the LF is
  // still canonical JSON but no longer agrees with the exact bytes just read.
  f.deps.fs = {
    ...fs,
    open: async (filename, flags) => {
      const handle = await fs.open(filename, flags);
      if (filename !== physicalPath || replaced) return handle;
      return {
        stat: (...args) => handle.stat(...args),
        read: (...args) => handle.read(...args),
        close: async () => {
          await handle.close();
          replaced = true;
          await fs.writeFile(physicalPath, bytes.subarray(0, -1));
        },
      };
    },
  };
  const before = f.body;
  await assert.rejects(() => recordReviewedScope({ ctx: f.ctx, label: labels[0], manifestPath }), {
    code: 'reviewed-scope-manifest-changed',
  });
  assert.equal(replaced, true);
  assert.equal(f.creates, 0);
  assert.equal(f.comments.size, 0);
  assert.equal(f.pushes, 0);
  assert.equal(f.body, before);
});
