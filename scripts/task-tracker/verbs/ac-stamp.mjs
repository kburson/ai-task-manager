import { stampDeclarationIdentity } from '../lib/stamp-declaration.mjs';
import { validateArtifactSubject } from '../lib/artifact-subject.mjs';
import {
  captureArtifactOperator,
  assertNativeArtifactOperator,
} from '../lib/artifact-execution.mjs';
// #345 — `/task ac-stamp "<ac label>"` runs the verifier command(s) declared by
// an Acceptance Criteria checkbox line's `aitm-verified-by` markers and stamps
// the resulting evidence marker
// (`<!-- aitm-ac-evidence:KEY cmd="…" exit=0 sha=<head> ts=<ISO> -->`) onto the
// matched line. Refuses on non-zero exit. After stamping, `/task check
// "<label>"` will pass the AC evidence-marker gate.
//
// Sibling of #303's `dod-stamp` (Functional DoD keys); shares the verifier
// runner in `lib/evidence-runner.mjs`. The AC key is the label hash (ACs carry
// no human-assigned key), derived by `acKeyForLabel`.

import { loadState } from '../state.mjs';
import { verifierCacheBaseDir } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody as nativeMutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { headSha, nowIso, runVerifiers } from '../lib/evidence-runner.mjs';
import { findEvidenceAc, stampAcEvidenceAndReconcile } from '../lib/ac-evidence.mjs';
import { assertVerifierStateAllowed } from '../lib/verifier-state-gate.mjs';
import { decideStampExecutionFromEnv } from '../lib/stamp-receipt-reuse.mjs';
import { captureEvidenceProvenance } from '../lib/evidence-provenance.mjs';
import {
  readDirectoryContract,
  writeDirectoryContractOperation,
} from '../lib/github-records/contract-write.mjs';

