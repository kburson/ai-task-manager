# #1578 Package Boundary Ceiling Design

## Context

Issue #1577's exact-head sandbox verification exposed a deterministic package-boundary failure on the AI peer-review epic branch. The package dry run contains 779 entries while `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` permits 778. The same run passes lint, formatting, integration, slow, and every #1577-specific verifier.

The synchronized branch surface was 778 entries. Issue #1546 intentionally adds one shipped runtime module, `scripts/task-tracker/lib/peer-review-adapter.mjs`, and no other new branch path enters the package. The failing count therefore represents missing accounting for an approved runtime entry rather than an accidental package leak.

## Decision

Update only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`:

- add `#1578` to the file's `@story` attribution;
- append a concise ceiling-history note that #1546 adds the one shipped peer-review adapter entry; and
- raise `ENTRY_CEILING` from 778 to exactly 779.

The change adds no contingency headroom. Future package growth must still fail the count guard and receive its own explicit review.

## Preserved Boundaries

The implementation must not change:

- `package.json`, `package-lock.json`, or any package allowlist or exclusion;
- production task-tracker or peer-review behavior;
- the test-file and excluded-directory guards;
- the exact `docs/introduction/` inventory;
- the shipped README link guard;
- the required runtime-entry assertions; or
- #1546, #1577, or earlier commit history.

The existing six-case package-boundary test remains the complete focused regression. Five cases already pass, and the count case becomes green only when the reviewed ceiling equals the measured 779-entry surface.

## Alternatives Considered

### Exclude the peer-review adapter

Rejected. The adapter is an intentional runtime dependency of #1546 and must be available to installed-package consumers. Excluding it would make the package test green by breaking the planned distribution contract.

### Add broad ceiling headroom

Rejected. A larger buffer would accept unreviewed future package growth and weaken the coarse tripwire. The ceiling increases one-for-one with the measured and identified runtime entry.

### Attribute the adjustment to #1577

Rejected. #1577 changes only Node test lifecycle ownership and adds no packed entry. A separate blocker preserves accurate provenance for the package-surface correction discovered during its Test gate.

## Verification

At the implementation base, Node v25.6.0 must reproduce five passing cases and one count failure reporting 779 entries against ceiling 778. After the change:

- the focused package-boundary file must pass all six cases;
- the implementation diff must contain only the story tag, explanatory ceiling history, and 778-to-779 value change;
- governed Develop iteration verification must pass;
- the repository's Test-stage fast, integration, slow, lint, and formatting lanes must pass at the committed SHA; and
- independent task and final reviewers must confirm that package contents and production behavior are unchanged.

## Lifecycle

#1578 is a native blocker of #1577. It must reach AITM Done before #1577 retries its full sandbox Test receipt. Once #1577 reaches Done, its existing native dependency continues to unblock #1546 in the governed sequence for epic #1531.
