// @story #1872
import { fileRankWaveRuntime } from '../../../fixtures/rank-wave-file-runtime.mjs';
import {
  prepareRankWave,
  executeRankWaveWrite,
} from '../../../../task-tracker/lib/epic-rank-wave-store.mjs';
import { buildEpicOrchestrationPlanMarker } from '../../../../task-tracker/lib/epic-orchestration-plan.mjs';
import { rankWaveDigest } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  admissionLockPath,
  withEpicAdmissionLock,
} from '../../../../task-tracker/lib/epic-admission-lock.mjs';
import { discoverRankWavePhysical } from '../../../../task-tracker/lib/epic-rank-wave-bindings.mjs';
const moduleUrl = pathToFileURL(
  path.resolve('scripts/task-tracker/lib/epic-admission-lock.mjs')
).href;
function repo() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'rank-wave-lock-'));
  const main = path.join(dir, 'main'),
    a = path.join(dir, 'a'),
    b = path.join(dir, 'b');
  mkdirSync(main);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: main,
      stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(dir, 'empty-config') },
    });
  git(['init']);
  git([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'baseline',
  ]);
  git(['worktree', 'add', '-b', 'child-a', a]);
  git(['worktree', 'add', '-b', 'child-b', b]);
  return { dir, main, a, b };
}
function processRun(code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('exit', (status) => (status === 0 ? resolve(out) : reject(new Error(err || out))));
  });
}

