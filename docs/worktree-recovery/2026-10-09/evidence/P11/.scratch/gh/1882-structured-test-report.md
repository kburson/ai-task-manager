## New Automated Tests

- `scripts/tests/integration/task-tracker/merge-back-cli.test.mjs`
  - #1882: registered CLI integrates from child into its already checked-out parent and retains checkout
  - #1882: failed configured evidence leaves parent tip and child checkout intact
  - #1882: invalid CLI options refuse before any Git change
  - #1882: wrong recorded parent checkout refuses without switching it
  - #1882: a parent checkout changed during verification is retained and refused
  - #1882: malformed child config refuses without falling back to host suites
- `scripts/tests/integration/task-tracker/merge-back-verification.test.mjs`
  - #1882: project verification executes configured and declared commands without default suites
  - #1882: stale-head evidence is a failed verification, never a suite fallback
  - #1882: rejected issue commands refuse plan construction before execution
  - #1882: invalid provider configuration cannot silently select Node full suites
  - #1882: a passing verifier that changes source cannot authorize integration
  - #1882: Node default verifies each existing suite section
- `scripts/tests/unit/task-tracker/merge-back.test.mjs`
  - #1882: preservation retains the child checkout, branch and upstream after integration
  - #1882: non-boolean verification cannot silently authorize a merge
  - #1882: invalid preservation values refuse before any Git mutation
  - #1882: verification head drift refuses before parent integration
  - #1882: parent integration uses the verified commit rather than a movable child ref

_Each bullet is the verbatim title of a test case added during this issue’s Develop stage, grouped by test file. Read a title as `subject: scenario → expected outcome` — the value after `→` is what the test **asserts** (e.g. `→ error` means the input is expected to throw/reject), not an actual result. All listed tests pass: this comment is posted only after the Develop→Test gate goes green._

### Execution evidence

Seventeen new merge-back regressions cover validated project plans, real configured and issue-declared commands, stale and unsuccessful evidence, source mutation, malformed child JSON, invalid provider/declaration configuration, authoritative child/parent checkout routing, changed parent checkout, strict boolean admission, checkout preservation, verified-head drift, and merging the exact tested commit. Real-Git tests live in the integration lane. Default Node probes execute tiny fixture scripts, never the repository's full host suites.

The genuine red runs are retained under `.scratch/1882/`: preservation-red (3 assertion failures), provider-red (6), cli-red (4), and head-guards-red (3). Final focused and boundary execution f99dfc17-cfbf-4ab0-9f94-84be30687247 passed all 60 tests, with zero failures, cancellations or skips. AITM independently executed the focused AC verifier at source `482a7ace68070d628050952bce8c61eba5c9435f` in run dfba43c7-831f-4779-a9a7-452a0fca6204.

Canonical TIA execution 336c47e2-919a-4650-a0f4-d7f3f30f0795 completed successfully at this exact clean head, selecting 136 files without complete-lane escalation. Every selected file returned exit 0; no full repository host suite was run. Earlier failed/interrupted runs remain accurately recorded.

Complete CI run 37248866828 is successful at the same source head: all seven collection workers and both aggregate lanes, npm 11/Node 24 and npm 12/Node 26 package compatibility, guidance budget and CodeQL are green. All nine expected current-attempt worker/aggregate artifacts are available. Canonical Test validates their genuine provenance before lifecycle completion.
