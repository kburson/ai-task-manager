// @story #2100
// Real Git/source proofs, Close guards and outcome writer. Provider IO is local fixture transport.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fixture, ISSUE, NOW } from './close-v5-fixture.mjs';
import { installProvider } from './native-close-provider.mjs';
import { canonicalSupersession } from './2096-close-recovery-outcome.mjs';
import { canonicalTestReceiptFixture } from '../fixtures/estimation-verification.mjs';
import { runClose, closeBody } from './close-convergence-wiring-helpers.mjs';
import { setActiveTask } from '../../task-tracker/session-state.mjs';
import { captureArtifactOperator } from '../../task-tracker/lib/artifact-execution.mjs';
import {
  buildArtifactVerificationFingerprint,
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../task-tracker/lib/verification-receipt.mjs';
import { stampAgentReviewPassed } from '../../task-tracker/lib/agent-review/review-gate.mjs';
import {
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../task-tracker/lib/delivery-records.mjs';
import {
  upsertDeliveredCloseTransaction,
  readDeliveredCloseTransactions,
} from '../../task-tracker/lib/close-convergence.mjs';
import { withProcessRecordClaim } from '../../task-tracker/lib/estimation/record-claim.mjs';
import { createEstimationOutcomeRuntime } from '../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { timingActorKey, timingActorMarker } from '../../task-tracker/lib/timing-actor.mjs';

export async function partialCloseFixture() {
  const f = fixture({ historyDepth: 3 });
  const g = f.context.delivery.gateInput;
  const repository = f.cfg.repo;
  const sources = g.pullRequest.sourceCommitEvidence;
  const acceptedSha = g.acceptedSha;
  const artifactSubject = { commitSha: acceptedSha, treeSha: sources.at(-1).tree };
  const transaction = (transactionId, sha, completedSteps = []) => ({
    schema: 'aitm.delivered-close/v1',
    transactionId,
    issueNumber: ISSUE,
    acceptedSha: sha,
    reviewAuthority: 'human-gate',
    completedSteps,
  });
  const first = await canonicalSupersession({
    repository,
    issueNumber: ISSUE,
    oldTransaction: transaction('original', sources[0].oid, ['timing', 'estimation', 'lifecycle']),
    newAcceptedSha: sources[1].oid,
    replacementTransactionId: 'middle',
  });
  const second = await canonicalSupersession({
    repository,
    issueNumber: ISSUE,
    oldTransaction: transaction('middle', sources[1].oid),
    newAcceptedSha: acceptedSha,
    replacementTransactionId: 'current',
  });
  second.comment.id = 43;
  const supersessions = [first.comment, second.comment];
  const records = [];
  const actor = timingActorKey({ provider: 'codex', sid: 'fixture-close-wiring' });
  let timingBody =
    [
      'Timing Log',
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        timingActorMarker(actor) +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
    ].join('\n') + '\n';
  let body = '';
  let selectedSha = sources[0].oid;
  const oldBody = canonicalTestReceiptFixture({ issue: ISSUE, sha: selectedSha }).body;
  let writes = 0;
  let authorityHook = null;
  let claimHook = null;
  let claimHeld = false;
  let deliveryHook = null;
  const runtime = (options = {}) =>
    createEstimationOutcomeRuntime({
      cfg: f.cfg,
      projectDir: f.dir,
      ...options,
      ...(options.resolveDeliveryAuthority
        ? {
            resolveDeliveryAuthority: async (input) => {
              if (claimHeld)
                await deliveryHook?.({
                  changeJournal: () => {
                    body = upsertDeliveredCloseTransaction(body, {
                      ...readDeliveredCloseTransactions(body)[0],
                      transactionId: 'changed-late-journal',
                    });
                    saveProvider();
                  },
                });
              return options.resolveDeliveryAuthority(input);
            },
          }
        : {}),
      ...(options.resolvePartialCloseOutcomeCorrection
        ? {
            resolvePartialCloseOutcomeCorrection: async (input) => {
              await authorityHook?.(input, {
                changeJournal: () => {
                  body = upsertDeliveredCloseTransaction(body, {
                    ...readDeliveredCloseTransactions(body)[0],
                    transactionId: 'changed-journal',
                  });
                  saveProvider();
                },
              });
              return options.resolvePartialCloseOutcomeCorrection(input);
            },
          }
        : {}),
      deps: {
        readIssueBody: async () => body || oldBody,
        childOutcomeRecordIds: async () => ({ childCount: 0, recordIds: [] }),
        recordIo: {
          withLogicalRecordClaim: (input, fn) =>
            withProcessRecordClaim(input, async () => {
              if (options.resolvePartialCloseOutcomeCorrection) await claimHook?.(records);
              claimHeld = true;
              try {
                return await fn();
              } finally {
                claimHeld = false;
              }
            }),
          graphql: async () => {
            throw new Error('unexpected GraphQL');
          },
          listIssueRecords: async () => structuredClone(records),
          write: async ({ envelope }) => {
            writes++;
            const record = { commentNodeId: `IC_outcome_${records.length}`, envelope };
            records.push(record);
            return record;
          },
        },
        readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
        readCanonicalTimingSource: async () => ({
          status: 'found',
          source: { repository, issue: ISSUE, commentNodeId: 'IC_timing', body: timingBody },
        }),
        readDiffEvidence: async () => ({
          verificationSha: selectedSha,
          commitSha: selectedSha,
          filesChanged: 1,
          modules: ['close'],
          lanes: ['unit'],
          dependencyBreadth: 0,
        }),
      },
    });
  await runtime({ resolveVerificationSha: () => selectedSha }).ensure({
    issueNumber: ISSUE,
    forecastRecordId: null,
    body: oldBody,
  });
  const original = structuredClone(records[0]);
  selectedSha = acceptedSha;
  let initialized = false;
  const bin = path.join(f.dir, '.tmp', 'bin');
  mkdirSync(bin, { recursive: true });
  const dataPath = path.join(bin, 'provider.json');
  installProvider(bin, dataPath);
  const previousPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + previousPath;
  const git = (args) => execFileSync('git', args, { cwd: f.dir, encoding: 'utf8' });
  git(['update-ref', 'refs/remotes/origin/trunk', f.merged]);
  git(['update-ref', 'refs/heads/trunk', f.merged]);
  git(['remote', 'add', 'origin', f.dir]);
  const providerComments = [
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
      body: `### Commits\n<!-- aitm-commits shas="${acceptedSha}" -->`,
      created_at: NOW,
      updated_at: NOW,
    },
    ...supersessions,
  ];
  const saveProvider = () =>
    writeFileSync(
      dataPath,
      JSON.stringify({
        body,
        comments: providerComments,
        pr: g.pullRequest,
        merged: f.merged,
        issue: ISSUE,
        evidence: sources,
      })
    );
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    setActiveTask(
      'fixture-close-wiring',
      {
        issue: ISSUE,
        bindingGenerationId: 'outcome-native',
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
    const test = createVerificationReceipt({
      issueNumber: ISSUE,
      stage: 'test',
      fingerprint,
      commands,
    });
    body = stampAgentReviewPassed(
      upsertVerificationReceipt(
        '## User Story\nClose safely\n\n## Scope\nRecover ordinary partial delivery\n\n' +
          closeBody()
            .replace(/<!-- aitm-fields:.*?-->/, '')
            .replace('### Functional', '## Definition of Done\n\n### Functional') +
          '\n## Delivery metadata\n' +
          g.body
            .slice(g.body.indexOf('<!-- aitm-entered-backlog'))
            .replace(/<!--\s*aitm-review-approved[^>]*-->/g, '')
            .replace(/^- \[x\] Agent Review Passed.*$/gm, '') +
          `\n<!-- aitm-test-started sha="${acceptedSha}" ts="${NOW}" -->\n<!-- aitm-review-approved ts="${NOW}" approved-sha="${acceptedSha}" -->\n<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null,"sessionTime":null,"reviewTime":null,"planTime":null}} -->`,
        test
      ),
      { ts: NOW, validators: ['body-sections'] }
    );
    body = upsertDeliveredCloseTransaction(body, transaction('current', acceptedSha));
    saveProvider();
  };
  const terminal = { board: false, disposition: false, issue: false, binding: false };
  const invoke = async ({
    interrupt = false,
    interruptBeforeCheckpoint = null,
    alterTiming = false,
  } = {}) => {
    if (alterTiming) timingBody = 'tampered\n' + timingBody;
    let interrupted = false;
    const result = await runClose({
      issueNumber: ISSUE,
      repository,
      body,
      acceptedSha,
      localHeadSha: acceptedSha,
      operatorProjectDir: f.dir,
      configOverrides: { ...f.cfg, projectId: 'PVT_native', fieldDisposition: 'F_disposition' },
      boardState: terminal.board ? 'done' : 'review',
      closeSnapshot: {
        issueClosed: terminal.issue,
        stateReason: terminal.issue ? 'completed' : null,
      },
      useInjectedDeliveryGateInput: false,
      useInjectedReviewAuthorization: false,
      useInjectedDeliveryReceipt: false,
      useInjectedFreshDeliveryVerification: false,
      gateReviewToDone: true,
      liveLabels: [],
      bindingReleaseStatus: terminal.binding ? 'released' : 'pending',
      terminalDisposition: terminal.disposition ? 'Delivered' : null,
      timingBody,
      timingProjection: { status: 'incomplete' },
      supersessionComments: supersessions,
      extraRest: ['--artifact-commit', acceptedSha],
      createEstimationOutcomeWriter: runtime,
      initializeNativeAuthority: async () => {
        setActiveTask(
          'fixture-close-wiring',
          {
            issue: ISSUE,
            bindingGenerationId: 'outcome-native',
            worktreePath: f.dir,
            worktreeBranch: g.branch,
            entryStartTs: NOW,
          },
          f.dir
        );
        initialize();
        return body;
      },
      mutationResult: ({ nextBody }) => {
        const next = readDeliveredCloseTransactions(nextBody)[0];
        for (const effect of Object.keys(terminal))
          if (next.completedSteps.includes(effect)) terminal[effect] = true;
        if (next.completedSteps.length === interruptBeforeCheckpoint)
          throw new Error('checkpoint interruption ' + interruptBeforeCheckpoint);
        if (interrupt && !interrupted && records.length > 1) {
          interrupted = true;
          throw new Error('interrupt after actual outcome publication');
        }
        body = nextBody;
        saveProvider();
        return { status: 'ok', body };
      },
      pexecOverride: async (command, args) => {
        initialize();
        if (command === 'gh' && args[0] === 'issue' && args[1] === 'close') return { stdout: '' };
        if (command === 'gh' && args[0] === 'issue' && args[1] === 'edit') return { stdout: '' };
        return { stdout: execFileSync(command, args, { cwd: f.dir, encoding: 'utf8' }) };
      },
      contextOverrides: {
        artifactSubject,
        loadCloseDeliveryBody: async () => {
          initialize();
          return body;
        },
        resolveIssueWorkspace: () => f.dir,
      },
    });
    return { ...result, body, records: structuredClone(records), writes };
  };
  return {
    invoke,
    original,
    records,
    supersessions,
    acceptedSha,
    repository,
    sources,
    changeTiming: () => {
      timingBody = 'changed during claim\n' + timingBody;
    },
    setDeliveryHook: (hook) => {
      deliveryHook = hook;
    },
    setClaimHook: (hook) => {
      claimHook = hook;
    },
    setAuthorityHook: (hook) => {
      authorityHook = hook;
    },
    transaction: () => readDeliveredCloseTransactions(body)[0],
    cleanup: () => {
      process.env.PATH = previousPath;
      rmSync(f.dir, { recursive: true, force: true });
    },
  };
}