test('real linked worktrees resolve the same physical parent lock, including a symlink alias', async () => {
  const r = repo();
  try {
    assert.equal(
      admissionLockPath({ projectDir: r.a, epic: 107 }),
      admissionLockPath({ projectDir: r.b, epic: 107 })
    );
    symlinkSync(r.a, path.join(r.dir, 'alias'));
    assert.equal(discoverRankWavePhysical(path.join(r.dir, 'alias')).worktree, r.a);
    assert.equal(
      admissionLockPath({ projectDir: path.join(r.dir, 'alias'), epic: 107 }),
      admissionLockPath({ projectDir: r.a, epic: 107 })
    );
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('competing native processes serialize and re-read revocation at the winning boundary', async () => {
  const r = repo();
  try {
    const authority = path.join(r.dir, 'authority.json'),
      events = path.join(r.dir, 'events.log');
    writeFileSync(authority, JSON.stringify({ revoked: false }));
    writeFileSync(events, '');
    const first = processRun(
      `import {withEpicAdmissionLock} from ${JSON.stringify(moduleUrl)};import{appendFileSync,writeFileSync}from'node:fs';await withEpicAdmissionLock({projectDir:${JSON.stringify(r.a)},epic:107},async()=>{appendFileSync(${JSON.stringify(events)},'revoke:start\\n');await new Promise(r=>setTimeout(r,150));writeFileSync(${JSON.stringify(authority)},JSON.stringify({revoked:true}));appendFileSync(${JSON.stringify(events)},'revoke:end\\n');});`
    );
    // Wait for the actual holder to enter, not an assumed process-start delay.
    for (let i = 0; i < 100 && !readFileSync(events, 'utf8').includes('revoke:start'); i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.match(readFileSync(events, 'utf8'), /revoke:start/);
    const second = processRun(
      `import{withEpicAdmissionLock}from${JSON.stringify(moduleUrl)};import{appendFileSync,readFileSync}from'node:fs';await withEpicAdmissionLock({projectDir:${JSON.stringify(r.b)},epic:107},async()=>{const state=JSON.parse(readFileSync(${JSON.stringify(authority)},'utf8'));appendFileSync(${JSON.stringify(events)},state.revoked?'admission:refused\\n':'admission:allowed\\n');});`
    );
    await Promise.all([first, second]);
    assert.equal(readFileSync(events, 'utf8'), 'revoke:start\nrevoke:end\nadmission:refused\n');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('bounded contention never evicts live or unknown ownership and nested context cannot be forged', async () => {
  const r = repo();
  try {
    await withEpicAdmissionLock({ projectDir: r.a, epic: 107 }, async (context) => {
      assert.equal(
        await withEpicAdmissionLock({ projectDir: r.b, epic: 107, context }, async () => 42),
        42
      );
      await assert.rejects(
        withEpicAdmissionLock(
          { projectDir: r.b, epic: 107, context: { ...context } },
          async () => {}
        ),
        /context/
      );
      const code = `import{withEpicAdmissionLock}from${JSON.stringify(moduleUrl)};try{await withEpicAdmissionLock({projectDir:${JSON.stringify(r.b)},epic:107,timeoutMs:50},async()=>{});process.exit(3);}catch(e){console.log(e.code);}`;
      assert.match(await processRun(code), /admission-lock-timeout/);
    });
    const lock = admissionLockPath({ projectDir: r.a, epic: 107 });
    mkdirSync(lock, { recursive: true });
    await assert.rejects(
      withEpicAdmissionLock({ projectDir: r.a, epic: 107, timeoutMs: 50 }, async () => {}),
      /unknown/
    );
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('public Plan-to-Develop admission waits for a linked-worktree revoker and revalidates before effects', async () => {
  const r = repo();
  try {
    const authority = path.join(r.dir, 'authority.json'),
      events = path.join(r.dir, 'events.log');
    const children = [140, 144].map((number) => ({
      number,
      rank: 2,
      state: 'plan',
      boardState: 'plan',
      issueState: 'open',
      closeReason: null,
      recoveryPhase: null,
      refinementDigest: 'a'.repeat(64),
      hasCurrentRefinement: true,
      blockedBy: [],
      dependencyReadiness: 'ready',
    }));
    const binding = (issue, worktree, sessionId) => ({
      issue,
      ...discoverRankWavePhysical(worktree),
      provider: 'codex',
      sessionId,
      generation: 'fixture-' + issue,
    });
    const snapshot = {
      children,
      parent: binding(107, r.main, 'fixture-parent'),
      bindings: [binding(140, r.a, 'fixture-140'), binding(144, r.b, 'fixture-144')],
      body: buildEpicOrchestrationPlanMarker({ children, trunkSha: '1'.repeat(40) }),
    };
    writeFileSync(authority, JSON.stringify({ snapshot, comments: [], operations: [] }));
    const runtime = fileRankWaveRuntime({ file: authority, projectDir: r.main });
    const p = await prepareRankWave({
      repository: 'o/r',
      epic: 107,
      rank: 2,
      operationId: 'initial',
      expiresAt: null,
      runtime,
    });
    const source = {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'fixture-human',
      messages: [{ messageId: 'fixture-message', statementHash: 'sha256:' + 'a'.repeat(64) }],
    };
    const initial = await executeRankWaveWrite({
      action: 'record',
      repository: 'o/r',
      epic: 107,
      now: '2026-10-04T01:00:00.000Z',
      runtime,
      input: {
        schema: 'aitm.epic-wave-request/v1',
        proposal: p.proposal,
        expectedProposalDigest: p.digest,
        source,
        previousDigest: null,
      },
    });
    assert.equal(initial.status, 'recorded');
    const proposal = { ...p.proposal, operationId: 'revocation' };
    const input = {
      schema: 'aitm.epic-wave-request/v1',
      proposal,
      expectedProposalDigest: rankWaveDigest(proposal),
      source,
      previousDigest: initial.digest,
    };
    const runtimeUrl = pathToFileURL(
      path.resolve('scripts/tests/fixtures/rank-wave-file-runtime.mjs')
    ).href;
    const storeUrl = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/epic-rank-wave-store.mjs')
    ).href;
    writeFileSync(events, '');
    const promoteUrl = pathToFileURL(path.resolve('scripts/task-tracker/verbs/promote.mjs')).href;
    const guardUrl = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/refine-exit-wip-budget-guard.mjs')
    ).href;
    const graphUrl = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/epic-rank-wave-policy.mjs')
    ).href;
    const first = processRun(
      `import{executeRankWaveWrite}from${JSON.stringify(storeUrl)};import{fileRankWaveRuntime}from${JSON.stringify(runtimeUrl)};const result=await executeRankWaveWrite({action:'revoke',repository:'o/r',epic:107,now:'2026-10-04T01:01:00.000Z',runtime:fileRankWaveRuntime({file:${JSON.stringify(authority)},projectDir:${JSON.stringify(r.a)},events:${JSON.stringify(events)}}),input:${JSON.stringify(input)}});if(result.status!=='recorded')throw new Error(JSON.stringify(result));`
    );
    for (let i = 0; i < 100 && !readFileSync(events, 'utf8').includes('revoke:start'); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(readFileSync(events, 'utf8'), /revoke:start/);
    const code = `
      import{runSerializedPromote}from${JSON.stringify(promoteUrl)};
      import{refineExitWipBudgetGuard}from${JSON.stringify(guardUrl)};
      import{freezeRankGraph}from${JSON.stringify(graphUrl)};
      import{readFileSync,appendFileSync}from'node:fs';
      import{inspectRankWavePublication}from${JSON.stringify(storeUrl)};
      import{fileRankWaveRuntime}from${JSON.stringify(runtimeUrl)};
      const runtime=fileRankWaveRuntime({file:${JSON.stringify(authority)},projectDir:${JSON.stringify(r.b)}});
      const children=[140,144].map(number=>({number,rank:2,state:'plan',boardState:'plan',issueState:'open',closeReason:null,recoveryPhase:null,refinementDigest:'a'.repeat(64),hasCurrentRefinement:true,blockedBy:[],dependencyReadiness:'ready'}));
      const body='<!-- aitm-last-known-state state="plan" ts="2026-10-04T01:00:00.000Z" -->';
      const result=await runSerializedPromote({issueNumber:144,cfg:{repo:'o/r'},deps:{projectDir:${JSON.stringify(r.b)},fetchParentIssue:async()=>107,withIssueLock:async(_,fn)=>fn(),assertBound(){},fetchIssueBody:async()=>({body}),getLiveState:async()=> 'plan',resolveProjectDir:()=>${JSON.stringify(r.b)},sessionPolicy:{},epicChildren:{rankWaveRuntime:runtime,inspectRankWavePublication:args=>inspectRankWavePublication({...args,now:'2026-10-04T01:02:00.000Z',runtime})},runGuards:async(_from,_to,ctx)=>{const r=await refineExitWipBudgetGuard.run(ctx);return r.ok?{ok:true,status:'ready',refusals:[],humanDecision:null}:{ok:false,status:'blocked',refusals:[{id:'refine-exit-wip-budget',guardId:'refine-exit-wip-budget',...r}],humanDecision:null};},loadWorkflowBoundary:async()=>({status:'observed'}),runMoveState:async()=>{appendFileSync(${JSON.stringify(events)},'effect:develop\\n');return 0;}}});
      if(result.decision?.refusals?.[0]?.code!=='rank-wave-admission-refused')throw new Error(JSON.stringify(result));
      appendFileSync(${JSON.stringify(events)},'admission:refused\\n');`;
    await Promise.all([first, processRun(code)]);
    assert.equal(readFileSync(events, 'utf8'), 'revoke:start\nrevoke:end\nadmission:refused\n');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});
