// @story #1855
// Real default-cwd Git reads; captures are data, never guard/stage authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import * as gate from '../../../../task-tracker/lib/code-complete-gate.mjs';
const body = '## Acceptance Criteria\n- [x] Native requirement <!-- aitm-verified cmd="`node --test test.mjs`" -->\n';
const cfg = { repo: 'example/criteria' };
function args(sha) { return { cfg, issueNumber: 124, body, deps: {
  listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="' + sha + '" -->' }],
} }; }

test('native CodeComplete capture binds actual default Git cwd, ordered raw leaves and exact returned object', async () => {
  const s = createSandbox(), cwd = process.cwd();
  try {
    process.chdir(s.context.sourceRoot);
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = await gate.gateCodeComplete(args(sha));
    assert.equal(result.ok, true);
    const data = gate.readCodeCompleteReadData(result);
    assert.equal(data.repository, cfg.repo); assert.equal(data.issue, 124);
    assert.deepEqual(data.reads.map(read => read.kind), ['root', 'files', 'dirty']);
    assert.equal(data.reads[0].stdout.trim(), s.context.sourceRoot);
    assert.equal(data.reads[1].sha, sha); assert.match(data.reads[1].stdout, /source\.txt/);
    for (const read of data.reads) { assert.equal(read.cwd, s.context.sourceRoot); assert.equal(read.exitCode, 0); assert.ok(Object.isFrozen(read)); }
    assert.ok(Object.isFrozen(data) && Object.isFrozen(data.reads));
    assert.equal(gate.readCodeCompleteReadData({ ...result }), null);
    writeFileSync(path.join(s.context.sourceRoot, 'source.txt'), 'changed\n');
    const changed = await gate.gateCodeComplete(args(sha));
    assert.equal(changed.ok, false); assert.match(gate.readCodeCompleteReadData(changed).reads[2].stdout, /source\.txt/);
  } finally { process.chdir(cwd); s.dispose(); }
});

test('native CodeComplete capture preserves swallowed missing-SHA failure and actual unavailable Git root/status', async () => {
  const s = createSandbox(), cwd = process.cwd();
  try {
    process.chdir(s.context.sourceRoot);
    const missing = await gate.gateCodeComplete(args('f'.repeat(40)));
    assert.equal(missing.ok, true, 'ordinary best-effort missing-SHA compatibility stays unchanged');
    const data = gate.readCodeCompleteReadData(missing);
    assert.notEqual(data.reads.find(read => read.kind === 'files').exitCode, 0);
    process.chdir(path.join(s.context.root, 'home'));
    const unavailable = await gate.gateCodeComplete(args('f'.repeat(40)));
    assert.equal(unavailable.ok, false);
    const failed = gate.readCodeCompleteReadData(unavailable);
    assert.ok(failed.reads.every(read => read.exitCode !== 0));
    assert.ok(failed.reads.every(read => read.cwd === process.cwd()));
  } finally { process.chdir(cwd); s.dispose(); }
});

