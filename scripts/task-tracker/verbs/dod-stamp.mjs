// #303 — `/task dod-stamp <key>` runs the verifier command(s) declared by a
// stampable Functional DoD item's `aitm-verified-by` markers and stamps the
// resulting evidence marker
// (`<!-- aitm-dod-evidence:KEY cmd="…" exit=0 sha=<head> ts=<ISO> -->`)
// onto the keyed line. Refuses on non-zero exit. After stamping, `/task check
// "<label>"` will pass the evidence-marker gate.
//
// Stampable keys (`tests`, `lint`, `commits`) only. Derived keys (`acs`,
// `checkboxes`) are computed by `verbs/close.mjs` at close time.

import path from 'node:path';
import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { headSha, nowIso, runVerifiers } from '../lib/evidence-runner.mjs';
import {
  KEY_CLASSIFICATION,
  STAMPABLE_KEYS,
  parseFunctionalDodKeys,
  stampEvidenceMarker,
} from '../lib/functional-dod-evidence.mjs';

export async function verbDodStamp(ctx) {
  const { cfg, statePath, rest, pexec, projectDir } = ctx;
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.error('[task-tracker] dod-stamp: no active task');
    process.exit(1);
  }
  const key = String(rest?.[0] || '')
    .toLowerCase()
    .trim();
  if (!key) {
    console.error(`Usage: /task dod-stamp <key>\n  key ∈ { ${STAMPABLE_KEYS.join(', ')} }`);
    process.exit(1);
  }
  if (!(key in KEY_CLASSIFICATION)) {
    console.error(`[task-tracker] dod-stamp: unknown key "${key}"`);
    process.exit(1);
  }
  if (KEY_CLASSIFICATION[key] === 'derived') {
    console.error(
      `[task-tracker] dod-stamp: key "${key}" is DERIVED — it is computed from the body at close time. Do not stamp manually; \`/task close\` will derive it.`
    );
    process.exit(1);
  }
  const issueNum = s.active.replace(/^#/, '');

  const { stdout: body } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const items = parseFunctionalDodKeys(body);
  const target = items.find((it) => it.key === key);
  if (!target) {
    console.error(
      `[task-tracker] dod-stamp: no \`dod:functional:${key}\` line found in #${issueNum} body.`
    );
    process.exit(1);
  }
  if (!target.evidenceCommands.length) {
    console.error(
      `[task-tracker] dod-stamp: \`dod:functional:${key}\` line carries no verifier command. Add one (e.g. \`<!-- aitm-verified cmd="\\\`npm test\\\`" -->\`) before stamping.`
    );
    process.exit(1);
  }

  console.log(
    `[task-tracker] dod-stamp ${key} on ${s.active}: running ${target.evidenceCommands.length} verifier(s)…`
  );
  // Verifier commands are typically test/lint runs; `runVerifiers` allows up to
  // TEST_RUNNER_TIMEOUT_MS and a 64 MiB stdout buffer by default (the 1 MiB
  // default overflows on `npm test`).
  // (#304 follow-up to #303: GH_API_TIMEOUT_MS — 15s — killed `npm test` mid-run.)
  const {
    ran,
    firstFailure,
    sha: runSha,
  } = await runVerifiers({
    commands: target.evidenceCommands,
    pexec,
    cwd: projectDir,
    // #446 — content-addressed suite-run cache (see ac-stamp for rationale).
    cache: { dir: path.join(projectDir, '.ai-task-manager') },
  });
  for (const r of ran) {
    const tag = r.exit === 0 ? '✓' : '✗';
    const cachedNote = r.cached ? ' ↺ cached' : '';
    console.log(`  ${tag} ${r.cmd} (exit=${r.exit})${cachedNote}`);
  }
  if (firstFailure) {
    console.error(
      `[task-tracker] dod-stamp ${key}: verifier \`${firstFailure.cmd}\` failed (exit=${firstFailure.exit}). No marker stamped.`
    );
    process.exit(1);
  }

  // #446 — on a cache hit attribute the ORIGINAL real run (recorded sha/ts),
  // never a fresh clock.
  const sha = runSha && runSha !== 'unknown' ? runSha : await headSha(pexec);
  const ts = ran[0]?.ts || nowIso(ctx.deps);
  // Stamp under one combined marker. Use the first command as the canonical
  // `cmd` field; future readers can re-parse `aitm-verified-by` if they need
  // the full list. Idempotent — replaces an existing marker in place.
  const canonicalCmd = ran[0]?.cmd || '';

  await mutateIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    deps: { pexec },
    mutate: (base) =>
      stampEvidenceMarker(base, key, {
        cmd: canonicalCmd,
        sha,
        ts,
        exit: 0,
      }),
  });

  console.log(
    `[task-tracker] ✓ dod-stamp ${key} on ${s.active}: aitm-dod-evidence:${key} marker stamped (sha=${sha}).`
  );
}
