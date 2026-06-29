import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { readBoundState } from '../lib/bound-state.mjs';
import { formatStageBoundRefusal, hasStageBoundGrandfather } from '../lib/stage-bound-reason.mjs';
import { parseFunctionalDodKeys, KEY_CLASSIFICATION } from '../lib/functional-dod-evidence.mjs';
import { findEvidenceAc, stripMarkers } from '../lib/ac-evidence.mjs';
import { escapeValue } from '../lib/marker-grammar.mjs';

// Toggle a single checklist line whose VISIBLE label matches `label`.
//
// #411 — matching is on the marker-stripped visible text, not the whole raw
// line. Once `ac-stamp` / `dod-stamp` append hidden evidence markers
// (`aitm-ac-evidence`, `aitm-verified-by`, `aitm-dod-evidence`, …) to a
// checkbox line, the natural call carrying only the visible label used to fail
// "not-found", forcing the caller to reproduce the full marker-bearing line.
// We now strip markers from BOTH the requested label and each checkbox line's
// post-glyph content before comparing, and toggle by rewriting ONLY the `[ ]`
// ↔ `[x]` glyph so the trailing markers survive intact. A full-line argument
// (label + markers) still matches because it strips to the same key.
//
// Returns one of:
//   { status: 'not-found' }
//   { status: 'ambiguous', count: <n> }   — >1 line shares the stripped label
//   { status: 'toggled', body: <new>, alreadyChecked: <bool> }
export function toggleChecklistLine(body, label) {
  const wanted = stripMarkers(label);
  const lines = String(body).split('\n');
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] (.+)$/);
    if (!m) continue;
    if (stripMarkers(m[2]) === wanted) {
      matches.push({ index: i, checked: m[1] === 'x' });
    }
  }
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
  const { index, checked: alreadyChecked } = matches[0];
  // Rewrite only the glyph; preserve the rest of the line (label + markers).
  lines[index] = lines[index].replace(/^- \[[ x]\]/, alreadyChecked ? '- [ ]' : '- [x]');
  return { status: 'toggled', body: lines.join('\n'), alreadyChecked };
}

// Toggle many checklist lines against a single body, folding `toggleChecklistLine`
// over the accumulating body so each label sees prior toggles. A `not-found`
// label is recorded and skipped — it never aborts the batch.
//
// Returns { body, results } where results is
//   [{ label, status: 'toggled'|'not-found'|'ambiguous', alreadyChecked: <bool> }]
export function toggleChecklistLines(body, labels) {
  let current = body;
  const results = [];
  for (const label of labels) {
    const r = toggleChecklistLine(current, label);
    if (r.status === 'not-found') {
      results.push({ label, status: 'not-found', alreadyChecked: false });
      continue;
    }
    if (r.status === 'ambiguous') {
      results.push({ label, status: 'ambiguous', alreadyChecked: false, count: r.count });
      continue;
    }
    current = r.body;
    results.push({ label, status: 'toggled', alreadyChecked: r.alreadyChecked });
  }
  return { body: current, results };
}

// #660 — outcome-oriented checkbox writer. Unlike `toggleChecklistLine` (which
// flips relative to the line's CURRENT glyph), `setChecklistLine` converges the
// matched line to an ABSOLUTE desired end-state and reports whether that
// required a change. This is the idempotency primitive behind the
// `ensureChecked` / `ensureUnchecked` verbs: a second invocation on a line
// already in the desired state is a byte-identical no-op (`changed: false`),
// and the verb name — not the line's current state — fully determines the
// result. Matching reuses the marker-stripped visible-text comparison so a bare
// label still matches a marker-bearing line, and only the `[ ]`↔`[x]` glyph is
// rewritten so trailing evidence markers survive intact.
//
// `desired` is 'checked' | 'unchecked'.
//
// Returns one of:
//   { status: 'not-found' }
//   { status: 'ambiguous', count: <n> }
//   { status: 'set', body: <maybe-unchanged>, changed: <bool>, alreadyChecked: <bool> }
export function setChecklistLine(body, label, desired) {
  const targetChecked = desired === 'checked';
  const wanted = stripMarkers(label);
  const src = String(body);
  const lines = src.split('\n');
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] (.+)$/);
    if (!m) continue;
    if (stripMarkers(m[2]) === wanted) {
      matches.push({ index: i, checked: m[1] === 'x' });
    }
  }
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
  const { index, checked: alreadyChecked } = matches[0];
  const changed = alreadyChecked !== targetChecked;
  if (!changed) {
    // Byte-identical no-op: return the original string untouched.
    return { status: 'set', body: src, changed: false, alreadyChecked };
  }
  lines[index] = lines[index].replace(/^- \[[ x]\]/, targetChecked ? '- [x]' : '- [ ]');
  return { status: 'set', body: lines.join('\n'), changed: true, alreadyChecked };
}