for (const key of ['filesForSha', 'dirtyFiles', 'resolveContractSource', 'readContractRecord', 'graphql']) {
  test(`native CodeComplete capture unavailable for injected ${key}`, async () => {
    const s = createSandbox(), cwd = process.cwd();
    try {
      process.chdir(s.context.sourceRoot);
      const input = args(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
      input.deps[key] = key === 'filesForSha' ? async () => [] : key === 'dirtyFiles' ? async () => new Set() :
        key === 'resolveContractSource' ? async () => ({ contract: { acceptanceCriteria: [{ declaration: 'Injected', checked: true }] } }) : async () => ({});
      const result = await gate.gateCodeComplete(input);
      assert.equal(gate.readCodeCompleteReadData(result), null);
    } finally { process.chdir(cwd); s.dispose(); }
  });
}

async function freshRegistry() {
  return import('../../../../task-tracker/lib/guard-registry.mjs?git-capture=' + Math.random());
}
async function nativeGuardFixture(fn) {
  const s = createSandbox(), cwd = process.cwd();
  try {
    process.chdir(s.context.sourceRoot);
    const input = args(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
    const ctx = { cfg, issueNumber: 124, body, fromState: 'develop', toState: 'test',
      projectDir: s.context.sourceRoot, deps: { codeComplete: input.deps } };
    const native = await import('../../../../task-tracker/lib/develop-exit-code-complete-guard.mjs');
    const registry = await freshRegistry();
    registry.registerGuard('develop', 'exit', native.developExitCodeCompleteGuard);
    await fn({ s, ctx, native, registry });
  } finally { process.chdir(cwd); s.dispose(); }
}

test('native Git bridge retains original guard result data through registry normalization without exposing refs', async () => {
  await nativeGuardFixture(async ({ s, ctx, native, registry }) => {
    const direct = await native.developExitCodeCompleteGuard.run(ctx);
    assert.equal(direct.ok, true);
    const invocation = { guard: native.developExitCodeCompleteGuard, run: native.developExitCodeCompleteGuard.run, id: native.GUARD_ID };
    const directData = native.readDevelopCodeCompleteReadData(direct, invocation);
    assert.equal(native.readDevelopCodeCompleteReadData(direct), null);
    assert.equal(native.readDevelopCodeCompleteReadData(direct, { ...invocation, guard: { ...invocation.guard } }), null);
    assert.equal(directData.reads[0].stdout.trim(), s.context.sourceRoot);
    assert.equal(native.readDevelopCodeCompleteReadData({ ...direct }, invocation), null);
    const result = await registry.runGuards('develop', 'test', ctx);
    assert.equal(result.ok, true);
    const captured = await registry.readNativeGuardReadData(result);
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].invocation, { ordinal: 0, state: 'develop', phase: 'exit', guardId: 'develop-exit-code-complete' });
    assert.deepEqual(captured[0].data.reads.map(r => r.kind), ['root', 'files', 'dirty']);
    const visit = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const v of Object.values(value)) visit(v); } else assert.notEqual(typeof value, 'function'); };
    visit(captured);
    assert.equal(await registry.readNativeGuardReadData({ ...result }), null);
    writeFileSync(path.join(s.context.sourceRoot, 'source.txt'), 'changed by test\n');
    const dirty = await registry.runGuards('develop', 'test', ctx);
    assert.equal(dirty.ok, false);
    assert.match((await registry.readNativeGuardReadData(dirty))[0].data.reads[2].stdout, /source\.txt/);
  });
});

for (const kind of ['gate', 'audit', 'files', 'bypass', 'same-id', 'inflight']) {
  test(`native Git bridge refuses ${kind} substitution or bypass`, async () => {
    await nativeGuardFixture(async ({ ctx, native, registry }) => {
      if (kind === 'gate') ctx.deps.codeCompleteGate = async () => ({ ok: true });
      if (kind === 'audit') ctx.deps.evidenceBranchReachability = async () => ({ ok: true });
      if (kind === 'files') ctx.deps.codeComplete.filesForSha = async () => [];
      if (kind === 'bypass') ctx.toState = 'review';
      if (kind === 'same-id') {
        registry.GUARDS.develop.exit.length = 0;
        registry.registerGuard('develop', 'exit', { id: native.GUARD_ID, run: native.developExitCodeCompleteGuard.run });
      }
      const original = native.developExitCodeCompleteGuard.run;
      try {
        if (kind === 'inflight') {
          registry.GUARDS.develop.exit.length = 0;
          registry.registerGuard('develop', 'exit', { id: 'pause-before-native', run: async () => {
            native.developExitCodeCompleteGuard.run = async function (arg) {
              native.developExitCodeCompleteGuard.run = original;
              return Reflect.apply(original, native.developExitCodeCompleteGuard, [arg]);
            };
            return { ok: true };
          } });
          registry.registerGuard('develop', 'exit', native.developExitCodeCompleteGuard);
        }
        const result = await registry.runGuards('develop', 'test', ctx);
        assert.equal(await registry.readNativeGuardReadData(result), null);
      } finally { native.developExitCodeCompleteGuard.run = original; }
    });
  });
}

