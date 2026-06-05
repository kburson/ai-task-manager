// #303 — `/task dod-stamp <key>` runs the verifier command(s) declared by a
// stampable Functional DoD item's `aitm-verified-by` markers and stamps the
// resulting evidence marker
// (`<!-- aitm-dod-evidence:KEY cmd="…" exit=0 sha=<head> ts=<ISO> -->`)
// onto the keyed line. Refuses on non-zero exit. After stamping, `/task check
// "<label>"` will pass the evidence-marker gate.
//
// Stampable keys (`tests`, `lint`, `commits`) only. Derived keys (`acs`,
// `checkboxes`) are computed by `verbs/close.mjs` at close time.

import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import {
  KEY_CLASSIFICATION,
  STAMPABLE_KEYS,
  parseFunctionalDodKeys,
  stampEvidenceMarker,
} from '../lib/functional-dod-evidence.mjs';

function nowIso(deps) {
  // Tests can inject `deps.now` for determinism. Production: new Date().
  if (deps && typeof deps.now === 'function') return deps.now();
  return new Date().toISOString();
}

async function headSha(pexec) {
  const { stdout } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {});
  return String(stdout || '').trim() || 'unknown';
}

// Split an `aitm-verified-by` command (a backtick-delimited shell string) into
// argv. Conservative: split on whitespace. Commands declared in the template
// use simple positional arguments (`npm test`, `npm run lint`,
// `git log --grep #303`); anything more complex should be wrapped in `bash -c`
// in the marker itself.
function splitCmd(cmd) {
  return String(cmd || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

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
      `[task-tracker] dod-stamp: \`dod:functional:${key}\` line carries no \`aitm-verified-by\` command. Add one (e.g. \`<!-- aitm-verified-by: \\\`npm test\\\` -->\`) before stamping.`
    );
    process.exit(1);
  }

  console.log(
    `[task-tracker] dod-stamp ${key} on ${s.active}: running ${target.evidenceCommands.length} verifier(s)…`
  );
  const runOptions = { cwd: projectDir, timeout: GH_API_TIMEOUT_MS };
  const ran = [];
  for (const raw of target.evidenceCommands) {
    const argv = splitCmd(raw);
    if (!argv.length) continue;
    const [bin, ...args] = argv;
    let exit = 0;
    try {
      await pexec(bin, args, runOptions);
    } catch (err) {
      // pexec convention: throw on non-zero. Best-effort capture exit code.
      exit = Number(err?.code ?? err?.status ?? 1) || 1;
    }
    ran.push({ cmd: raw, exit });
    const tag = exit === 0 ? '✓' : '✗';
    console.log(`  ${tag} ${raw} (exit=${exit})`);
    if (exit !== 0) {
      console.error(
        `[task-tracker] dod-stamp ${key}: verifier \`${raw}\` failed (exit=${exit}). No marker stamped.`
      );
      process.exit(1);
    }
  }

  const sha = await headSha(pexec);
  const ts = nowIso(ctx.deps);
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
