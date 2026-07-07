// #731 — attribution engine: message-grep replaces SHA reachability.
//
// The single primitive that answers "does any commit reference issue #N?" by
// searching commit MESSAGES for the `[#N]` token minted by #730, via
// `git log --all --grep`. Unlike `git merge-base --is-ancestor` (SHA
// reachability), a message match survives rebase/squash/amend and is true on
// any branch topology — the token rides in the message, not in the SHA.
//
// This module is the source-of-truth existence evidence that #733's gates
// (`commit-trace` / `review-preflight` / `close`) will consume. It is purely
// additive: no existing caller is rewired here. SHA reachability
// (`defaultIsReachable` in `commit-trail-handler.mjs`) is retained but demoted
// to advisory annotation — see `annotateReachable` below.
//
// `pexec` is injected so the engine is hermetically unit-testable with no real
// repository, mirroring `defaultIsReachable`'s injectable shape.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { ISSUE_ID_GLOBAL_RE } from './commit-attribution-format.mjs';

const defaultPexec = promisify(execFile);

// Coerce an issue-number input (`731`, `'731'`, `'#731'`) to its digit string.
// Throws on anything that is not a positive integer id — a malformed id would
// produce a garbage grep token and silently attribute nothing.
function normalizeId(issueNumber) {
  const raw = String(issueNumber ?? '')
    .trim()
    .replace(/^#/, '');
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid issue number for attribution: ${JSON.stringify(issueNumber)}`);
  }
  return raw;
}

// Every `[#N]` id referenced anywhere in a subject, as numbers. Reuses #730's
// canonical global regex so attribution and formatting agree on what a token
// is — no re-implemented regex.
function idsInSubject(subject) {
  return [...String(subject ?? '').matchAll(ISSUE_ID_GLOBAL_RE)].map((m) => Number(m[1]));
}

// Return every commit whose message carries the `[#N]` token, as
// `{ sha, subject, ts }` rows in `git log` order (newest first).
//
// The grep is a `--fixed-strings` search for the literal `[#N]` token, so the
// bracket/hash are matched verbatim and a numeric-prefix collision like
// `[#7310]` cannot match `[#731]` (the trailing `]` bounds the token). A
// belt-and-suspenders filter re-checks each returned subject with #730's
// canonical regex, so even if a caller-supplied `pexec` (or a future git quirk)
// leaks a non-matching row, a wrong id never attributes.
//
// `opts`:
//   - `cwd`               — repository directory for the git invocation.
//   - `pexec`             — injectable `execFile` promise (defaults to real git).
//   - `refs`              — ref-scope for the `git log` walk (#733). Defaults to
//                           `['--all']` (every ref), which is what the
//                           `commit-trace`/`review-preflight` gates want. The
//                           `close` gate passes `[trunkRef]` so attribution is
//                           TRUNK-SCOPED: a never-merged feature branch must not
//                           satisfy the "landed on trunk" invariant. Any git
//                           revision-range/ref token(s) are accepted verbatim.
//   - `isReachable(sha)`  — optional advisory predicate; only consulted when
//                           `annotateReachable` is set.
//   - `annotateReachable` — when true, each row gains a `reachable` boolean from
//                           `isReachable`. This is decoration ON TOP OF
//                           message-based existence, never a precondition of it.
export async function attributingCommits(
  issueNumber,
  { cwd, pexec = defaultPexec, refs = ['--all'], isReachable, annotateReachable = false } = {}
) {
  const id = normalizeId(issueNumber);
  const token = `[#${id}]`;
  const scope = Array.isArray(refs) ? refs : [refs];
  const { stdout } = await pexec(
    'git',
    ['log', ...scope, '--fixed-strings', `--grep=${token}`, '--format=%H%x09%s%x09%aI'],
    { cwd, timeout: GIT_TIMEOUT_MS }
  );

  const rows = stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, subject, ts] = line.split('\t');
      return { sha, subject, ts };
    })
    .filter((r) => idsInSubject(r.subject).includes(Number(id)));

  if (annotateReachable && typeof isReachable === 'function') {
    for (const r of rows) {
      r.reachable = await isReachable(r.sha);
    }
  }

  return rows;
}

// Existence predicate: "≥1 commit references this issue". This is the primitive
// #733's gates consume in place of SHA reachability.
export async function hasAttributingCommit(issueNumber, opts) {
  const commits = await attributingCommits(issueNumber, opts);
  return commits.length > 0;
}
