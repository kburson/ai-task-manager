# #1411 Residue Audit Hardening Design

## Context

Issue #1411 introduced a narrow exemption for machine-generated data under
`docs/research/` so the legacy state-vocabulary audit would not fail on its own
generated inventories. The implementation was delivered through PR #1418 and
later moved from the unit lane to the integration lane by #1413.

Reconciliation review found two gaps in the delivered design:

1. `isGeneratedResearchArtifact` translates every backslash to `/`. Git's
   `ls-files -z` output already uses canonical repository paths, so a backslash
   on POSIX is a literal filename character rather than a separator. Translating
   it can misclassify a root-level `docs\research\payload.json` file as exempt.
2. The AC2 boundary test proves only that selected paths are not exempt. It does
   not feed genuine legacy vocabulary through the audit evaluator and observe
   the promised `UNEXPECTED` failure.

## Decision

Treat Git repository paths as canonical input and make the audit evaluator a
pure, reusable seam shared by the live integration test and focused unit tests.

### Canonical path contract

`isGeneratedResearchArtifact(file)` returns `true` only when all of these hold:

- `file` is a string-shaped, repository-relative path;
- it contains no backslash;
- it is not absolute;
- none of its `/`-separated segments is empty, `.` or `..`;
- it starts with the exact anchored prefix `docs/research/`; and
- it ends with `.json`, `.txt`, `.csv` or `.ndjson`.

The helper does not normalize or repair untrusted input. Non-canonical input is
audited rather than exempted. Existing canonical Git paths keep their current
behavior.

### Pure audit evaluator

Move the residue classification loop behind a pure helper that accepts an
explicit collection of `{ file, source }` entries and the existing exact-count
allowlist. The helper returns the same failure strings the live audit currently
builds:

- `UNEXPECTED` for residue in a path absent from the allowlist;
- `COUNT` when an allowlisted file has the wrong number of matches; and
- `MISSING` when an expected compatibility carrier is absent.

The integration test remains responsible for the system boundary: collecting
tracked and untracked repository paths with `git ls-files -z` and reading their
contents. It passes those entries to the pure evaluator and asserts that the
returned failure list is empty. The pure helper owns no filesystem or Git
access.

The existing legacy-token matcher moves with the evaluator so focused tests
exercise the same matching behavior as the live audit, including split-line
vocabulary.

## Alternatives Considered

### Temporary repository integration test

Create a temporary Git repository containing a product file with legacy
vocabulary and run the complete audit as a child process. This proves the whole
system boundary but adds repository setup, subprocess cost and path-fixture
complexity to a policy that can be proven through a smaller pure seam.

### Duplicate the audit condition in the boundary test

Keep the live audit monolithic and recreate enough logic in the unit test to
assert an `UNEXPECTED` result. This is smaller initially, but it can drift from
the real evaluator and would not satisfy AC2's behavioral intent reliably.

### Selected approach

Use the pure evaluator. It proves the failure semantics without extra Git
processes and makes the integration test consume the same code exercised by the
negative regression.

## Test-Driven Implementation

Implement in two red-green cycles:

1. Replace the current positive backslash-normalization test with negative cases
   for a literal backslash, an absolute path, empty segments, `.` and `..`.
   Confirm the focused boundary test fails because the current predicate returns
   `true`, then minimally harden the predicate.
2. Add a focused test that passes genuine legacy vocabulary in a product-code
   entry to the wished-for pure evaluator and expects an `UNEXPECTED` failure.
   Pair it with generated research data containing the same vocabulary and
   expect no unexpected residue. Confirm the test fails before extracting the
   evaluator, then make the live integration test call the new seam.

After each cycle, run the focused boundary and live audit tests. Final governed
verification reruns the fast lane, slow lane, lint and formatting in a fresh Test
sandbox.

## Safety and Compatibility

- The exemption becomes narrower; it never admits a path the current canonical
  `git ls-files` caller needs to exempt.
- The exact compatibility allowlist and its count semantics remain unchanged.
- Generated research extensions and the anchored `docs/research/` scope remain
  unchanged.
- Authored Markdown, executable analysis scripts and generated-looking files
  outside the research root remain audited.
- No production runtime, lifecycle, Git command or CI lane behavior changes.

## Out of Scope

- Changing the legacy vocabulary or compatibility allowlist.
- Expanding the generated-data extension set.
- Reversing #1413's integration-lane relocation.
- General-purpose path canonicalization for callers outside this audit.
- Refactoring unrelated residue, migration or test-corpus policy.
