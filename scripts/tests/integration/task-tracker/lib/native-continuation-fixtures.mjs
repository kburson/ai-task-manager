// @story #1855
// Integration fixtures only; importing this module registers no tests.
import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { runVerbTest, runTestWithEntryInterlock } from '../../../../task-tracker/verbs/test.mjs';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { resolveVerificationProvider } from '../../../../task-tracker/lib/verification-provider-registry.mjs';
import { buildVerificationFingerprint, validateVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';
import { runDevelopVerification } from '../../../../task-tracker/verify-develop.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { buildInitialComment as initialTimingComment } from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';
import { stampEntryMarkers } from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { createTransitionId } from '../../../../task-tracker/lib/move-state/transition-commit.mjs';
import { moveState, defaultProbeCompletion } from '../../../../task-tracker/lib/move-state/move-state-core.mjs';
import { fileURLToPath } from 'node:url';
import { rawLifecycleSources } from '../../../helpers/native-lifecycle-sources.mjs';
import { evaluateNativeRevisionStageGuards } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { verbEnsureChecked, verbEnsureUnchecked, verbCheck } from '../../../../task-tracker/verbs/check.mjs';
import { buildInitialTrail, buildRow, appendCommitRow, updateMarker } from '../../../../task-tracker/lib/commit-trail.mjs';
import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';
import { parseFunctionalDodKeys } from '../../../../task-tracker/lib/functional-dod-evidence.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { GUARDS as nativeStageGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { runActorFlushJournal } from '../../../../task-tracker/lib/actor-flush-journal.mjs';
import { postTimingEvent } from '../../../../task-tracker/gh-timing-comment.mjs';
import { saveState } from '../../../../task-tracker/state.mjs';
import { saveMarker } from '../../../../task-tracker/word-counter.mjs';
import { readTimingCommentBody as nativeReadTimingBody, readCanonicalTimingSource as nativeReadTimingCensus } from '../../../../task-tracker/gh-timing-comment.mjs';

async function nativeFinalFixture({ configuredProject = false, scriptsRootVc = false, bodyStages = [], nativeStageLayout = false } = {}) {
  const s = createSandbox();
  try {
    const projectDir = s.context.sourceRoot;
    if (nativeStageLayout && process.env.AITM_NATIVE_STAGE_CONTEXT === '1') {
      process.chdir(projectDir);
      process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
    }
    const verify = 'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.equal(readFileSync(new URL("./source.txt", import.meta.url), "utf8"), "baseline\\n");';
    writeFileSync(path.join(projectDir, 'supported-hook.test.mjs'), verify);
    writeFileSync(path.join(projectDir, 'independent.test.mjs'), verify);
    writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'native-test-fixture', version: '1.0.0',
      scripts: Object.fromEntries(['lint', 'format:check', 'test:unit', 'test:integration', 'test:slow'].map(key => [key, 'node supported-hook.test.mjs'])) }));
    writeFileSync(path.join(projectDir, 'package-lock.json'), JSON.stringify({ name: 'native-test-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'native-test-fixture', version: '1.0.0' } } }));
    const provider = configuredProject ? { id: 'project',
      develop: { iterationSteps: [], finalSteps: [{ classification: 'lint-full', kind: 'lint', command: 'npm run lint' }] },
      test: { setup: 'npm-ci', steps: [{ classification: 'test-obsolete', kind: 'test', command: './scripts/obsolete-test.sh' }] },
    } : null;
    if (scriptsRootVc) {
      mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
      writeFileSync(path.join(projectDir, 'scripts/root-check.sh'), '#!/bin/sh\ntest "$(cat source.txt)" = baseline\n');
      chmodSync(path.join(projectDir, 'scripts/root-check.sh'), 0o755);
    }
    if (configuredProject) {
      mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
      writeFileSync(path.join(projectDir, 'scripts/obsolete-test.sh'), '#!/bin/sh\ntest "$(cat source.txt)" = baseline\n');
      chmodSync(path.join(projectDir, 'scripts/obsolete-test.sh'), 0o755);
    }
    execFileSync('git', ['add', '.'], { cwd: projectDir, env: s.env });
    execFileSync('git', ['commit', '-qm', 'Meaningful native Test fixture'], { cwd: projectDir, env: s.env });
    const initial = await approvedFixture({ worktree: projectDir, branch: 'trunk',
      sessionId: currentSessionId(), unstampedIndependent: true, sharedDodCitation: true, bodyState: 'develop', bodyStages, nativeStageLayout,
      independentCommand: scriptsRootVc ? './scripts/root-check.sh' : null });
    let backend = initial.backend; const context = initial.context;
    writeFileSync(path.join(projectDir, '.ai-task-manager', 'task-tracker.json'), JSON.stringify({ repo: context.repository, ...(provider ? { verificationProvider: provider } : {}) }));
    setActiveTask(currentSessionId(), { issue: `#${context.issue}`, entryStartTs: new Date().toISOString(),
      worktreePath: projectDir, worktreeBranch: 'trunk' }, projectDir);
    let body = backend.observation.body.bytes;
    const effects = [];
    let finalization = null, transportFault = null, writeAttempts = 0;
    const pexec = async (bin, args, options = {}) => {
      if (bin === 'gh' && args[1] === 'view') {
        if (transportFault === 'readback' && effects.includes('body-push')) {
          transportFault = null; throw new Error('fixture-native-readback-interrupted');
        }
        return { stdout: body };
      }
      if (bin === 'gh' && args[1] === 'edit') {
        writeAttempts++;
        if (transportFault === 'before-write') { transportFault = null; throw new Error('fixture-native-before-write-interrupted'); }
        effects.push('body-push'); body = options.input;
        const observation = backend.observation; observation.body = { bytes: body, version: parseBodyVersion(body) };
        backend.replaceAuthority(observation);
        backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
        if (transportFault === 'after-write') { transportFault = null; throw new Error('fixture-native-after-write-interrupted'); }
        return { stdout: '' };
      }
      if (bin === 'node' || (bin === 'git' && JSON.stringify(args) === JSON.stringify(['rev-parse', 'HEAD']))) return promisify(execFile)(bin, args, { ...options, cwd: projectDir, env: s.env });
      throw new Error(`Unexpected transport ${bin} ${args.join(' ')}`);
    };
    const invoke = async ({ entryInterlock = false, receiptMutation } = {}) => {
    let result, error;
    try {
      result = await (entryInterlock ? runTestWithEntryInterlock : runVerbTest)({ cfg: { repo: context.repository, ...(provider ? { verificationProvider: provider } : {}) }, issueNumber: context.issue, projectDir,
        deps: { revisionBackend: backend, writeDeps: { pexec }, fetchBody: async () => body,
          mutateBody: input => {
            const request = { issueNumber: input.issueNum, repo: context.repository,
              mutate: input.mutate, evidenceStamp: input.evidenceStamp, deps: { pexec, revisionBackend: backend } };
            return receiptMutation ? receiptMutation(request) : mutateIssueBody(request);
          },
          postComment: async () => { effects.push('comment'); },
          runDevelopFinalization: input => {
            finalization = runDevelopVerification({ ...input, mode: 'final' });
            effects.push('actual-finalization'); return finalization;
          },
          moveState: async () => { effects.push('stage-boundary'); return { ok: false, reason: 'stage-continuation-next-frontier' }; },
        } });
    } catch (caught) { error = caught; }
    return { result, error, finalization };
    };
    return { s, context, projectDir, effects, invoke, pexec,
      failTransport(point) { transportFault = point; }, get writeAttempts() { return writeAttempts; }, get backend() { return backend; },
      restart(alter) { const snapshot = JSON.parse(JSON.stringify(backend.snapshot)); if (alter) alter(snapshot);
        backend = createRevisionMemory(snapshot); body = backend.observation.body.bytes; },
      dispose() { s.dispose(); } };
  } catch (error) { s.dispose(); throw error; }
}

function freshStageContext(ctx) {
  const { transitionId, ...fresh } = ctx;
  return fresh;
}

async function nativeCheckboxFixture(kind = 'ac') {
  const f = await nativeFinalFixture();
  try {
    const label = kind === 'ac' ? 'Supported model hooks' : 'Shared DoD';
    const input = () => ({ cfg: { repo: f.context.repository }, projectDir: f.projectDir,
      statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'), rest: [label],
      pexec: f.pexec, deps: { revisionBackend: f.backend, getLiveState: async () => 'develop' } });
    await (kind === 'ac' ? verbAcStamp : verbDodStamp)({ ...input(), rest: [kind === 'ac' ? label : 'tests'] });
    if (kind === 'dod') assert.ok(parseFunctionalDodKeys(f.backend.observation.body.bytes).find(item => item.key === 'tests')?.evidenceMarker, 'actual stamped VC declaration must remain readable before the native evidence gate');
    return { f, label, check: (desired, overrides = {}) => (desired === 'unchecked' ? verbEnsureUnchecked : verbEnsureChecked)({ ...input(), ...overrides }) };
  } catch (error) { f.dispose(); throw error; }
}

function nativeStageItemPairs(context, cfg) {
  const [owner, repo] = context.repository.split('/');
  const content = { __typename: 'Issue', id: 'I_native_subject', number: context.issue, repository: { nameWithOwner: context.repository } };
  const status = { __typename: 'ProjectV2ItemFieldSingleSelectValue', id: 'VALUE_status', name: 'Develop',
    optionId: cfg.kanbanOptionDevelop, field: { id: cfg.kanbanFieldId, name: 'Status' } };
  const item = { id: 'PVTI_subject', project: { id: cfg.projectId }, content,
    fieldValues: { nodes: [status], totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null } } };
  // Separate native response payloads never share object identities.
  return JSON.parse(JSON.stringify({ membership: [{ request: { owner, repo, issue: context.issue, after: null },
    response: { repository: { nameWithOwner: context.repository, issue: { number: context.issue,
      projectItems: { nodes: [item], totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null } } } } } }],
    fields: [], final: [{ request: { item: item.id }, response: { node: { id: item.id, project: item.project,
      content, fieldValueByName: status } } }] }));
}