// Fold `setChecklistLine` over many labels against one accumulating body. A
// `not-found`/`ambiguous` label is recorded and skipped — it never aborts the
// batch. Returns { body, results } where results is
//   [{ label, status: 'set'|'not-found'|'ambiguous', changed, alreadyChecked, count? }]
export function setChecklistLines(body, labels, desired) {
  let current = body;
  const results = [];
  for (const label of labels) {
    const r = setChecklistLine(current, label, desired);
    if (r.status === 'not-found') {
      results.push({ label, status: 'not-found', changed: false, alreadyChecked: false });
      continue;
    }
    if (r.status === 'ambiguous') {
      results.push({
        label,
        status: 'ambiguous',
        changed: false,
        alreadyChecked: false,
        count: r.count,
      });
      continue;
    }
    current = r.body;
    results.push({ label, status: 'set', changed: r.changed, alreadyChecked: r.alreadyChecked });
  }
  return { body: current, results };
}

// Parse `verbCheck` args. Batch mode is triggered by any `--label <v>` (repeatable)
// or `--labels-file <path>`. Remaining positional tokens form the legacy single
// label (joined with spaces). `--allow-unverified-ticks` (#567) is a boolean flag
// threading `allowUnverifiedTicks: true` into the body write so a genuinely
// non-demonstrable AC (no machine verifier by design) can be honestly ticked
// through the first-class CLI instead of a hand-rolled one-off `mutateIssueBody`
// script. Returns { labels, labelsFile, positional, allowUnverifiedTicks }.
export function parseCheckArgs(rest) {
  const labels = [];
  const positional = [];
  let labelsFile = null;
  let allowUnverifiedTicks = false;
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--label') {
      const v = rest[++i];
      if (v != null) labels.push(v);
    } else if (tok === '--labels-file') {
      labelsFile = rest[++i] ?? null;
    } else if (tok === '--allow-unverified-ticks') {
      allowUnverifiedTicks = true;
    } else {
      positional.push(tok);
    }
  }
  return { labels, labelsFile, positional, allowUnverifiedTicks };
}

// #567 — eligibility classifier for an `--allow-unverified-ticks` tick. The
// hatch exists ONLY for proofless / honestly non-demonstrable ACs; it must never
// be a way to skip a real verifier. Pure (no I/O) so both verb paths and the
// tests share one definition.
//
// Returns one of:
//   { kind: 'eligible' }
//   { kind: 'refuse-dod', dodGate }            — Functional DoD item: use dod-stamp
//   { kind: 'refuse-verifier-ac', label, commands } — AC declares a verifier: use ac-stamp
export function classifyUnverifiedTick(body, label) {
  const dodGate = gateFunctionalDodTick(body, label);
  if (dodGate.kind !== 'pass') return { kind: 'refuse-dod', dodGate };
  const ac = findEvidenceAc(body, label);
  if (ac) return { kind: 'refuse-verifier-ac', label: ac.label, commands: ac.evidenceCommands };
  return { kind: 'eligible' };
}

