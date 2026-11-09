### Task 15: Migrate AITM Through the Published Package Boundary

**Files:**

- Modify: `ai-task-manager/package.json`
- Modify: `ai-task-manager/package-lock.json`
- Create: `ai-task-manager/scripts/task-tracker/lib/peer-review-adapter.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/lib/occupancy.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/test-impact-manifest.json`
- Modify: `ai-task-manager/scripts/task-tracker/verbs/help-data.mjs`
- Modify: `ai-task-manager/skill/shared/rules/review.md`
- Create: `ai-task-manager/scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- Create: `ai-task-manager/scripts/tests/integration/review/peer-review-migration-guard.test.mjs`
- Delete after parity/guard gate: `ai-task-manager/scripts/review/**`
- Delete after parity/guard gate: AITM-only co-review fixtures and tests superseded
  by package coverage

**Interfaces:**

- Consumes: an exact published `ai-peer-review@0.1.x` package and its read-only
  `statusReview` public API, plus a real governed AITM migration issue supplied
  before this task begins. Do not invent an issue ID. If no issue exists, stop
  and create one through `/task new` / the sanctioned
  `scripts/gh/create-issue.mjs --shape solo` workflow, then take it through the
  ordinary Refine, Plan approval, and Develop gates.
- Produces: `AITM_PEER_REVIEW_CONFIG`, `peerReviewStatus({ workspace, api }) ->
HostReviewStatus`, and AITM configuration using reviews root
  `docs/superpowers/reviews`, template `<issue>/<kind>`, opaque positive issue
  metadata, and AITM-owned occupancy caching.

- [ ] **Step 1: Bind the governed AITM issue and capture its real ID**

Set `APR_AITM_ISSUE` to the supplied issue's returned positive integer, bind it
with `npx aitm start`, and confirm it is in Develop with the required
planning/deep-dive evidence. In the current AITM command surface, `start` is the
documented bind-and-start operation; there is no separate `aitm bind` verb. This
is runtime evidence, not a plan placeholder:

```bash
: "${APR_AITM_ISSUE:?set APR_AITM_ISSUE to the governed migration issue ID}"
test "$APR_AITM_ISSUE" -gt 0
npx aitm start "$APR_AITM_ISSUE"
npx aitm status "$APR_AITM_ISSUE"
```

Expected: both commands exit 0 and status names this worktree, the migration
issue, and Develop. Every AITM commit in this task must begin with
`[#${APR_AITM_ISSUE}]`.

- [ ] **Step 2: Write RED dependency-boundary and parity tests**

Install the exact released version. Assert AITM invokes the installed
`peer-review` binary or read-only API, never adds `npx aitm peer-review`, rejects
no-commit mode in governed production while enabling it explicitly in tests, and
passes issue/kind/output settings without the package reading AITM state.

Replay the legacy happy path, one revision, acceptance, budget exhaustion,
supplement, good-enough, dirty-tree, collision, and recovery fixtures through the
package. Compare semantic state/evidence, allowing only ratified schema/path/name
changes.

- [ ] **Step 3: Write RED active-legacy-review removal tests**

Create an active legacy runtime/index row and assert migration refuses to remove
or disable `scripts/review/**`. Create accepted and abandoned legacy records and
assert their archived bytes remain immutable and readable but are never upgraded
or rewritten. Prove AITM occupancy remains main-worktree anchored while package
state is per-review authority.

- [ ] **Step 4: Run the focused tests and verify RED**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: FAIL while AITM still routes through `scripts/review/co-review.mjs`.

- [ ] **Step 5: Implement the narrow host adapter**

```js
export const AITM_PEER_REVIEW_CONFIG = Object.freeze({
  reviewsRoot: 'docs/superpowers/reviews',
  reviewPathTemplate: '<issue>/<kind>',
  allowNoCommit: false,
});

export function peerReviewStatus({ workspace, api }) {
  const status = api.statusReview(workspace);
  return Object.freeze({
    reviewId: status.review_id,
    state: status.state,
    worktree: status.worktree,
  });
}
```

Keep issue lifecycle, backlog context, and occupancy policy in AITM. Cache package
status only as non-authoritative occupancy data. Do not import package internals.

- [ ] **Step 6: Remove duplicate runtime only after the guard passes**

Run parity with both engines present. If and only if no active legacy review
exists and parity passes, delete the duplicate CLI/runtime/templates and only
those tests now owned by the package. Preserve provider code still used elsewhere
in AITM and every accepted archive. Step 7's path-limited `git add -A` records
only deletions this guard actually authorized; when the guard retains legacy
runtime, that staging command is a no-op for unchanged paths.

- [ ] **Step 7: Run governed AITM Develop verification and commit**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git status --short
git add package.json package-lock.json \
  scripts/task-tracker/lib/peer-review-adapter.mjs \
  scripts/task-tracker/lib/occupancy.mjs \
  scripts/task-tracker/lib/command-surface/entrypoints.mjs \
  scripts/task-tracker/test-impact-manifest.json \
  scripts/task-tracker/verbs/help-data.mjs \
  skill/shared/rules/review.md \
  scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-migration-guard.test.mjs
git add -A -- scripts/review
git commit -m "[#${APR_AITM_ISSUE}] feat: consume standalone peer review package"
node scripts/task-tracker/verify-develop.mjs --mode final --issue "$APR_AITM_ISSUE"
npx aitm promote "$APR_AITM_ISSUE"
```

Expected: focused and iteration checks pass before the attributed commit; exact-
SHA finalization passes on the clean commit; governed promotion runs the
Develop-to-Test preflights and then AITM's configured Test verification
contract. No AITM `src`/runtime copy of package authority remains, and active
legacy review removal is still refused. Do not substitute direct state mutation
or a duplicate ad hoc full-suite run.

