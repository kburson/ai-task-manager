import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { readBoundState } from '../lib/bound-state.mjs';
import { formatStageBoundRefusal, hasStageBoundGrandfather } from '../lib/stage-bound-reason.mjs';
import { parseFunctionalDodKeys, KEY_CLASSIFICATION } from '../lib/functional-dod-evidence.mjs';
import { findEvidenceAc } from '../lib/ac-evidence.mjs';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Toggle a single checklist line whose text exactly matches `label`.
// Matching is line-anchored so a label that is a prefix of a longer checklist
// row never matches the longer row.
//
// Returns one of:
//   { status: 'not-found' }
//   { status: 'toggled', body: <new>, alreadyChecked: <bool> }
export function toggleChecklistLine(body, label) {
  const esc = escapeRegex(label);
  const checked = new RegExp(`^- \\[x\\] ${esc}\\s*$`, 'm');
  const unchecked = new RegExp(`^- \\[ \\] ${esc}\\s*$`, 'm');
  const alreadyChecked = checked.test(body);
  if (!alreadyChecked && !unchecked.test(body)) {
    return { status: 'not-found' };
  }
  const next = alreadyChecked
    ? body.replace(checked, `- [ ] ${label}`)
    : body.replace(unchecked, `- [x] ${label}`);
  return { status: 'toggled', body: next, alreadyChecked };
}

// Toggle many checklist lines against a single body, folding `toggleChecklistLine`
// over the accumulating body so each label sees prior toggles. A `not-found`
// label is recorded and skipped — it never aborts the batch.
//
// Returns { body, results } where results is
//   [{ label, status: 'toggled'|'not-found', alreadyChecked: <bool> }]
export function toggleChecklistLines(body, labels) {
  let current = body;
  const results = [];
  for (const label of labels) {
    const r = toggleChecklistLine(current, label);
    if (r.status === 'not-found') {
      results.push({ label, status: 'not-found', alreadyChecked: false });
      continue;
    }
    current = r.body;
    results.push({ label, status: 'toggled', alreadyChecked: r.alreadyChecked });
  }
  return { body: current, results };
}

// Parse `verbCheck` args. Batch mode is triggered by any `--label <v>` (repeatable)
// or `--labels-file <path>`. Remaining positional tokens form the legacy single
// label (joined with spaces). Returns { labels, labelsFile, positional }.
function parseCheckArgs(rest) {
  const labels = [];
  const positional = [];
  let labelsFile = null;
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--label') {
      const v = rest[++i];
      if (v != null) labels.push(v);
    } else if (tok === '--labels-file') {
      labelsFile = rest[++i] ?? null;
    } else {
      positional.push(tok);
    }
  }
  return { labels, labelsFile, positional };
}

