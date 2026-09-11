# #1578 Package Boundary Ceiling Design

## Context

Issue #1577's exact-head sandbox verification exposed a deterministic package-boundary failure on the AI peer-review epic branch. The package dry run contains 779 entries while `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` permits 778. The same run passes lint, formatting, integration, slow, and every #1577-specific verifier.

The synchronized branch surface was 778 entries. Issue #1546 intentionally adds one shipped runtime module, `scripts/task-tracker/lib/peer-review-adapter.mjs`, and no other new branch path enters the package. That adapter is already present earlier in the shared `codex/ai-peer-review-design` history at `311cef526`; #1578 is not a trunk-first change that precedes the adapter. The failing count therefore represents missing accounting for an approved runtime entry rather than an accidental package leak.

## Decision

Update only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`:

- add `#1578` to the file's `@story` attribution;
- append a concise ceiling-history note that #1546 adds the one shipped peer-review adapter entry;
- add `scripts/task-tracker/lib/peer-review-adapter.mjs` to the existing required runtime-entry list; and
- raise `ENTRY_CEILING` from 778 to exactly 779.

Only `#1578` joins the `@story` line because #1578 directly modifies this guard. Issue #1546 remains named in the ceiling history and required-entry assertion as the source and owner of the shipped adapter.

The change deliberately adds no contingency headroom. The guard continues to measure the actual working-tree result of `npm pack --dry-run --json`, including any untracked file that npm would pack. The #910 transient-file failure mode is understood: a concurrent writer under a package-eligible path can produce a loud false positive at the exact ceiling. Current tests create fixtures under ignored scratch or temporary roots, and no known test writes a transient file into a package-eligible path in the repository. The residual concurrency risk is accepted because filtering against `git ls-files` would hide a real publishable package leak. Future package growth must still fail the count guard and receive its own explicit review.

## Preserved Boundaries

The implementation must not change:

- `package.json`, `package-lock.json`, or any package allowlist or exclusion;
- production task-tracker or peer-review behavior;
- the test-file and excluded-directory guards;
- the exact `docs/introduction/` inventory;
- the shipped README link guard;
- any existing required runtime-entry assertion, except to extend the list with the #1546 adapter; or
- #1546, #1577, or earlier commit history.

The existing six-case package-boundary test remains the complete focused regression. Five cases already pass, and the count case becomes green only when the reviewed ceiling equals the measured 779-entry surface.

## Alternatives Considered

### Exclude the peer-review adapter

Rejected. The adapter is an intentional runtime dependency of #1546 and must be available to installed-package consumers. Excluding it would make the package test green by breaking the planned distribution contract.

### Add broad ceiling headroom

Rejected. A larger buffer would accept unreviewed future package growth and weaken the coarse tripwire. The ceiling increases one-for-one with the measured and identified runtime entry.

### Filter the count through `git ls-files`

Rejected. `npm pack` can publish package-eligible untracked files from the working tree. Filtering the manifest to tracked files would make the count stable by excluding real tarball entries from inspection, weakening the package boundary rather than fixing it. Exact measurement retains the stricter fail-loud behavior and accepts the bounded concurrency risk described in the Decision.

### Fold the correction into #1546

Rejected. The #1546 adapter commit already precedes this defect on the shared epic branch, but #1546 cannot complete Test while the branch-level package guard is red. The separately governed #1578 blocker gives the discovered guard defect its own review, implementation, and Test receipt without rewriting #1546 history. The adapter and its required-entry assertion still integrate together through the same epic branch.

### Attribute the adjustment to #1577

Rejected. #1577 changes only Node test lifecycle ownership and adds no packed entry. A separate blocker preserves accurate provenance for the package-surface correction discovered during its Test gate.

## Verification

At the clean implementation base, with no untracked package-eligible files or concurrent repository writers, `npm pack --dry-run --json` on Node v25.6.0 must report exactly 779 entries including `scripts/task-tracker/lib/peer-review-adapter.mjs`. The focused test must reproduce five passing cases and one count failure reporting 779 entries against ceiling 778. After the change:

- the focused package-boundary file must pass all six cases;
- the runtime-entry case must require the peer-review adapter explicitly;
- the implementation diff must contain only the story tag, explanatory ceiling history, required adapter entry, and 778-to-779 value change;
- governed Develop iteration verification must pass;
- the repository's Test-stage fast, integration, slow, lint, and formatting lanes must pass at the committed SHA; and
- independent task and final reviewers must confirm that package contents and production behavior are unchanged.

## Lifecycle

Issue #1578 is a native blocker of #1577. It must reach AITM Done before #1577 retries its full sandbox Test receipt. This is lifecycle ordering within the shared `codex/ai-peer-review-design` epic branch: #1546's adapter commit already precedes both blockers, and #1578 must not be integrated or cherry-picked to trunk independently of that adapter. Once #1577 reaches Done, its existing native dependency continues to unblock the remainder of #1546 in the governed sequence for epic #1531. The eventual epic-branch integration therefore brings the adapter, its required-entry assertion, and the exact ceiling to trunk together; there is no intermediate one-entry trunk slack.

Before Plan approval or implementation, #1578's live Scope, deep-dive steps, and second acceptance criterion must be aligned through the governed issue-body mutation path: preserve every existing required entry, add the adapter requirement, and remove the obsolete statement that the required-entry assertions remain byte-for-byte unchanged. This peer-review round changes only tracked review authority and does not mutate the issue body.

Task 15/#1546 still owns later legacy-runtime removal. When that step changes the packed surface or replaces existing required legacy entries, it must remeasure the package, revise the guard under its own review, and avoid treating 779 as a permanent baseline.
