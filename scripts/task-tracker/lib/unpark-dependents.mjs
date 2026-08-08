// Auto-unpark dependents when a blocker reaches Done (#249).
//
// When an issue lands at `done`, any sibling whose body carries an
// `aitm-blocked-by` marker referencing it should be released:
//   - strip the now-Done reference from the dependent's marker (child (b)), and
//   - when that empties the dependent's blocker list, also drop its `BLOCKED`
//     label. A partial clear (other blockers remain) keeps both the label and a
//     residual marker.
//
// This step is best-effort: every candidate is processed under its own
// try/catch and the function never throws. The board move that triggered it is
// already committed, so a failure here must not roll it back. Marker mechanics
// live in lib/blocked-marker.mjs; this module only orchestrates the side effect
// through injected `deps` (defaults wrap `gh`).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseBlockedBy, removeBlockedBy, blockedLabelRemoveArgs } from './blocked-marker.mjs';
import { writeBlockedByField } from './blocked-by-field.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';

const pexec = promisify(execFile);

// --- default gh-backed deps -------------------------------------------------

function defaultListCandidates({ repo, exec = pexec }) {
  return async () => {
    const { stdout } = await exec('gh', [
      'issue',
      'list',
      '-R',
      repo,
      '--label',
      'BLOCKED',
      '--state',
      'open',
      '--json',
      'number',
      '--jq',
      '.[].number',
    ]);
    return stdout
      .split('\n')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  };
}

function defaultFetchBody({ repo, exec = pexec }) {
  return async (issueNumber) => {
    const { stdout } = await exec('gh', [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      repo,
      '--json',
      'body',
      '--jq',
      '.body',
    ]);
    return stdout.replace(/\r\n/g, '\n');
  };
}

function defaultMutateBody({ repo, exec = pexec }) {
  return async (issueNumber, mutate) => {
    await mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec: exec } });
  };
}

function defaultRunLabel({ repo, exec = pexec }) {
  return async (args) => {
    await exec('gh', [...args, '-R', repo]);
  };
}

/**
 * Release siblings blocked on a now-Done issue.
 *
 * @param {object}   opts
 * @param {number}   opts.doneIssueNumber  the issue that just reached Done
 * @param {object}   [opts.cfg]            config carrying `repo` for default deps
 * @param {object}   [opts.deps]           injectable side-effect surface:
 *   - listCandidates(): Promise<number[]>      issues that may be blocked
 *   - fetchBody(n): Promise<string>            issue body text (used for blocker discovery)
 *   - mutateBody(n, mutate): Promise<void>     atomically mutate issue body via closure
 *   - runLabel(args): Promise<void>            run a gh label-arg array
 *   - exec(cmd, args): Promise<{stdout}>       low-level exec seam for the
 *       default gh-backed factories (defaults to promisified execFile); a
 *       provided listCandidates/fetchBody/mutateBody/runLabel still overrides.
 * @returns {Promise<Array<{issue:number, cleared?:'full'|'partial', error?:string}>>}
 *   one entry per candidate that referenced the Done issue (plus any that
 *   errored). Never throws.
 */
export async function unparkDependents({ doneIssueNumber, cfg = {}, deps = {} } = {}) {
  const done = Number(doneIssueNumber);
  if (!Number.isInteger(done) || done <= 0) return [];

  const repo = cfg.repo;
  // `deps.exec` is a `pexec`-shaped seam threaded into the default gh-backed
  // factories; it defaults to the module `pexec` so production behavior is
  // unchanged. Injected callers (listCandidates/fetchBody/…) still win outright.
  const exec = deps.exec || pexec;
  const listCandidates = deps.listCandidates || defaultListCandidates({ repo, exec });
  const fetchBody = deps.fetchBody || defaultFetchBody({ repo, exec });
  const mutateBody = deps.mutateBody || defaultMutateBody({ repo, exec });
  const runLabel = deps.runLabel || defaultRunLabel({ repo, exec });

  let candidates;
  try {
    candidates = await listCandidates();
  } catch (err) {
    return [{ issue: null, error: `listCandidates failed: ${err.message}` }];
  }

  const results = [];
  for (const issue of candidates) {
    if (issue === done) continue;
    try {
      const body = await fetchBody(issue);
      const blockers = parseBlockedBy(body);
      if (!blockers.includes(done)) continue;

      // #295 — mutate the live body inside the closure so a concurrent
      // writer between the discovery fetch above and this write doesn't
      // get clobbered. `remaining` is deterministic from `blockers` (which
      // we already verified contains `done`), so we don't need to re-parse
      // the post-mutation body.
      await mutateBody(issue, (base) => removeBlockedBy(base, done));
      const remaining = blockers.filter((b) => b !== done);

      if (remaining.length === 0) {
        await runLabel(blockedLabelRemoveArgs(issue));
        results.push({ issue, cleared: 'full' });
      } else {
        results.push({ issue, cleared: 'partial' });
      }

      // Mirror the post-removal marker into the `Blocked By` Project field.
      // Best-effort; the board move that triggered unpark is already
      // committed, so a field-write failure must not roll it back.
      const mirrorDeps = deps.writeFieldValue ? { writeFieldValue: deps.writeFieldValue } : {};
      try {
        await writeBlockedByField({
          issueNumber: issue,
          refs: remaining,
          cfg,
          deps: mirrorDeps,
        });
      } catch {
        /* best-effort */
      }
    } catch (err) {
      results.push({ issue, error: err.message });
    }
  }
  return results;
}
