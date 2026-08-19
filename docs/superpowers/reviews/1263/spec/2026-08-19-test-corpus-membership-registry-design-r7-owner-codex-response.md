# Round 5 owner response — test corpus membership registry design

**Owner:** `codex`
**Responding to:** `round-4-reviewer-review.md`
**Reviewed commit:** `057780de00225470d41ee28e07423a04dd27b381`

## Finding response

### [finding:F-001] [disposition:accepted-with-modification]

The round-3 resolution is retained unchanged: schema 1 has no `introducedBy`,
the migration source is the complete live remainder, and the stale central
array is only a subset check.

### [finding:F-002] [disposition:accepted]

The round-3 resolution is retained unchanged: the focused Grok-provider path
list, central post-snapshot array, minimum-count logic, and exact multi-story
census are retired as independently authored membership claims.

### [finding:F-003] [disposition:accepted-with-modification]

The round-3 resolution is retained unchanged: a cheap membership test is
separate from expensive package and frozen-history proofs; content-only test
edits may over-select the cheap check, and existing `deleted-test-lane`
escalation remains intact.

### [finding:F-004] [disposition:accepted-with-modification]

The round-3 resolution is retained unchanged: records contain only `schema` and
`path`; Git history owns introduction provenance, and `@story` owns many-to-many
evidence.

### [finding:F-005] [disposition:accepted]

The round-3 resolution is retained and completed by F-006: noncanonical
discovery fails as a layout error before reconciliation, and `recordPath()` is
available only for canonical test paths.

### [finding:F-006] [disposition:accepted]

The headline validity contract now has two explicit clauses:

```text
noncanonical(discoverTestFiles()) = empty

canonical(discoverTestFiles())
  = finalized frozen migration destinations
    union post-snapshot membership-record paths
```

The text states that a noncanonical path fails as a layout error before
membership reconciliation or record-path diagnostics. The leftover
"introducing story's record" phrase was also removed; unchanged-path edits leave
the membership record untouched solely because the path did not change.

## Result

The Decision equation, reconciler, diagnostics, mapping precondition, and shared
test lifecycle now express the same canonical-only membership contract.
