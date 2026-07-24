// Git rename-provenance verdict (#949).
//
// #868 moved 660 test files with `git mv`. `test-tree-layout.test.mjs` AC6
// proves those were genuine renames rather than delete+add, by asserting that a
// sampled file has a rename-following history (`git log --follow`) longer than
// one commit — or, before the move is committed, that it appears as a staged
// rename target.
//
// That evidence needs commits. `actions/checkout` clones at `fetch-depth: 1` by
// default, and in a shallow clone `--follow` can only ever return the single
// fetched commit. The assertion then fails for EVERY sample, unconditionally,
// with no hint that the repository — not the code — is what is wrong. The Fast
// lane on trunk has been red from `d97151b` (#868's own merge) onward for
// exactly this reason. (The Slow lane is gated by event/label, not by a
// `needs:` edge, so it has kept running nightly and green — the breakage
// surfaced only as a red X on the Fast lane.)
//
// #949 fixes both halves. CI now checks out with full history so the assertion
// genuinely runs; and the decision below learns to say "I could not answer"
// instead of asserting a false failure in a workspace that cannot answer.
//
// Precedence is load-bearing and deliberately ordered:
//
//   followCount >= 2  -> ok    a rename chain is present. Answered. This is
//                              checked BEFORE `shallow` on purpose: a shallow
//                              clone that nonetheless carries a chain is real
//                              evidence and must count.
//   stagedRename      -> ok    pre-commit `git mv`; the history does not exist
//                              yet and is not supposed to.
//   shallow           -> skip  cannot answer. Checked AFTER both `ok` rows and
//                              BEFORE `fail`, which narrows the escape hatch to
//                              exactly the unanswerable case.
//   otherwise         -> fail  full history, no chain: a genuine delete+add.
//
// The `fail` row is the whole point of the module. A `skip` that swallowed it
// would turn a red CI green while silently never checking provenance again —
// a false green, which is strictly worse than the red it replaces.
//
// Shallowness must be read from `git rev-parse --is-shallow-repository`, never
// inferred from a low `followCount`: that count is the very thing under test.

/**
 * Decide whether a sampled file's git-mv provenance is proven, unprovable, or
 * genuinely absent.
 *
 * @param {object} input
 * @param {number} input.followCount  commits returned by `git log --follow -- <path>`
 * @param {boolean} [input.stagedRename]  path is a staged rename target
 * @param {boolean} [input.shallow]  working repository is a shallow clone
 * @returns {{status: 'ok'|'skip'|'fail', reason: string}}
 */
export function provenanceVerdict({ followCount, stagedRename = false, shallow = false } = {}) {
  const count = Number.isFinite(followCount) ? followCount : 0;

  if (count >= 2) {
    return { status: 'ok', reason: `rename-following history has ${count} commits` };
  }
  if (stagedRename) {
    return { status: 'ok', reason: 'staged rename target (move not committed yet)' };
  }
  if (shallow) {
    return {
      status: 'skip',
      reason:
        'shallow repository — `git log --follow` cannot reconstruct a rename chain here; ' +
        'clone with full history (CI: `fetch-depth: 0`) to check provenance',
    };
  }
  return {
    status: 'fail',
    reason: `no git-mv provenance (follow-history=${count}, staged-rename=false)`,
  };
}

/**
 * Read shallowness from git. Kept separate from the verdict so the decision
 * stays pure and unit-testable.
 *
 * @param {(args: string[]) => string} git  runner returning stdout
 * @returns {boolean}
 */
export function isShallowRepository(git) {
  try {
    return git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  } catch {
    // A git that predates the flag, or a non-repository. Treat as full history
    // so the assertion still fails loudly rather than skipping silently.
    return false;
  }
}