// #567 — refusal message when `--allow-unverified-ticks` is aimed at an AC that
// carries a real verifier declaration. That AC must run its verifier via
// `/task ac-stamp`, not be waved through the unverified hatch.
export function formatUnverifiedHatchRefusal({ label, issueRef, commands }) {
  const cmd = commands?.[0] || '<verifier>';
  return [
    `UNVERIFIED_HATCH_REFUSED: [task-tracker] ✗ Refusing --allow-unverified-ticks on AC "${label}" in ${issueRef}.`,
    `  This acceptance criterion declares a verifier (aitm-verified cmd="…"), so it is`,
    `  demonstrable — the unverified hatch is only for ACs tagged \`invalid — non-demonstrable\``,
    `  or otherwise carrying no machine verifier. Run \`/task ac-stamp "${label}"\` to execute`,
    `  \`${cmd}\` and stamp real evidence instead.`,
  ].join('\n');
}

// #567 — record an audit-trail marker for an unverified tick so honesty is
// preserved by construction. The marker names the AC label and the timestamp;
// it is NOT an execution-proof marker (different name → not detected by the
// `aitm-verified*` proof family), so it never poses as evidence. Idempotent for
// an identical label+ts. Returns the (possibly-unchanged) body.
export function appendUnverifiedTickAudit(body, { label, ts }) {
  const visible = stripMarkers(label);
  const marker = `<!-- aitm-unverified-tick label="${escapeValue(visible)}" ts="${escapeValue(String(ts))}" -->`;
  const src = String(body);
  if (src.includes(marker)) return src;
  return `${src.replace(/\s+$/, '')}\n\n${marker}\n`;
}