function nativeAssignmentPairs(context, paginated) {
  const [owner, repo] = context.repository.split('/');
  const subject = { owner, repo, issue: context.issue };
  const assignees = { nodes: [{ login: 'native-fixture-owner' }] };
  const item = { id: 'PVTI_subject', project: { id: 'PVT_fixture' }, fieldValueByName: { name: 'Develop' } };
  const page = (cursor, nodes, hasNextPage, endCursor) => ({ request: { ...subject, cursor },
    response: { repository: { issue: { assignees: structuredClone(assignees), projectItems: {
      nodes, pageInfo: { hasNextPage, endCursor },
    } } } } });
  return paginated ? { pages: [page(null, [], true, 'native-next'), page('native-next', [item], false, null)],
    final: [{ request: { ...subject, item: item.id }, response: {
      repository: { issue: { assignees: structuredClone(assignees) } },
      node: { project: { id: 'PVT_fixture' }, fieldValueByName: { name: 'Develop' } },
    } }] } : { pages: [page(null, [item], false, null)], final: [] };
}

function nativeTimingSources(context, comments) {
  const [owner, name] = context.repository.split('/');
  return {
    legacy: { request: { file: 'gh', args: ['issue', 'view', String(context.issue), '-R', context.repository, '--json', 'comments'] },
      response: { stdout: JSON.stringify({ comments }), stderr: '', exitCode: 0 } },
    pages: [{ request: { owner, name, issue: context.issue, after: null },
      response: { data: { repository: { nameWithOwner: context.repository, issue: { number: context.issue,
        comments: { nodes: comments.map(({ id, body }) => ({ id, body })), totalCount: comments.length, pageInfo: { hasNextPage: false, endCursor: null } } } } } } }],
  };
}

