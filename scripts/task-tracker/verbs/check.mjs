import path from 'node:path';
import { loadState } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { pushIssueBody } from '../lib/issue-body-push.mjs';
import { readBoundState } from '../lib/bound-state.mjs';
import { formatStageBoundRefusal, hasStageBoundGrandfather } from '../lib/stage-bound-reason.mjs';

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
    const { markDeepDiveComplete } = await import('../lib/markers.mjs');
    const res = await markDeepDiveComplete({ issueNumber: issueNum, cfg });
    if (!res.changed) {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${s.active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${s.active} at ${res.ts}`);
    }
    return;
  }

  const result = toggleChecklistLine(body, label);
  if (result.status === 'not-found') {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => `  "${m[1]}"`);
    const list = found.length
      ? `\nCheckboxes found:\n${found.join('\n')}`
      : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  const { body: updated, alreadyChecked } = result;
  const tmp = path.join(projectTmpDir(projectDir), `tt-check-${Date.now()}.md`);
  await pushIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    body: updated,
    scratchPath: tmp,
    deps: { pexec },
  });
  const action = alreadyChecked ? 'Unchecked' : 'Checked';
  console.log(`[task-tracker] ✓ ${action} "${label}" on ${s.active}`);
}

// Batch path: one `gh issue view` fetch, toggle every checklist label in memory,
// one `pushIssueBody` push. Any `deep dive complete` label is routed to the
// HTML-marker helper (its own round-trip) and excluded from the checkbox fold.
async function verbCheckBatch({ ctx, issueNum, active, labels }) {
  const { cfg, projectDir, pexec } = ctx;
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
    const { body: updated, results } = toggleChecklistLines(stdout, checklistLabels);
    const anyToggled = results.some((r) => r.status === 'toggled');
    if (anyToggled) {
      const tmp = path.join(projectTmpDir(projectDir), `tt-check-${Date.now()}.md`);
      await pushIssueBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        body: updated,
        scratchPath: tmp,
        deps: { pexec },
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
    const { markDeepDiveComplete } = await import('../lib/markers.mjs');
    const res = await markDeepDiveComplete({ issueNumber: issueNum, cfg });
    if (!res.changed) {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${active} at ${res.ts}`);
    }
  }

  if (exitCode) process.exit(exitCode);
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