test('native Git bridge leaves bare registry empty and rejects unknown or empty evaluation', async () => {
  const registry = await freshRegistry();
  const empty = await registry.runGuards('develop', 'test', {});
  assert.equal(await registry.readNativeGuardReadData(empty), null);
  assert.equal(await registry.readNativeGuardReadData({ ok: true }), null);
  for (const slot of Object.values(registry.GUARDS)) assert.deepEqual(slot, { exit: [], entry: [] });
});


test('passive capture introspection failure preserves ordinary injected Proxy gate compatibility', async () => {
  const deps = new Proxy({
    listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="' + 'a'.repeat(40) + '" -->' }],
    filesForSha: async () => ['source.txt'], dirtyFiles: async () => new Set(),
  }, { ownKeys() { throw new Error('optional introspection unavailable'); } });
  const result = await gate.gateCodeComplete({ cfg, issueNumber: 124, body, deps });
  assert.equal(result.ok, true);
  assert.equal(gate.readCodeCompleteReadData(result), null);
});


test('native Git bridge refuses an incomplete thrown invocation despite later native data', async () => {
  await nativeGuardFixture(async ({ ctx, native, registry }) => {
    registry.GUARDS.develop.exit.length = 0;
    registry.registerGuard('develop', 'exit', { id: 'unavailable-prerequisite', run() { throw new Error('unavailable'); } });
    registry.registerGuard('develop', 'exit', native.developExitCodeCompleteGuard);
    const pending = registry.runGuards('develop', 'test', ctx);
    assert.equal(await registry.readNativeGuardReadData(pending), null);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(await registry.readNativeGuardReadData(result), null);
  });
});

