// @story #2100
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixture, ISSUE, NOW } from '../../../helpers/close-v5-fixture.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { captureArtifactOperator } from '../../../../task-tracker/lib/artifact-execution.mjs';
import {
  buildArtifactVerificationFingerprint,
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { stampAgentReviewPassed } from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import {
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { runGuardExecution } from '../../../../task-tracker/lib/move-state/guard-execution.mjs';
const { sid } = initializeFixtureActor(import.meta.url);
// Real guard registry, source artifact, session ledger, Git history and proof.
// Only the external GitHub transport is replaced by a fixture executable.
for (const variant of [
  { name: 'verified', ready: true },
  { name: 'changed content', changed: true },
  { name: 'foreign owner', claim: 'foreign-owner' },
  { name: 'missing receipt', missingReceipt: true },
  { name: 'different remote target', targetDrift: true },
])
  test(`native inner Done guard ${variant.ready ? 'accepts' : 'refuses'} ${variant.name} secondary attribution`, async () => {
    const f = fixture({ ...variant, shared: true });
    const previousPath = process.env.PATH;
    try {
      const g = f.context.delivery.gateInput;
      const artifactSubject = {
        commitSha: g.acceptedSha,
        treeSha: f.context.delivery.gateInput.pullRequest.sourceCommitEvidence[0].tree,
      };
      setActiveTask(
        sid,
        {
          issue: ISSUE,
          bindingGenerationId: 'native-inner-guard',
          worktreePath: f.dir,
          worktreeBranch: g.branch,
          entryStartTs: NOW,
        },
        f.dir
      );
      const operatorContext = captureArtifactOperator({ projectDir: f.dir, issueNumber: ISSUE });
      const fingerprint = buildArtifactVerificationFingerprint({
        projectDir: f.dir,
        artifactSubject,
        operatorContext,
        verificationCommands: [],
      });
      fingerprint.environment.sandbox = { kind: 'worktree', identity: f.dir, clean: true };
      const commands = [
        ['lint-full', 'lint'],
        ['format-full', 'format:check'],
        ['test-unit', 'test:unit'],
        ['test-integration', 'test:integration'],
        ['test-slow', 'test:slow'],
      ].map(([classification, script]) => ({
        classification,
        command: 'npm',
        args: ['run', script],
        exitCode: 0,
        durationMs: 1,
      }));
      const receipt = createVerificationReceipt({
        issueNumber: ISSUE,
        stage: 'test',
        fingerprint,
        commands,
      });
      const body = stampAgentReviewPassed(
        upsertVerificationReceipt(
          g.body + `\n<!-- aitm-test-started sha="${g.acceptedSha}" ts="${NOW}" -->`,
          receipt
        ),
        { ts: NOW, validators: ['body-sections'] }
      );
      const comments = [
        {
          id: 1,
          body: renderDeliveryIntentComment(g.records.liveIntent.record),
          created_at: NOW,
          updated_at: NOW,
        },
        {
          id: 2,
          body: renderDeliveryReceiptComment(g.records.matchingReceipt.record),
          created_at: NOW,
          updated_at: NOW,
        },
        {
          id: 3,
          body: `### 🔗 Commits\n<!-- aitm-commits shas="${g.acceptedSha}" -->`,
          created_at: NOW,
          updated_at: NOW,
        },
      ];
      execFileSync('git', ['update-ref', 'refs/remotes/origin/trunk', f.merged], { cwd: f.dir });
      execFileSync(
        'git',
        ['update-ref', 'refs/heads/trunk', variant.targetDrift ? g.acceptedSha : f.merged],
        { cwd: f.dir }
      );
      execFileSync('git', ['remote', 'add', 'origin', f.dir], { cwd: f.dir });
      const bin = path.join(f.dir, '.tmp', 'bin');
      mkdirSync(bin, { recursive: true });
      const dataPath = path.join(bin, 'provider.json');
      writeFileSync(
        dataPath,
        JSON.stringify({
          body,
          comments: variant.missingReceipt ? comments.filter(({ id }) => id !== 2) : comments,
          pr: g.pullRequest,
          merged: f.merged,
          issue: ISSUE,
          evidence: g.pullRequest.sourceCommitEvidence,
        })
      );
      writeFileSync(
        path.join(bin, 'gh'),
        `#!${process.execPath}
import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync(${JSON.stringify(dataPath)},'utf8'));
const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(path.join(bin, 'calls.log'))},JSON.stringify(a)+'\\n');
let out;
if(a[0]==='issue'&&a[1]==='view'&&a.includes('blockedBy'))out={blockedBy:{nodes:[],totalCount:0,pageInfo:{hasNextPage:false}}};
else if(a[0]==='issue'&&a[1]==='view')out=a.includes('.comments')?d.comments:a.includes('.body')?d.body:{body:d.body,comments:d.comments};
else if(a.includes('graphql')&&a.some(x=>x.includes('pullRequest(number:')))out={data:{repository:{pullRequest:{headRefOid:d.pr.headRefOid,commits:{totalCount:d.evidence.length,nodes:d.evidence.map(c=>({commit:{oid:c.oid,messageHeadline:c.message,message:c.message,tree:{oid:c.tree},parents:{totalCount:c.parents.length,nodes:c.parents.map(oid=>({oid})),pageInfo:{hasNextPage:false}}}})),pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else if(a.includes('graphql'))out={data:{repository:{issue:{id:'I_fixture',number:d.issue,body:d.body,parent:null,projectItems:{nodes:[{id:'PVTI_fixture',project:{id:'P'},fieldValueByName:null,fieldValues:{nodes:[],pageInfo:{hasNextPage:false}}}],pageInfo:{hasNextPage:false,endCursor:null}},subIssues:{nodes:[],totalCount:0,pageInfo:{hasNextPage:false}},comments:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else if(a[0]==='pr'&&a[1]==='list')out=[{...d.pr,mergeCommit:{oid:d.merged}}];
else if(a[0]==='pr'&&a[1]==='view')out={...d.pr,mergeCommit:{oid:d.merged}};
else if(a.some(x=>x.endsWith('pulls')))out=[[{number:d.pr.number}]];
else if(a.some(x=>x.includes('sub_issues')))out=[[]];
else if(a.some(x=>x.includes('comments')))out=[d.comments];
else if(a.some(x=>x.includes('dependencies')))out=[];
else if(a.some(x=>x.includes('git/ref/heads')))out={ref:'refs/heads/feature/1878'};
else {process.stderr.write('unexpected provider '+JSON.stringify(a));process.exit(2);}
process.stdout.write(typeof out==='string'?out:JSON.stringify(out));
`,
        { mode: 0o755 }
      );
      process.env.PATH = bin + path.delimiter + previousPath;
      const pexec = async (command, args, options = {}) => ({
        stdout: execFileSync(command, args, { ...options, cwd: f.dir, encoding: 'utf8' }),
      });
      const result = await runGuardExecution({
        issueArg: String(ISSUE),
        stateArg: 'done',
        resolvedFromState: 'review',
        verbContext: 'close',
        plan: { runGuardPipeline: true },
        SKIP_NETWORK: false,
        cfg: { ...f.cfg, fieldDisposition: 'F_disposition' },
        projectDir: f.dir,
        pexec,
        gh: async (args) => (await pexec('gh', args)).stdout,
        resolveLiveStateName: async () => 'done',
        artifactSubject,
        _currentSessionId: () => sid,
        _loadSession: () => ({}),
      });
      assert.equal(
        result.exit,
        variant.ready ? null : 4,
        readFileSync(path.join(bin, 'calls.log'), 'utf8')
      );
    } finally {
      process.env.PATH = previousPath;
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
