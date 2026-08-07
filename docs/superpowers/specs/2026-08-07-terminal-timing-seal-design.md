# Terminal Timing Seal Design

## Context

Issue #1127 contains a valid terminal timing sequence followed by invalid
activity:

1. `review:approved`
2. `issue:wrap`
3. `issue:closed`
4. `resumed`
5. a second `review:approved`
6. a second `issue:wrap`
7. `switch-out:#1129`

The durable `issue:closed` row should make the timing ledger immutable, but the
current implementation only recognizes a close as terminal while that row is
the parsed tail. A stale-workspace resume therefore reopens the append path,
and the malformed tail makes a later close retry think its approval/wrap pair
is missing.

## Goal

Make the first valid timing-table row whose event is exactly `issue:closed` an
irreversible terminal seal. Prevent all later timing appends, keep close retries
idempotent even when a malformed tail already exists, and give the timing-log
healer a deterministic and auditable way to remove historical post-terminal
rows.

## Non-goals

- Defining lifecycle or timing behavior for a deliberately reopened GitHub
  issue.
- Replacing the timing-log schema.
- Repairing malformed histories unrelated to post-terminal activity.
- Adding a network read of GitHub issue state to each timing append.

## Approaches considered

### Selected: enforce the seal at the locked timing-comment boundary

The locked `appendRow` chokepoint already serializes every live, queued,
lifecycle, and audit timing write. A shared parser-backed predicate will detect
the first exact `issue:closed` row, and the append boundary will return the
existing body unchanged for every incoming event after that point.

This makes the timing ledger itself authoritative, closes all current write
paths at one boundary, and does not add network latency or races.

### Rejected: add guards to individual verbs

Resume, start, stop, close, and queue-flush guards would duplicate policy and
leave future or overlooked writers able to bypass the seal.

### Rejected: query GitHub CLOSED state before each append

GitHub lifecycle state is not the serialized timing-comment authority. A
network check would add latency, fail offline, and could disagree with or race
the locked comment mutation.

## Design

### Durable seal predicate

`scripts/task-tracker/lib/terminal-review-handoff.mjs` will export
`hasTerminalTimingSeal(body)`. It will split the body into lines, parse each line
with `parseTimingRow`, and return true only when a parsed row's event is exactly
`issue:closed`. Prose, headings, malformed table rows, and descriptions that
merely mention the words do not seal the log.

The same module will expose a combined append-suppression predicate. A durable
seal suppresses every event. Before a seal, the existing open-review-handoff
rule continues to suppress only `stop`, `resumed`, and `resume:*`.

### Locked append boundary

`scripts/task-tracker/gh-timing-comment.mjs` will use the combined predicate in
`appendRow` before any duplicate-start rewrite, interruption check, timestamp
clamp, or insertion. Returning the original body preserves byte identity and
makes all post-seal appends no-ops.

The GitHub update helper may still perform an idempotent comment update with an
unchanged body. Avoiding that network call is not required for timing-ledger
correctness and is outside this focused repair.

### Close-pair idempotency

`pendingClosePairState(body)` in
`scripts/task-tracker/timing-rollup.mjs` will treat the presence of any valid
`issue:closed` row as conclusive evidence that the terminal close pair is
already handled. It will return:

```js
{ reviewApproved: true, issueWrap: true }
```

This rule deliberately replaces reopened-window semantics. Reopening an issue
against an old timing ledger is a separate product design and cannot silently
unseal terminal evidence.

### Historical healing

`scripts/task-tracker/lib/heal-timing-log.mjs` will add
`countPostTerminalRows(body)`. The count includes every valid parsed timing data
row after the first exact `issue:closed` row, including resume, duplicate close
pair, duplicate close, and switch/departure activity.

`healTimingLog(body)` will remove those rows before its existing cleanup and
recalculation passes. The post-terminal cleanup itself will retain:

- every byte before the first seal, subject only to the healer's pre-existing
  independently-scoped transforms;
- the first seal row itself;
- non-timing prose after the timing table;
- the existing newline shape.

The first seal is always authoritative. A second healer pass must return a
byte-identical body.

`scripts/task-tracker/heal-timing-log.mjs` will publish
`postTerminal=N -> 0` in per-issue output and a `postTerminalRows=N` aggregate in
sweep summaries. Dry-run and apply paths will report the same counts.

## Error handling and invariants

- Non-string or empty bodies remain unchanged and report zero post-terminal
  rows.
- A malformed row after the seal is preserved if it is not parseable as a
  timing data row; only recognized ledger rows are within healer authority.
- A malformed line containing `issue:closed` does not create a seal.
- The first valid seal wins even if later valid close rows exist.
- Existing pre-seal timing transforms continue to run after post-terminal rows
  are removed.

## Verification strategy

The implementation follows RED-GREEN-REFACTOR:

1. Reproduce #1127 at the locked append boundary and prove post-seal events
   currently append.
2. Prove a malformed post-seal row currently reopens close-pair emission.
3. Prove the healer currently retains the invalid suffix.
4. Pin first-seal retention, exact valid-prefix preservation, removal counts,
   prose preservation, and second-pass idempotency.
5. Pin per-issue and sweep reporting.
6. Implement the smallest shared predicate, close-pair rule, healer filter,
   and count plumbing that makes those tests pass.
7. Run focused tests, the fast and slow suites, lint, format, exact-SHA
   governed Test, and Agent Review.

## Delivery constraints

All design, plan, test, and implementation changes for #1134 are delivered as
one story commit. No subagent is used. The feature branch targets `trunk`, and
integration occurs before returning to the remaining #1067 children.
