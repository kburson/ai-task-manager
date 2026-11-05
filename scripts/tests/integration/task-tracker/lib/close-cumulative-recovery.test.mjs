// @story #2165
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { observeComparator } from '../../../helpers/close-cumulative-observer.mjs';

test('trace refuses missing or ambiguous comparator entry instead of observing another function', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/lib/action-decision/close.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotThrow(() => observeComparator(source));
  assert.throws(() => observeComparator(''), /ambiguous-comparator/);
  assert.throws(() => observeComparator(source + source), /ambiguous-comparator/);
});

test('ordinary observer-helper import does not install a production hook', () => {
  const helper = new URL('../../../helpers/close-cumulative-observer.mjs', import.meta.url).href;
  const fixtureUrl = new URL('../../../helpers/close-v5-fixture.mjs', import.meta.url).href;
  const code = `import {observeComparator} from ${JSON.stringify(helper)};import{rmSync}from'node:fs';const {fixture}=await import(${JSON.stringify(fixtureUrl)});const f=fixture();try{await f.ports.runReadOnlyGuards('review','done',f.context,f.authority);}finally{rmSync(f.dir,{recursive:true,force:true});}`;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.includes('closeCumulativeTrace'), false, result.stderr);
});

// Changing delivery proof to accept a lost suffix or incomplete inventory must fail here.
test('cumulative fixture proves the full suffix through ordinary production delivery', async (t) => {
  const { fixture } = await import('../../../helpers/close-v5-fixture.mjs');
  const { rmSync } = await import('node:fs');
  const { verifyObservedIntegration } =
    await import('../../../../task-tracker/lib/delivery-integration-proof.mjs');
  const { createDefaultDeliverDeps } = await import('../../../../task-tracker/verbs/deliver.mjs');
  const { execFileSync } = await import('node:child_process');
  const f = fixture({ cumulativePrefix: true });
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: f.dir, encoding: 'utf8' }).trim();
  assert.equal(f.sourceEvidence?.length, 23);
  assert.equal(f.sourceEvidence[7].oid, f.prefixHead);
  assert.ok(f.sourceEvidence.every((row) => row.parents.length === 1));
  assert.equal(
    git('rev-parse', f.prefixHead + '^{tree}'),
    git('rev-parse', f.integrationBase + '^{tree}')
  );
  assert.equal(git('rev-parse', f.head + '^{tree}'), git('rev-parse', f.merged + '^{tree}'));
  assert.notEqual(
    git('show', f.prefixHead + ':file with space.txt'),
    git('show', f.sourceBase + ':file with space.txt')
  );
  assert.notEqual(
    git('show', f.prefixHead + ':file with space.txt'),
    git('show', f.head + ':file with space.txt')
  );
  const observed = await verifyObservedIntegration({
    repository: f.cfg.repo,
    pullRequest: f.context.delivery.gateInput.pullRequest,
    trunkRef: f.merged,
    acceptedHeadSha: f.head,
    mergedCommitSha: f.merged,
    sourceCommits: f.sourceEvidence,
    inspectCommit: async ({ commitSha: sha }) => ({
      sha,
      parents: git('show', '-s', '--format=%P', sha).split(' ').filter(Boolean),
      tree: git('show', '-s', '--format=%T', sha),
      commitTitle: git('show', '-s', '--format=%s', sha),
      commitMessage: git('show', '-s', '--format=%b', sha),
    }),
    isAncestor: async ({ ancestor, descendant }) => {
      try {
        git('merge-base', '--is-ancestor', ancestor, descendant);
        return true;
      } catch {
        return false;
      }
    },
    compareContent: createDefaultDeliverDeps({ projectDir: f.dir, cfg: f.cfg })
      .compareDeliveryContent,
  });
  assert.equal(observed.method, 'squash');
  assert.deepEqual(observed.contentProof, {
    kind: 'equivalent-delta',
    sourceBase: f.sourceBase,
    sourceHead: f.head,
    integrationBase: f.integrationBase,
    integrationHead: f.merged,
  });
  assert.equal(observed.sourceMapping.length, 23);
});