export { test, createHash, assert, fixture, runVerbTest, runTestWithEntryInterlock, execFileSync, execFile, promisify, writeFileSync, mkdirSync, chmodSync, rmSync, path, createSandbox, approvedFixture, resolveVerificationProvider, buildVerificationFingerprint, validateVerificationReceipt, runDevelopVerification, mutateIssueBody, parseBodyVersion, hashBytes, observeRevision, createRevisionMemory, setActiveTask, currentSessionId, initialTimingComment, withRevisionConsumer, parseVerificationCommands, stampEntryMarkers, createTransitionId, moveState, defaultProbeCompletion, fileURLToPath, rawLifecycleSources, evaluateNativeRevisionStageGuards, verbAcStamp, verbEnsureChecked, verbEnsureUnchecked, verbCheck, buildInitialTrail, buildRow, appendCommitRow, updateMarker, verbDodStamp, parseFunctionalDodKeys, runIssueBodyVerb, runPlanApprove, nativeStageGuards, existsSync, readdirSync, statSync, readFileSync, runActorFlushJournal, postTimingEvent, saveState, saveMarker, nativeReadTimingBody, nativeReadTimingCensus, nativeFinalFixture, freshStageContext, nativeCheckboxFixture, nativeStageItemPairs, nativeAssignmentPairs, nativeTimingSources };