export async function verbAcStamp(ctx) {
  const { cfg, statePath, rest, pexec, projectDir } = ctx;
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.error('[task-tracker] ac-stamp: no active task');
    process.exit(1);
  }
  const label = String((rest || []).join(' ')).trim();
  if (!label) {
    console.error('Usage: /task ac-stamp "<acceptance criterion label>"');
    process.exit(1);
  }
  const issueNum = s.active.replace(/^#/, '');
  const operatorContext = ctx.artifactSubject
    ? captureArtifactOperator({ projectDir, issueNumber: issueNum })
    : null;
  const mutateIssueBody = (input) =>
    nativeMutateIssueBody({
      ...input,
      validateFreshBase: (base) => {
        const freshTarget = findEvidenceAc(base, label);
        if (stampDeclarationIdentity(base, freshTarget) !== declarationIdentity)
          throw new Error(
            'ac-stamp: verifier declaration changed; run the current declaration again'
          );
        if (ctx.artifactSubject) {
          validateArtifactSubject({ projectDir, artifactSubject: ctx.artifactSubject });
          assertNativeArtifactOperator({ projectDir, issueNumber: issueNum, operatorContext });
        }
        input.validateFreshBase?.(base);
      },
    });

  const { stdout: body } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const directory = await readDirectoryContract({
    repository: cfg.repo,
    issue: Number(issueNum),
    issueBody: body,
    readContractRecord: ctx.deps?.contractWrite?.readContractRecord,
  });
  if (directory && ctx.artifactSubject)
    throw new Error('artifact: directory authority unsupported');
  const contractTarget = directory?.contract.acceptanceCriteria.find(
    (entry) => entry.text.replace(/\s+/g, ' ').trim() === label.replace(/\s+/g, ' ').trim()
  );
  const target = directory
    ? contractTarget && {
        ...contractTarget,
        key: contractTarget.logicalId,
        label: contractTarget.text,
        evidenceCommands: directory.contract.verificationCommands.map((entry) => entry.command),
      }
    : findEvidenceAc(body, label);
  if (!target) {
    console.error(
      `[task-tracker] ac-stamp: no Acceptance Criteria line carrying \`aitm-verified-by\` matching "${label}" found in #${issueNum} body.`
    );
    process.exit(1);
  }
  if (!target.evidenceCommands.length) {
    console.error(
      `[task-tracker] ac-stamp: AC "${target.label}" carries no verifier command. Add one (e.g. \`<!-- aitm-verified cmd="\\\`npm test\\\`" -->\`) before stamping.`
    );
    process.exit(1);
  }

  const declarationIdentity = stampDeclarationIdentity(body, target);

  const decision = await decideStampExecutionFromEnv({
    commands: target.evidenceCommands,
    body,
    issueNumber: issueNum,
    cfg,
    pexec,
    projectDir,
    deps: ctx.deps,
    artifactSubject: ctx.artifactSubject,
  });
  if (decision.action === 'refuse') {
    console.error(`[task-tracker] ac-stamp: ${decision.message}`);
    process.exit(1);
  }
  if (decision.action === 'reuse') {
    const sha = decision.receipt?.commitSha || (await headSha(pexec));
    const ts = decision.receipt?.completedAt || nowIso(ctx.deps);
    const canonicalCmd = String(target.evidenceCommands[0] || '').replace(/^`+|`+$/g, '');
    const executionContext = decision.receipt?.executionContext;
    console.log(
      `[task-tracker] ac-stamp on ${s.active}: reusing Test receipt ${decision.receipt?.receiptId}; standard commands were not rerun.`
    );
    if (directory) {
      await writeDirectoryContractOperation({
        repository: cfg.repo,
        issue: Number(issueNum),
        issueBody: body,
        action: 'record-evidence',
        kind: 'acceptanceCriteria',
        logicalId: target.logicalId,
        evidence: {
          command: canonicalCmd,
          result: 'passed',
          sha,
          ts,
          ...(executionContext ? { executionContext } : {}),
        },
        pexec,
        deps: ctx.deps?.contractWrite,
      });
      console.log(
        `[task-tracker] ✓ ac-stamp on ${s.active}: accepted Delivery Contract evidence for ${target.logicalId} (sha=${sha}).`
      );
      return;
    }
    await mutateIssueBody({
      issueNumber: issueNum,
      repo: cfg.repo,
      deps: { pexec },
      evidenceStamp: true,
      mutate: (base) =>
        stampAcEvidenceAndReconcile(base, label, {
          cmd: canonicalCmd,
          sha,
          ts,
          exit: 0,
          ...(executionContext || {}),
        }),
    });
    console.log(
      `[task-tracker] ✓ ac-stamp on ${s.active}: evidence stamped from Test receipt (sha=${sha}).`
    );
    return;
  }

  const gate = await assertVerifierStateAllowed({
    issueNumber: issueNum,
    cfg,
    commands: target.evidenceCommands,
    deps: ctx.deps,
  });
  if (!gate.allowed) {
    console.error(`[task-tracker] ac-stamp: ${gate.message}`);
    process.exit(1);
  }

  console.log(
    `[task-tracker] ac-stamp on ${s.active}: running ${target.evidenceCommands.length} verifier(s) for AC "${target.label}"…`
  );
  const {
    ran,
    firstFailure,
    sha: runSha,
    executionContext: sourceExecutionContext,
  } = await runVerifiers({
    commands: target.evidenceCommands,
    pexec,
    cwd: projectDir,
    artifactSubject: ctx.artifactSubject,
    boundIssue: issueNum,
    installDependencies: Boolean(ctx.artifactSubject),
    // #446 — content-addressed suite-run cache. The store lives in the REAL
    // project's machine-local tree (`.tmp/aitm/cache/`, #573), decoupled from
    // `cwd`, so repeat stamps of the same heavyweight command at one clean HEAD
    // collapse to a single real run.
    cache: { dir: verifierCacheBaseDir(projectDir) },
  });
  for (const r of ran) {
    const tag = r.exit === 0 ? '✓' : '✗';
    const cachedNote = r.cached ? ' ↺ cached' : '';
    console.log(`  ${tag} ${r.cmd} (exit=${r.exit})${cachedNote}`);
  }
  if (firstFailure) {
    console.error(
      `[task-tracker] ac-stamp: verifier \`${firstFailure.cmd}\` failed (exit=${firstFailure.exit}). No marker stamped.`
    );
    process.exit(1);
  }

  // #446 — on a cache hit the marker must attribute the ORIGINAL real run: use
  // the recorded `sha`/`ts` returned by the runner, never a fresh clock. The
  // returned `runSha` equals the recorded sha by construction (a hit is only
  // admitted at the matching HEAD).
  const sha = runSha && runSha !== 'unknown' ? runSha : await headSha(pexec);
  const ts = ran[0]?.ts || nowIso(ctx.deps);
  const canonicalCmd = ran[0]?.cmd || '';
  const executionContext =
    sourceExecutionContext ??
    captureEvidenceProvenance({
      projectDir,
      boundIssue: issueNum,
    });

  if (directory) {
    await writeDirectoryContractOperation({
      repository: cfg.repo,
      issue: Number(issueNum),
      issueBody: body,
      action: 'record-evidence',
      kind: 'acceptanceCriteria',
      logicalId: target.logicalId,
      evidence: {
        command: canonicalCmd,
        result: 'passed',
        sha,
        ts,
        executionContext,
      },
      pexec,
      deps: ctx.deps?.contractWrite,
    });
    console.log(
      `[task-tracker] ✓ ac-stamp on ${s.active}: accepted Delivery Contract evidence for ${target.logicalId} (sha=${sha}).`
    );
    return;
  }

  await mutateIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    deps: { pexec },
    // #522 — sanctioned stamper: the evidence is derived from the real
    // verifier run executed just above, so the proof-introduction guard is
    // bypassed for this minting site.
    evidenceStamp: true,
    mutate: (base) =>
      stampAcEvidenceAndReconcile(base, label, {
        cmd: canonicalCmd,
        sha,
        ts,
        exit: 0,
        ...executionContext,
      }),
  });

  console.log(
    `[task-tracker] ✓ ac-stamp on ${s.active}: run-props (key=${target.key}) upserted onto the AC line's aitm-verified marker (sha=${sha}).`
  );
}