// #660 — shared implementation behind `ensureChecked` (desired='checked') and
// `ensureUnchecked` (desired='unchecked'). The verb name fully determines the
// end-state; the matched line's current glyph never inverts the operation.
// Idempotent: when the line is already in the desired state the call is a no-op
// (exit 0, body untouched, no evidence gate) and prints an "Already …" line.
//
// `ensureChecked` semantics that `ensureUnchecked` does NOT share:
//   - the special-label routes (`deep dive complete` → ensureDeepDive,
//     `discussion complete` → markDiscussed),
//   - the evidence-tick gate on a real `- [ ]`→`- [x]` transition (and the
//     `--allow-unverified-ticks` honest hatch).
// Un-ticking is never a claim of proof, so `ensureUnchecked` runs no gate.
async function runEnsure(ctx, desired) {
  const { cfg, statePath, projectDir, rest, pexec } = ctx;
  const checking = desired === 'checked';
  // #295 — body writes go through mutateIssueBody({mutate}); closure runs on
  // FRESH base each push attempt. #567 — threads the optional
  // `allowUnverifiedTicks` bypass for the non-demonstrable-AC hatch.
  const mutateBody = ({ issueNumber, repo, mutate, allowUnverifiedTicks = false }) =>
    mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec }, allowUnverifiedTicks });
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.error('no active task');
    process.exit(1);
  }

  const verbName = checking ? 'ensureChecked' : 'ensureUnchecked';
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
      console.error(
        `Usage: /task ${verbName} --label "<label>" [--label ...] | --labels-file <path>`
      );
      process.exit(1);
    }
    return runEnsureBatch({
      ctx,
      desired,
      issueNum,
      active: s.active,
      labels,
      allowUnverifiedTicks: parsed.allowUnverifiedTicks,
    });
  }

  const label = parsed.positional.join(' ').trim();
  if (!label) {
    console.error(`Usage: /task ${verbName} "<label>"`);
    process.exit(1);
  }
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const body = stdout;

  // Special-label routes are checked-only outcomes (they stamp markers, not
  // checkboxes); ensureUnchecked treats these labels as ordinary checkbox text.
  if (checking && /^deep[- ]?dive complete$/i.test(label)) {
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

  if (checking && /^discussion complete$/i.test(label)) {
    // #473 — resolve a `{discuss}` directive (#405). Strip the token AND the
    // durable `aitm-discuss-requested` marker (#486) and stamp the non-invariant
    // `aitm-discussed` marker so `discussBlockGuard` passes and forward promotion
    // resumes. Idempotent via markDiscussed.
    const { markDiscussed, formatDiscussEndBanner } = await import('../lib/discuss-marker.mjs');
    const { mutateIssueBody } = await import('../lib/issue-body-mutate.mjs');
    const ts = new Date().toISOString();
    const res = await mutateIssueBody({
      issueNumber: issueNum,
      repo: cfg.repo,
      mutate: (base) => markDiscussed(base, { ts }),
    });
    // #486 — the completed discussion is no longer pending, so remove the
    // visible "Discuss" label to keep it a pure mirror of the marker state.
    // Best-effort: a label failure must not abort the resolution write above.
    try {
      const { syncDiscussLabel, getDiscussLabel } = await import('../lib/discuss-label.mjs');
      await syncDiscussLabel({
        issueNumber: issueNum,
        repo: cfg.repo,
        label: getDiscussLabel(cfg),
        present: false,
      });
    } catch {
      /* label sync is advisory; the marker state is authoritative */
    }
    if (res.status === 'no-op') {
      console.log(`[task-tracker] ✓ Discussion already resolved on ${s.active}`);
    } else {
      console.log(
        `[task-tracker] ✓ Marked discussion complete on ${s.active} at ${ts} (token stripped, aitm-discussed stamped, Discuss label removed)`
      );
      // #495 — colorful ✅ conclusion delimiter via the shared formatter, the
      // same banner finalizeDiscussion emits, so both conclusion paths match.
      console.log(formatDiscussEndBanner(s.active));
    }
    return;
  }

  // Diagnostic pass (pre-fetched body — best-effort for the not-found error
  // message and the idempotency check). The authoritative write below re-runs
  // `setChecklistLine` on FRESH base.
  const diag = setChecklistLine(body, label, desired);
  if (diag.status === 'not-found') {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => `  "${m[1]}"`);
    const list = found.length
      ? `\nCheckboxes found:\n${found.join('\n')}`
      : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  if (diag.status === 'ambiguous') {
    // #411 — refuse rather than silently tick the wrong line.
    console.error(
      `[task-tracker] checkbox "${label}" is ambiguous in ${s.active}: ${diag.count} lines share this visible label. Disambiguate with a longer label or the full line text.`
    );
    process.exit(1);
  }
  // #660 — idempotent no-op: the line is already in the desired state. No write,
  // no evidence gate (no `- [ ]`→`- [x]` transition is occurring). Exit 0.
  if (!diag.changed) {
    const word = checking ? 'checked' : 'unchecked';
    console.log(`[task-tracker] ✓ "${label}" already ${word} on ${s.active} (no-op)`);
    return;
  }
  // From here a real state change WILL occur. For ensureUnchecked that is a
  // `- [x]`→`- [ ]` transition — un-ticking is never a proof claim, so no gate.
  const auv = checking && parsed.allowUnverifiedTicks;
  const ts = new Date().toISOString();
  if (checking) {
    // #567 — `--allow-unverified-ticks` honest hatch for non-demonstrable ACs.
    // Eligibility is the inverse of the evidence gate: a Functional DoD item or
    // a verifier-bearing AC is REFUSED (those have their own stamp paths); only
    // a proofless / `invalid — non-demonstrable` AC is waved through, with an
    // audit marker recorded in the same write.
    if (auv) {
      const cls = classifyUnverifiedTick(body, label);
      if (cls.kind === 'refuse-dod') {
        console.error(formatGateRefusal(cls.dodGate, s.active));
        process.exit(1);
      }
      if (cls.kind === 'refuse-verifier-ac') {
        console.error(
          formatUnverifiedHatchRefusal({
            label: cls.label,
            issueRef: s.active,
            commands: cls.commands,
          })
        );
        process.exit(1);
      }
    } else {
      // #303/#345 — evidence gate. Refuse stampable Functional DoD ticks without
      // an `aitm-dod-evidence:KEY` marker; refuse derived keys outright; refuse
      // AC ticks carrying `aitm-verified-by` without an `aitm-ac-evidence:<key>`
      // stamp.
      const gate = gateEvidenceTick(body, label);
      const refusal = formatGateRefusal(gate, s.active);
      if (refusal) {
        console.error(refusal);
        process.exit(1);
      }
    }
  }
  await mutateBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    allowUnverifiedTicks: auv,
    mutate: (base) => {
      const r = setChecklistLine(base, label, desired);
      if (r.status !== 'set' || !r.changed) return base;
      // Audit marker only on a genuine tick-ON under the hatch.
      if (auv) {
        return appendUnverifiedTickAudit(r.body, { label, ts });
      }
      return r.body;
    },
  });
  const action = checking ? 'Checked' : 'Unchecked';
  const suffix = auv ? ' (unverified — audit marker recorded)' : '';
  console.log(`[task-tracker] ✓ ${action} "${label}" on ${s.active}${suffix}`);
}