// A broken public Start must not be hidden by a hand-authored binding.
test('public cumulative operator renews selected-artifact evidence through isolated native authority', async (t) => {
  const { cumulativeNativeFixture } = await import('../../../helpers/close-cumulative-native.mjs');
  const { getActiveTask } = await import('../../../../task-tracker/session-state.mjs');
  const f = await cumulativeNativeFixture();
  const sid = f.sid;
  const result = f.run(['start', '1878', '--role', 'agent']);
  assert.equal(result.status, 0, result.stdout + result.stderr + ' fixture=' + f.root);
  const binding = getActiveTask(sid, f.root);
  assert.equal(binding.issue, '#1878');
  assert.equal(binding.worktreePath, f.root);
  assert.equal(binding.worktreeBranch, 'feature/1878');
  assert.ok(binding.bindingGenerationId);
  await t.test(
    'Start binding is read under the real inherited native SID',
    { skip: !f.nativeSid },
    () => {
      assert.equal(sid, process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID);
      assert.equal(f.env.AI_TASK_MANAGER_SESSION_ID, undefined);
      assert.equal(getActiveTask(sid, f.root).bindingGenerationId, binding.bindingGenerationId);
    }
  );
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { default: path } = await import('node:path');
  const check = (args, options) => {
    const value = f.run(args, options);
    assert.equal(
      value.status,
      0,
      JSON.stringify(args) + ' ' + value.stdout + value.stderr + ' fixture=' + f.root
    );
    return value;
  };
  check(['explain', '1878', '--json']);
  check([
    'refine',
    '1878',
    '--size',
    'M',
    '--estimate',
    '2',
    '--priority',
    'p0',
    '--rank',
    '1',
    '--reason',
    'Bounded native cumulative integration fixture',
  ]);
  check([
    'refine',
    '1878',
    '--size',
    'M',
    '--estimate',
    '2',
    '--priority',
    'p0',
    '--rank',
    '1',
    '--reason',
    'Bounded native cumulative integration fixture',
  ]);
  check(['plan', '1878']);
  const scratch = path.join(f.root, '.scratch/gh');
  mkdirSync(scratch, { recursive: true });
  const analysis = [
    '### Concrete fixture source',
    'This independently initialized repository contains a real source base, twenty-three linear source commits, a prefix at index seven, an independent squash with the same entire prefix tree and a final delivery with the accepted source tree. The two edits to the shared file occur in separate hunks. The actual ordinary production delivery comparator and observed-integration verifier proved the entire suffix, complete source inventory and exact quartet before native lifecycle execution.',
    '### Native ownership and evidence',
    'Only the executable GitHub transport is synthetic. Public Start has created this operator binding under the inherited native identity, with no manually created active task, copied generation or root override. The fixture owns its physical Git common directory, local bare origin, runtime store, session state, fleet, occupancy, locks and Test sandboxes. Source-owned path containment was checked before Start. Unknown provider operations, variables, targets and fields refuse without a network fallback. TT_SKIP_NETWORK is absent so native guards remain active.',
    '### Verification and integration',
    'The tiny fixture verifier reads the actual source file and asserts both the accepted prefix and accepted suffix. The package lint, format and three test-lane scripts each execute that concrete verifier; they make no assertion about the host repository. Native Test must execute the real runner and receipt writer rather than receive an invented success, matching operator context or receipt. The native approval audit must disclose Full-Auto provenance and retain source binding.',
    '### Renewed operator route',
    'After initial native evidence is created, pause and switch the actual operator to a second fixture issue and worktree, then return through public Start. Observe the actual new binding generation and require the old selected-artifact evidence to refuse. Demotion declares substantive runtime integration. Merge an actual delivered repair-shaped code revision, keep the selected accepted artifact immutable, and retain the integration merge in the real commit trail. Repeat actual selected-artifact acceptance evidence under the new physical operator context.',
    '### Read-only and negative cases',
    'Both public selected-artifact Explain forms must run through the complete default collector and reach the cumulative comparator refusal before any product edit. Complete Git object bytes, refs, index, worktree, issue/provider state and binding/timer snapshots detect writes. A setup, projection, admission or stale-evidence failure is a prerequisite refusal, never comparator RED. Dirty worktree, changed source and changed generation must remain refused. No lower-level port result or supplemental omission replaces these gates.',
    '### Scope and limits',
    'The fixture supplies only explicitly synthetic provider state. It grants no authority to close any real issue, does not alter original historical receipts, and cannot activate the protected original operator. Product source stays unchanged until all native qualification gates reach their intended comparator boundary. The final repair remains a private, read-only complete-prefix proof with independent v5 verification; unrelated lost changes and malformed observations remain refused.',
  ].join('\n\n');
  const file = path.join(scratch, 'analysis.md');
  writeFileSync(file, analysis);
  check(['comment', '1878', '--key', 'deep-dive.analysis-v1', '--body-file', file]);
  const comment = f
    .read()
    .issues[1878].comments.nodes.find((c) =>
      c.body.includes('aitm-owned-comment key="deep-dive.analysis-v1"')
    );
  assert.ok(comment);
  check(['mirror-deep-dive', '--from-comment', String(comment.databaseId), '1878']);
  check([
    'plan-estimate',
    '1878',
    '--compatibility-mode',
    '--planned-size',
    'M',
    '--planned-estimate',
    '2',
    '--rationale',
    'Bounded fixture source and native integration qualification; no adaptive forecast claimed',
  ]);
  check(['plan-approve', '1878'], { env: { TT_FULL_AUTO: '1' } });
  check(['promote', '1878']);
  const selected = ['--artifact-commit', f.f.head];
  check(['commit-trace', '1878', ...selected]);
  check(['ac-stamp', 'Accepted prefix and suffix remain present.', ...selected]);
  check(['ensureChecked', 'Accepted prefix and suffix remain present.', ...selected]);
  check(['promote', '1878', ...selected]);
  const { parseVerificationReceipt } =
    await import('../../../../task-tracker/lib/verification-receipt.mjs');
  const initialReceipt = parseVerificationReceipt(f.read().issues[1878].body, 'test');
  assert.ok(initialReceipt, 'real native Test must write its receipt');
  const executions = readFileSync(f.executionFile, 'utf8').trim().split('\n').map(JSON.parse);
  for (const script of [
    'lint',
    'format:check',
    'test:unit',
    'test:integration',
    'test:slow',
    'node-verify',
  ])
    assert.ok(
      executions.some(
        (row) => row.script === script && row.head === f.f.head && row.prefix && row.suffix
      ),
      'missing actual initial fixture verifier execution: ' + script
    );
  assert.ok(executions.every((row) => row.head === f.f.head));
  assert.equal(initialReceipt.commitSha, f.f.head);
  assert.equal(initialReceipt.artifactSubject.commitSha, f.f.head);
  assert.equal(initialReceipt.artifactSubject.treeSha, f.git('rev-parse', f.f.head + '^{tree}'));
  assert.equal(initialReceipt.operatorContext.headSha, f.f.head);
  assert.equal(initialReceipt.operatorContext.bindingGenerationId, binding.bindingGenerationId);
  assert.equal(initialReceipt.operatorContext.sessionId, sid);
  assert.equal(initialReceipt.operatorContext.worktreePath, f.root);
  check(['promote', '1878', ...selected]);
  const { isAgentReviewComplete } =
    await import('../../../../task-tracker/lib/agent-review/review-gate.mjs');
  assert.equal(
    isAgentReviewComplete(f.read().issues[1878].body),
    true,
    'native Review must complete before approval: ' + f.root
  );
  check(['approve', '1878', ...selected], { env: { TT_FULL_AUTO: '1' } });
  const { renewCumulativeOperator } = await import('../../../helpers/close-cumulative-renewal.mjs');
  await renewCumulativeOperator(f, check, binding, initialReceipt);
});
