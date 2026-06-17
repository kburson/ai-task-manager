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
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { headSha, nowIso, runVerifiers } from '../lib/evidence-runner.mjs';
import { findEvidenceAc, stampAcEvidenceAndReconcile } from '../lib/ac-evidence.mjs';

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

  const { stdout: body } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const target = findEvidenceAc(body, label);
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

  console.log(
    `[task-tracker] ac-stamp on ${s.active}: running ${target.evidenceCommands.length} verifier(s) for AC "${target.label}"…`
  );
  const { ran, firstFailure } = await runVerifiers({
    commands: target.evidenceCommands,
    pexec,
    cwd: projectDir,
  });
  for (const r of ran) {
    const tag = r.exit === 0 ? '✓' : '✗';
    console.log(`  ${tag} ${r.cmd} (exit=${r.exit})`);
  }
  if (firstFailure) {
    console.error(
      `[task-tracker] ac-stamp: verifier \`${firstFailure.cmd}\` failed (exit=${firstFailure.exit}). No marker stamped.`
    );
    process.exit(1);
  }

  const sha = await headSha(pexec);
  const ts = nowIso(ctx.deps);
  const canonicalCmd = ran[0]?.cmd || '';

  await mutateIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    deps: { pexec },
    mutate: (base) =>
      stampAcEvidenceAndReconcile(base, label, { cmd: canonicalCmd, sha, ts, exit: 0 }),
  });

  console.log(
    `[task-tracker] ✓ ac-stamp on ${s.active}: aitm-ac-evidence:${target.key} marker stamped (sha=${sha}).`
  );
}