// #660 — public verb entrypoints. `ensureChecked` converges the matched line to
// `- [x]`; `ensureUnchecked` to `- [ ]`. Both idempotent.
export async function verbEnsureChecked(ctx) {
  return runEnsure(ctx, 'checked');
}

export async function verbEnsureUnchecked(ctx) {
  return runEnsure(ctx, 'unchecked');
}

// #660 — `check` is a DEPRECATED alias for `ensureChecked`. It no longer
// toggles: invoking it on an already-checked line is now a no-op, NOT an
// uncheck (the #659-class regression this issue fixes). Emits a one-line stderr
// deprecation notice, then delegates unchanged.
export async function verbCheck(ctx) {
  process.stderr.write(
    '[task-tracker] ⚠ `check` is deprecated and now aliases `ensureChecked` (it no longer toggles). ' +
      'Use `/task ensureChecked "<label>"` to tick, `/task ensureUnchecked "<label>"` to untick.\n'
  );
  return runEnsure(ctx, 'checked');
}

// Batch path: one `gh issue view` fetch, set every checklist label in memory to
// the desired state, one body write. Any `deep dive complete` label is routed
// to the HTML-marker helper (its own round-trip) and excluded from the checkbox
// fold — checked-only, since it stamps a marker rather than a checkbox.
async function runEnsureBatch({
  ctx,
  desired,
  issueNum,
  active,
  labels,
  allowUnverifiedTicks = false,
}) {
  const { cfg, projectDir, pexec } = ctx;
  const checking = desired === 'checked';
  const auvAllowed = checking && allowUnverifiedTicks;
  const mutateBody = ({ issueNumber, repo, mutate, allowUnverifiedTicks: auv = false }) =>
    mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec }, allowUnverifiedTicks: auv });
  // The deep-dive-complete special label is a checked-only marker route; under
  // ensureUnchecked it is treated as an ordinary (likely not-found) checkbox.
  const isDeepDive = (l) => checking && /^deep[- ]?dive complete$/i.test(l.trim());
  const ddLabels = labels.filter(isDeepDive);
  const checklistLabels = labels.filter((l) => !isDeepDive(l));

  let exitCode = 0;

  if (checklistLabels.length) {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    // #303 / #567 — per-label eligibility gate (checked-only; un-ticking is not
    // a proof claim so ensureUnchecked runs no gate). Batch is atomic: if ANY
    // label fails, refuse the entire batch. The gate only applies to labels
    // that will actually transition `- [ ]`→`- [x]`; an already-checked label
    // is a no-op and is exempt. Without the hatch this is the evidence gate
    // (`gateEvidenceTick`); with `--allow-unverified-ticks` it is the inverse
    // (`classifyUnverifiedTick`).
    const willTransition = (lbl) => {
      const probe = setChecklistLine(stdout, lbl, desired);
      return probe.status === 'set' && probe.changed;
    };
    const gateFailures = [];
    if (checking) {
      for (const lbl of checklistLabels) {
        if (!willTransition(lbl)) continue; // no-op tick → exempt
        if (allowUnverifiedTicks) {
          const cls = classifyUnverifiedTick(stdout, lbl);
          if (cls.kind === 'refuse-dod') gateFailures.push(formatGateRefusal(cls.dodGate, active));
          else if (cls.kind === 'refuse-verifier-ac') {
            gateFailures.push(
              formatUnverifiedHatchRefusal({
                label: cls.label,
                issueRef: active,
                commands: cls.commands,
              })
            );
          }
        } else {
          const g = gateEvidenceTick(stdout, lbl);
          const msg = formatGateRefusal(g, active);
          if (msg) gateFailures.push(msg);
        }
      }
    }
    if (gateFailures.length) {
      for (const msg of gateFailures) console.error(msg);
      console.error(
        allowUnverifiedTicks
          ? `[task-tracker] batch tick on ${active} refused: ${gateFailures.length} label(s) are NOT eligible for --allow-unverified-ticks (Functional DoD items use \`/task dod-stamp\`; verifier-bearing ACs use \`/task ac-stamp\`).`
          : `[task-tracker] batch tick on ${active} refused: ${gateFailures.length} evidence-gated label(s) lack evidence. Run \`/task dod-stamp <key>\` or \`/task ac-stamp "<label>"\` for each, then retry.`
      );
      process.exit(1);
    }
    const { results } = setChecklistLines(stdout, checklistLabels, desired);
    const anyChanged = results.some((r) => r.status === 'set' && r.changed);
    // #567 — labels that actually transition ON under the hatch get an audit marker.
    const tickedOn = new Set(
      auvAllowed ? results.filter((r) => r.status === 'set' && r.changed).map((r) => r.label) : []
    );
    if (anyChanged) {
      const ts = new Date().toISOString();
      // #295 — re-run the fold on FRESH base; reported per-label results above
      // reflect the diagnostic pass (pre-fetch).
      await mutateBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        allowUnverifiedTicks: auvAllowed,
        mutate: (base) => {
          let next = setChecklistLines(base, checklistLabels, desired).body;
          if (auvAllowed) {
            for (const lbl of tickedOn) next = appendUnverifiedTickAudit(next, { label: lbl, ts });
          }
          return next;
        },
      });
    }
    const doneWord = checking ? 'checked' : 'unchecked';
    const actionWord = checking ? 'Checked' : 'Unchecked';
    for (const r of results) {
      if (r.status === 'not-found') {
        console.error(`[task-tracker] ✗ checkbox "${r.label}" not found in ${active}`);
        exitCode = 1;
      } else if (r.status === 'ambiguous') {
        // #411 — ambiguous match: report, never silently tick the wrong line.
        console.error(
          `[task-tracker] ✗ checkbox "${r.label}" is ambiguous in ${active}: ${r.count} lines share this visible label.`
        );
        exitCode = 1;
      } else if (!r.changed) {
        console.log(`[task-tracker] ✓ "${r.label}" already ${doneWord} on ${active} (no-op)`);
      } else {
        const suffix = tickedOn.has(r.label) ? ' (unverified)' : '';
        console.log(`[task-tracker] ✓ ${actionWord} "${r.label}" on ${active}${suffix}`);
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
  // #411 — compare on the marker-stripped label so a bare visible label matches
  // a Functional DoD item whose parsed label retains its `aitm-verified cmd="…"`
  // declaration (and a full-line argument strips to the same key).
  const wanted = stripMarkers(requestedLabel);
  const match = items.find((it) => stripMarkers(it.label) === wanted);
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

// #281 — stage-bound gate for `ensureChecked "Deep dive complete"`. Reads bound state
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
    action: 'marking deep-dive complete via `/task ensureChecked "Deep dive complete"`',
    nextVerb: '/task promote',
    nextState: 'plan',
    issueNumber,
  });
}
