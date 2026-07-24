// `block` verb — record blocker issues for the active task.
//
// CLI: /task block [#N] --by <M>[,<P>...]
//
// Writes the `<!-- aitm-blocked-by: #M, #P -->` body marker via
// `addBlockedBy` (lib/blocked-marker.mjs), adds the `BLOCKED` label via
// `blockedLabelAddArgs`, and posts an audit comment to the timeline. Does NOT
// touch Status — the universal exit-guard (#286) is the enforcement layer.
//
// Pure core: `runBlock({ args, cfg, deps })`. All I/O is injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { addBlockedBy, parseBlockedBy, blockedLabelAddArgs } from '../lib/blocked-marker.mjs';
import { writeBlockedByField } from '../lib/blocked-by-field.mjs';

const pexec = promisify(execFile);

// Parse the `--by` flag value into a sorted unique list of positive ints.
// Accepts `"5"`, `"5,7"`, `"#5"`, `"#5, #7"`. Returns [] on garbage.
export function parseByList(raw) {
  if (raw == null) return [];
  const out = new Set();
  for (const tok of String(raw).split(',')) {
    const n = Number(tok.trim().replace(/^#/, ''));
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

// Resolve the target issue: explicit positional `#N` / `N` wins, else falls
// back to the bound active issue. Returns a positive integer or null.
export function resolveTargetIssue({ rest, activeIssue }) {
  for (const tok of rest) {
    const m = String(tok).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  if (activeIssue) {
    const m = String(activeIssue).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

// Parse `rest` into { target, refs }.
export function parseArgs(rest, activeIssue) {
  let by = null;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--by') {
      by = rest[++i] ?? '';
    } else {
      positional.push(tok);
    }
  }
  const target = resolveTargetIssue({ rest: positional, activeIssue });
  const refs = parseByList(by);
  return { target, refs, byProvided: by !== null };
}

// Default `gh issue view --json number,state` to validate a blocker is open.
async function defaultValidateBlocker({ blockerNumber, repo }) {
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(blockerNumber), '-R', repo, '--json', 'number,state'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const data = JSON.parse(stdout);
    if (!data || typeof data.number !== 'number') {
      return { exists: false, state: null };
    }
    return { exists: true, state: String(data.state || '').toUpperCase() };
  } catch {
    return { exists: false, state: null };
  }
}

// #295 — body writes go through `mutateIssueBody({ mutate })`; the closure
// runs on the FRESH base every push attempt, preserving concurrent markers.
async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

async function defaultRunLabel({ args, repo }) {
  await pexec('gh', [...args, '-R', repo], { timeout: GH_API_TIMEOUT_MS });
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

/**
 * Core block runner. All side effects are injectable for tests.
 *
 * @param {object} opts
 * @param {number} opts.target  bound/positional issue number being blocked
 * @param {number[]} opts.refs  blocker issue numbers (>= 1, validated)
 * @param {object} opts.cfg     `loadConfig()` result, must carry `repo`
 * @param {object} [opts.deps]  injectable side-effect surface
 * @returns {Promise<{status:'added'|'idempotent', target:number, refs:number[], fieldMirrorOk:boolean}>}
 */
export async function runBlock({ target, refs, cfg, deps = {} } = {}) {
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error('block: no target issue (bind via /task #N or pass a positional)');
  }
  if (!Array.isArray(refs) || !refs.length) {
    throw new Error(
      'block: --by is required and must list at least one positive integer issue number'
    );
  }
  if (!cfg || !cfg.repo) {
    throw new Error('block: cfg.repo is required');
  }

  // Normalize refs: positive ints only, sorted + deduped. Mirrors
  // `lib/blocked-marker.mjs#normalizeRefs` so downstream order is stable.
  refs = [...new Set(refs.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

  const validateBlocker = deps.validateBlocker || defaultValidateBlocker;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const runLabel = deps.runLabel || defaultRunLabel;
  const postComment = deps.postComment || defaultPostComment;

  // Validate every blocker exists and is open BEFORE touching the body.
  for (const m of refs) {
    if (m === target) {
      throw new Error(`block: cannot block #${target} on itself`);
    }
    const { exists, state } = await validateBlocker({ blockerNumber: m, repo: cfg.repo });
    if (!exists) {
      throw new Error(`block: blocker #${m} does not exist`);
    }
    if (state !== 'OPEN') {
      throw new Error(
        `block: blocker #${m} is closed (state=${state}) — only open issues can block`
      );
    }
  }

  // #295 — closure runs over FRESH base each push attempt. `existing` is
  // captured from inside so audit comments reflect what was actually on the
  // body the moment we wrote, not a possibly-stale pre-fetched snapshot.
  let existing = new Set();
  let finalBody = null;
  const writeRes = await mutateBody({
    issueNumber: target,
    repo: cfg.repo,
    mutate: (base) => {
      existing = new Set(parseBlockedBy(base));
      const next = addBlockedBy(base, refs);
      finalBody = next;
      return next;
    },
  });

  const isNoOp = writeRes?.status === 'no-op';

  // Mirror the canonical marker into the `Blocked By` Project field on EVERY
  // invocation — including the no-op/idempotent path (#847). Keyed off
  // `finalBody`, which the mutate closure above always sets, even when the
  // body write itself was a no-op. `writeBlockedByField` is already an
  // idempotent one-way mirror (marker → field), so re-writing an
  // already-correct value is a no-op network call, not a behavior change —
  // and it's the only way a field left unset by a prior partial failure can
  // ever be repaired, since re-running used to short-circuit before this
  // call was reached. No-op when `cfg.fieldBlockedBy` is absent (older
  // installs pre-#287 migrate).
  const mirrorDeps = deps.writeFieldValue ? { writeFieldValue: deps.writeFieldValue } : {};
  let fieldMirrorOk = true;
  let fieldMirrorError = null;
  try {
    await writeBlockedByField({
      issueNumber: target,
      refs: parseBlockedBy(finalBody),
      cfg,
      deps: mirrorDeps,
    });
  } catch (err) {
    // Field mirror is best-effort. The marker is authoritative; a transient
    // GraphQL failure must not roll back the body edit or label addition —
    // but it must not be reported as unconditional success either (#847).
    fieldMirrorOk = false;
    fieldMirrorError = err.message;
    console.error(`[task-tracker] warn: writeBlockedByField failed for #${target}: ${err.message}`);
  }

  if (isNoOp) {
    const list = refs.map((n) => `#${n}`).join(', ');
    if (fieldMirrorOk) {
      console.log(`[task-tracker] ✓ #${target} already blocked by ${list}`);
    } else {
      console.error(
        `[task-tracker] ✗ #${target} already blocked by ${list} — Blocked By field mirror failed: ${fieldMirrorError}`
      );
    }
    return { status: 'idempotent', target, refs, fieldMirrorOk };
  }

  await runLabel({ args: blockedLabelAddArgs(target), repo: cfg.repo });

  // Audit comment — one per newly-added ref (those not already in `existing`).
  const added = refs.filter((m) => !existing.has(m));
  for (const m of added) {
    await postComment({
      issueNumber: target,
      repo: cfg.repo,
      body: `### 🔒 Blocked by #${m} added`,
    });
  }

  const addedList = added.map((n) => `#${n}`).join(', ');
  if (fieldMirrorOk) {
    console.log(`[task-tracker] ✓ #${target} blocked by ${addedList}`);
  } else {
    console.error(
      `[task-tracker] ✗ #${target} marker + label written, blocked by ${addedList} — Blocked By field mirror failed: ${fieldMirrorError}`
    );
  }
  return { status: 'added', target, refs: added, fieldMirrorOk };
}

export async function verbBlock(ctx) {
  const { cfg, statePath, rest } = ctx;
  const s = loadState(statePath);
  const active = s.active || null;
  const { target, refs } = parseArgs(rest, active);
  if (!target) {
    console.error('Usage: /task block [#N] --by <M>[,<P>...]');
    process.exit(2);
  }
  if (!refs.length) {
    console.error('block: --by is required (e.g. --by 247 or --by 247,249)');
    process.exit(2);
  }
  try {
    // ctx.deps is undefined on the real CLI path (runBlock defaults to {});
    // tests inject a stubbed side-effect surface to drive the wrapper offline.
    await runBlock({ target, refs, cfg, deps: ctx.deps });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