export async function verbCheck(ctx) {
  const { cfg, statePath, projectDir, rest, pexec } = ctx;
  // #295 — body writes go through mutateIssueBody({mutate}); closure runs on
  // FRESH base each push attempt.
  const mutateBody = ({ issueNumber, repo, mutate }) =>
    mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.error('no active task');
    process.exit(1);
  }

  const parsed = parseCheckArgs(rest);
  const issueNum = s.active.replace(/^#/, '');

  // Batch mode: any --label / --labels-file present.
  if (parsed.labels.length || parsed.labelsFile) {
    const labels = [...parsed.labels];
    if (parsed.labelsFile) {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(parsed.labelsFile, 'utf8');
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (t) labels.push(t);
      }
    }
    if (!labels.length) {
      console.error('Usage: /task check --label "<label>" [--label ...] | --labels-file <path>');
      process.exit(1);
    }
    return verbCheckBatch({ ctx, issueNum, active: s.active, labels });
  }

  const label = parsed.positional.join(' ').trim();
  if (!label) {
    console.error('Usage: /task check "<label>"');
    process.exit(1);
  }
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const body = stdout;

  if (/^deep[- ]?dive complete$/i.test(label)) {
    // #281 — stage-bound: deep-dive-complete is a Plan-stage artifact. Refuse in
    // Refine unless the live body carries the `aitm-stage-bound-grandfather`
    // marker (legacy bypass; AC6).
    const refusal = stageBoundDeepDiveRefusal({ projectDir, body, issueNumber: issueNum });
    if (refusal) {
      console.error(refusal);
      process.exit(1);
    }
    // #325 — route through consolidated ensureDeepDive resource.
    const { ensureDeepDive } = await import('../lib/deep-dive.mjs');
    const ts = new Date().toISOString();
    const res = await ensureDeepDive({
      issueNumber: issueNum,
      repo: cfg.repo,
      complete: true,
      ts,
    });
    if (res.status === 'no-op') {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${s.active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${s.active} at ${ts}`);
    }
    return;
  }

  // Diagnostic check (pre-fetched body — best-effort for the not-found
  // error message). The authoritative write below re-runs the toggle on
  // FRESH base.
  const diag = toggleChecklistLine(body, label);
  if (diag.status === 'not-found') {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => `  "${m[1]}"`);
    const list = found.length
      ? `\nCheckboxes found:\n${found.join('\n')}`
      : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  // #303/#345 — evidence gate. Refuse stampable Functional DoD ticks without an
  // `aitm-dod-evidence:KEY` marker; refuse derived keys outright; refuse AC ticks
  // carrying `aitm-verified-by` without an `aitm-ac-evidence:<key>` stamp.
  const gate = gateEvidenceTick(body, label);
  const refusal = formatGateRefusal(gate, s.active);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  let landed = null;
  await mutateBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    mutate: (base) => {
      const r = toggleChecklistLine(base, label);
      if (r.status === 'not-found') return base;
      landed = r;
      return r.body;
    },
  });
  const action = (landed?.alreadyChecked ?? diag.alreadyChecked) ? 'Unchecked' : 'Checked';
  console.log(`[task-tracker] ✓ ${action} "${label}" on ${s.active}`);
}

// Batch path: one `gh issue view` fetch, toggle every checklist label in memory,
// one body write. Any `deep dive complete` label is routed to the
// HTML-marker helper (its own round-trip) and excluded from the checkbox fold.
async function verbCheckBatch({ ctx, issueNum, active, labels }) {
  const { cfg, projectDir, pexec } = ctx;
  const mutateBody = ({ issueNumber, repo, mutate }) =>
    mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
  const isDeepDive = (l) => /^deep[- ]?dive complete$/i.test(l.trim());
  const ddLabels = labels.filter(isDeepDive);
  const checklistLabels = labels.filter((l) => !isDeepDive(l));

  let exitCode = 0;

  if (checklistLabels.length) {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    // #303 — Functional DoD evidence gate. Batch is atomic: if ANY label fails
    // the gate, refuse the entire batch. This preserves the user's intent of
    // batch-atomicity for the network round-trip while keeping evidence
    // discipline per-key.
    const gateFailures = [];
    for (const lbl of checklistLabels) {
      const g = gateEvidenceTick(stdout, lbl);
      const msg = formatGateRefusal(g, active);
      if (msg) gateFailures.push(msg);
    }
    if (gateFailures.length) {
      for (const msg of gateFailures) console.error(msg);
      console.error(
        `[task-tracker] batch tick on ${active} refused: ${gateFailures.length} evidence-gated label(s) lack evidence. Run \`/task dod-stamp <key>\` or \`/task ac-stamp "<label>"\` for each, then retry.`
      );
      process.exit(1);
    }
    const { results } = toggleChecklistLines(stdout, checklistLabels);
    const anyToggled = results.some((r) => r.status === 'toggled');
    if (anyToggled) {
      // #295 — re-run the toggle fold on FRESH base; reported per-label
      // results above reflect the diagnostic pass (pre-fetch).
      await mutateBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        mutate: (base) => toggleChecklistLines(base, checklistLabels).body,
      });
    }
    for (const r of results) {
      if (r.status === 'not-found') {
        console.error(`[task-tracker] ✗ checkbox "${r.label}" not found in ${active}`);
        exitCode = 1;
      } else {
        const action = r.alreadyChecked ? 'Unchecked' : 'Checked';
        console.log(`[task-tracker] ✓ ${action} "${r.label}" on ${active}`);
      }
    }
  }

  if (ddLabels.length) {
    // #281 — stage-bound: fetch body once for the grandfather check. If the
    // checklist path already fetched it, this is a second round-trip — accept
    // that for clarity; the verb is interactive and not on a hot path.
    const { stdout: ddBody } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const refusal = stageBoundDeepDiveRefusal({ projectDir, body: ddBody, issueNumber: issueNum });
    if (refusal) {
      console.error(refusal);
      process.exit(1);
    }
  }

  for (let i = 0; i < ddLabels.length; i++) {
    // #325 — route through consolidated ensureDeepDive resource.
    const { ensureDeepDive } = await import('../lib/deep-dive.mjs');
    const ts = new Date().toISOString();
    const res = await ensureDeepDive({
      issueNumber: issueNum,
      repo: cfg.repo,
      complete: true,
      ts,
    });
    if (res.status === 'no-op') {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${active} at ${ts}`);
    }
  }

  if (exitCode) process.exit(exitCode);
}

// #303 — Functional DoD evidence-marker gate. Refuses to tick a checkbox in
// the `#### Functional (verified at Test)` subsection unless the corresponding
// `dod:functional:KEY` line already carries an `aitm-dod-evidence:KEY` marker
// (for stampable keys) — derived keys (`acs`, `checkboxes`) are refused
// outright; `verbs/close.mjs` derives + stamps them at close time.
//
// Returns one of:
//   { kind: 'pass' }                    — label is not a Functional DoD key, or
//                                          item already ticked (unticking allowed)
//   { kind: 'refuse-missing-evidence', key, label, label2 } — stampable key, no marker
//   { kind: 'refuse-derived', key, label } — `acs` or `checkboxes` — manual tick disallowed
//
// `label2` is the trimmed label as it appears in the body (markers stripped),
// used to make the refusal message recognisable.
export function gateFunctionalDodTick(body, requestedLabel) {
  const items = parseFunctionalDodKeys(body);
  if (!items.length) return { kind: 'pass' };
  const wanted = String(requestedLabel || '').trim();
  const match = items.find((it) => it.label === wanted);
  if (!match) return { kind: 'pass' };
  if (match.checked) return { kind: 'pass' }; // unticking is fine
  const klass = KEY_CLASSIFICATION[match.key] || null;
  if (klass === 'derived') {
    return { kind: 'refuse-derived', key: match.key, label: match.label };
  }
  if (klass === 'stampable' && !match.evidenceMarker) {
    return {
      kind: 'refuse-missing-evidence',
      key: match.key,
      label: match.label,
      label2: match.label,
    };
  }
  return { kind: 'pass' };
}

// #345 — generalized evidence gate. Runs the #303 Functional DoD gate first
// (its `aitm-dod-evidence` path is unchanged); if that passes, applies the AC
// evidence gate: a checkbox in the `## Acceptance Criteria` section carrying an
// `aitm-verified-by` marker cannot be ticked unless a matching
// `aitm-ac-evidence:<key>` stamp (from `/task ac-stamp`) already exists.
//
// Returns the Functional DoD gate's verdict when it is non-pass, else one of:
//   { kind: 'pass' }
//   { kind: 'refuse-ac-evidence', key, label, commands } — AC needs a stamp
export function gateEvidenceTick(body, requestedLabel) {
  const dod = gateFunctionalDodTick(body, requestedLabel);
  if (dod.kind !== 'pass') return dod;
  const ac = findEvidenceAc(body, requestedLabel);
  if (!ac) return { kind: 'pass' };
  if (ac.checked) return { kind: 'pass' }; // unticking is fine
  if (!ac.evidenceMarker) {
    return {
      kind: 'refuse-ac-evidence',
      key: ac.key,
      label: ac.label,
      commands: ac.evidenceCommands,
    };
  }
  return { kind: 'pass' };
}

function formatGateRefusal(gate, issueRef) {
  if (gate.kind === 'refuse-ac-evidence') {
    const cmd = gate.commands?.[0] || '<verifier>';
    return [
      `EVIDENCE_REQUIRED: [task-tracker] ✗ Refusing to tick AC "${gate.label}" on ${issueRef}.`,
      `  This acceptance criterion declares a verifier (aitm-verified cmd="…") but carries`,
      `  no aitm-ac-evidence:${gate.key} marker. Run \`/task ac-stamp "${gate.label}"\` to`,
      `  execute \`${cmd}\` in a sandbox; the evidence marker it stamps unlocks this tick.`,
    ].join('\n');
  }
  if (gate.kind === 'refuse-derived') {
    return [
      `[task-tracker] ✗ Refusing to tick Functional DoD "${gate.label}" on ${issueRef}.`,
      `  Key dod:functional:${gate.key} is DERIVED — its truth is computed from the body at`,
      `  close time. Do not tick manually; \`/task close\` will derive and stamp it.`,
    ].join('\n');
  }
  if (gate.kind === 'refuse-missing-evidence') {
    return [
      `[task-tracker] ✗ Refusing to tick Functional DoD "${gate.label}" on ${issueRef}.`,
      `  Key dod:functional:${gate.key} has no aitm-dod-evidence marker. Run`,
      `  \`/task dod-stamp ${gate.key}\` to execute the verifier in a sandbox; the`,
      `  evidence marker it stamps unlocks this tick.`,
    ].join('\n');
  }
  return null;
}

// #281 — stage-bound gate for `check "Deep dive complete"`. Reads bound state
// from the per-session active-task.json mirror (same source as the activity
// hooks). Returns a refusal message string when blocked, null otherwise.
// Grandfather: an `aitm-stage-bound-grandfather` marker on the live body
// bypasses the gate (scoped to AC1/AC2 per spec).
function stageBoundDeepDiveRefusal({ projectDir, body, issueNumber }) {
  let bound;
  try {
    bound = readBoundState(projectDir);
  } catch {
    return null; // fail-open on state-read errors — hooks still gate body push
  }
  if (bound?.state !== 'refine') return null;
  if (hasStageBoundGrandfather(body)) return null;
  return formatStageBoundRefusal({
    state: 'refine',
    action: 'marking deep-dive complete via `/task check "Deep dive complete"`',
    nextVerb: '/task promote',
    nextState: 'plan',
    issueNumber,
  });
}
