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
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseBlockedBy, removeBlockedBy, blockedLabelRemoveArgs } from './blocked-marker.mjs';

const pexec = promisify(execFile);

// --- default gh-backed deps -------------------------------------------------

function defaultListCandidates({ repo }) {
  return async () => {
    const { stdout } = await pexec('gh', [
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

function defaultFetchBody({ repo }) {
  return async (issueNumber) => {
    const { stdout } = await pexec('gh', [
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

function defaultEditBody({ repo }) {
  return async (issueNumber, body) => {
    const tmp = path.join(tmpdir(), `aitm-unpark-${issueNumber}-${process.pid}.md`);
    writeFileSync(tmp, body, 'utf8');
    try {
      await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp]);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* best-effort */
      }
    }
  };
}

function defaultRunLabel({ repo }) {
  return async (args) => {
    await pexec('gh', [...args, '-R', repo]);
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
 *   - fetchBody(n): Promise<string>            issue body text
 *   - editBody(n, body): Promise<void>         write issue body
 *   - runLabel(args): Promise<void>            run a gh label-arg array
 * @returns {Promise<Array<{issue:number, cleared?:'full'|'partial', error?:string}>>}
 *   one entry per candidate that referenced the Done issue (plus any that
 *   errored). Never throws.
 */
export async function unparkDependents({ doneIssueNumber, cfg = {}, deps = {} } = {}) {
  const done = Number(doneIssueNumber);
  if (!Number.isInteger(done) || done <= 0) return [];

  const repo = cfg.repo;
  const listCandidates = deps.listCandidates || defaultListCandidates({ repo });
  const fetchBody = deps.fetchBody || defaultFetchBody({ repo });
  const editBody = deps.editBody || defaultEditBody({ repo });
  const runLabel = deps.runLabel || defaultRunLabel({ repo });

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

      const next = removeBlockedBy(body, done);
      await editBody(issue, next);

      const remaining = parseBlockedBy(next);
      if (remaining.length === 0) {
        await runLabel(blockedLabelRemoveArgs(issue));
        results.push({ issue, cleared: 'full' });
      } else {
        results.push({ issue, cleared: 'partial' });
      }
    } catch (err) {
      results.push({ issue, error: err.message });
    }
  }
  return results;
}