test('bare registry import and foreign read do not initialize native bootstrap in a fresh process', () => {
  const url = new URL('../../../../task-tracker/lib/guard-registry.mjs', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const registry = await import(${JSON.stringify(url)});
    assert.equal(await registry.readNativeGuardReadData({ok:true}), null);
    assert.equal(await registry.readNativeGuardReadData(await registry.runGuards('develop','test',{})), null);
    for (const slot of Object.values(registry.GUARDS)) assert.deepEqual(slot,{exit:[],entry:[]});
  `], { encoding: 'utf8' });
});


import * as ancestry from '../../../../task-tracker/lib/evidence-branch-reachability.mjs';
function evidenceBody(sha, projectDir) {
  return `<!-- aitm-verified cmd="node --test test.mjs" sha="${sha}" branch="trunk" worktree="${projectDir}" bound-issue="124" -->`;
}
test('native ancestry capture records actual cached traversal and distinguishes reachable, foreign and unavailable', async () => {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    const git = args => execFileSync('git', args, { cwd: projectDir, env: s.env, encoding: 'utf8' }).trim();
    const head = git(['rev-parse', 'HEAD']);
    const input = { issueNumber: 124, projectDir, body: evidenceBody(head, projectDir) + '\n' + evidenceBody(head, projectDir) };
    const result = await ancestry.auditEvidenceBranchReachability(input);
    assert.equal(result.ok, true);
    const data = ancestry.readEvidenceBranchReadData(result);
    assert.equal(data.identity.worktreePath, projectDir);
    assert.equal(data.identity.worktreeBranch, 'trunk');
    assert.equal(data.reads.length, 1, 'same SHA uses actual native cache');
    assert.deepEqual(data.reads[0], { ancestor: head, descendant: 'trunk', cwd: projectDir, stdout: '', stderr: '', exitCode: 0 });
    assert.ok(Object.isFrozen(data) && Object.isFrozen(data.identity) && Object.isFrozen(data.reads[0]));
    assert.equal(ancestry.readEvidenceBranchReadData({ ...result }), null);
    git(['checkout', '-qb', 'foreign-capture']);
    writeFileSync(path.join(projectDir, 'foreign.txt'), 'foreign-only\n');
    git(['add', 'foreign.txt']); git(['commit', '-qm', 'Foreign ancestry fixture']);
    const foreign = git(['rev-parse', 'HEAD']); git(['checkout', '-q', 'trunk']);
    const rejected = await ancestry.auditEvidenceBranchReachability({ ...input, body: evidenceBody(foreign, projectDir) });
    assert.equal(rejected.ok, false);
    assert.equal(ancestry.readEvidenceBranchReadData(rejected).reads[0].exitCode, 1);
    const missing = await ancestry.auditEvidenceBranchReachability({ ...input, body: evidenceBody('f'.repeat(40), projectDir) });
    assert.equal(missing.ok, false);
    assert.ok(ancestry.readEvidenceBranchReadData(missing).reads[0].exitCode > 1);
    const absent = await ancestry.auditEvidenceBranchReachability({ ...input, projectDir: path.join(s.context.root, 'missing') });
    assert.equal(absent.ok, false);
    const failed = ancestry.readEvidenceBranchReadData(absent);
    assert.equal(failed.identity, null); assert.equal(typeof failed.identityError, 'string'); assert.deepEqual(failed.reads, []);
  } finally { s.dispose(); }
});
for (const mode of ['isAncestor', 'identity', 'proxy']) test(`native ancestry capture is unavailable for ${mode} injection without changing ordinary behavior`, async () => {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).trim();
    let deps = mode === 'identity' ? { readWorktreeIdentity: () => ({ worktreePath: projectDir, worktreeBranch: 'trunk' }) } : { isAncestor: async () => true };
    if (mode === 'proxy') deps = new Proxy(deps, { ownKeys() { throw new Error('passive-only'); } });
    const result = await ancestry.auditEvidenceBranchReachability({ body: evidenceBody(sha, projectDir), issueNumber: 124, projectDir, deps });
    assert.equal(result.ok, true);
    assert.equal(ancestry.readEvidenceBranchReadData(result), null);
  } finally { s.dispose(); }
});


test('native HEAD capture binds actual explicit root and retains literal versus attributed native reads', async () => {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    const git = args => execFileSync('git', args, { cwd: projectDir, env: s.env, encoding: 'utf8' }).trim();
    const initial = git(['rev-parse', 'HEAD']);
    const input = { ...args(initial), projectDir };
    const result = await gate.gateCommitTrailContainsHead(input);
    assert.equal(result.ok, true);
    const literal = gate.readCommitTrailHeadReadData(result);
    assert.equal(literal.projectDir, projectDir); assert.equal(literal.attribution, null);
    assert.deepEqual(literal.reads, [{ kind: 'head', cwd: projectDir, stdout: initial + '\n', stderr: '', exitCode: 0 }]);
    assert.equal(gate.readCommitTrailHeadReadData({ ...result }), null);
    git(['commit', '--allow-empty', '-qm', 'Owned fixture change [#124]']);
    const own = git(['rev-parse', 'HEAD']);
    const missing = await gate.gateCommitTrailContainsHead(input);
    assert.equal(missing.ok, false);
    const attributed = gate.readCommitTrailHeadReadData(missing).attribution;
    assert.equal(attributed.exitCode, 0); assert.deepEqual(attributed.refs, ['HEAD']);
    assert.match(attributed.stdout, new RegExp(own));
    assert.deepEqual(attributed.records.map(record => record.sha), [own]);
    assert.ok(Object.isFrozen(attributed) && Object.isFrozen(attributed.records[0]));
    git(['commit', '--allow-empty', '-qm', 'Sibling fixture change [#999]']);
    const resumed = await gate.gateCommitTrailContainsHead({ ...args(own), projectDir });
    assert.equal(resumed.ok, true);
    assert.deepEqual(gate.readCommitTrailHeadReadData(resumed).attribution.records.map(record => record.sha), [own]);
    const unavailable = await gate.gateCommitTrailContainsHead({ ...input, projectDir: path.join(s.context.root, 'missing') });
    assert.equal(unavailable.ok, false);
    assert.notEqual(gate.readCommitTrailHeadReadData(unavailable).reads[0].exitCode, 0);
  } finally { s.dispose(); }
});
for (const mode of ['head', 'attribution', 'proxy']) test(`native HEAD capture refuses ${mode} injection with ordinary compatibility`, async () => {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).trim();
    const input = { ...args(sha), projectDir };
    if (mode === 'head') input.deps.getHeadSha = async () => sha;
    if (mode === 'attribution') input.deps.attributingCommits = async () => [];
    if (mode === 'proxy') input.deps = new Proxy(input.deps, { ownKeys() { throw new Error('passive-only'); } });
    const result = await gate.gateCommitTrailContainsHead(input);
    assert.equal(result.ok, true);
    assert.equal(gate.readCommitTrailHeadReadData(result), null);
  } finally { s.dispose(); }
});


test('native registry bridge retains actual ancestry and HEAD leaves from their original invocations', async () => {
  await nativeGuardFixture(async ({ s, ctx, registry }) => {
    const headGuard = await import('../../../../task-tracker/lib/develop-exit-commit-trail-head-guard.mjs');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    ctx.body += evidenceBody(sha, s.context.sourceRoot);
    ctx.deps.commitTrailHead = ctx.deps.codeComplete;
    registry.registerGuard('develop', 'exit', headGuard.developExitCommitTrailHeadGuard);
    const result = await registry.runGuards('develop', 'test', ctx);
    assert.equal(result.ok, true);
    const data = await registry.readNativeGuardReadData(result);
    assert.equal(data.length, 2);
    assert.deepEqual(data.map(entry => entry.invocation.guardId), ['develop-exit-code-complete', 'develop-exit-commit-trail-head']);
    assert.equal(data[0].data.ancestry.reads[0].ancestor, sha);
    assert.equal(data[0].data.ancestry.reads[0].exitCode, 0);
    assert.equal(data[1].data.attribution, null);
    assert.equal(data[1].data.reads[0].stdout.trim(), sha);
    const direct = await headGuard.developExitCommitTrailHeadGuard.run(ctx);
    const descriptor = { guard: headGuard.developExitCommitTrailHeadGuard, run: headGuard.developExitCommitTrailHeadGuard.run, id: headGuard.GUARD_ID };
    assert.equal(headGuard.readDevelopCommitTrailHeadReadData(direct, descriptor).reads[0].stdout.trim(), sha);
    assert.equal(headGuard.readDevelopCommitTrailHeadReadData({ ...direct }, descriptor), null);
    assert.equal(headGuard.readDevelopCommitTrailHeadReadData(direct, { ...descriptor, run: async () => ({ ok: true }) }), null);
  });
});
for (const key of ['commitTrailHeadGate', 'resolveProjectDir']) test(`native HEAD guard bridge refuses injected ${key}`, async () => {
  await nativeGuardFixture(async ({ s, ctx, registry }) => {
    const headGuard = await import('../../../../task-tracker/lib/develop-exit-commit-trail-head-guard.mjs');
    ctx.deps.commitTrailHead = ctx.deps.codeComplete;
    ctx.deps[key] = key === 'commitTrailHeadGate' ? async () => ({ ok: true }) : () => s.context.sourceRoot;
    registry.registerGuard('develop', 'exit', headGuard.developExitCommitTrailHeadGuard);
    const result = await registry.runGuards('develop', 'test', ctx);
    assert.equal(result.ok, true);
    assert.equal(await registry.readNativeGuardReadData(result), null);
  });
});
