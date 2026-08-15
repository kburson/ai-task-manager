# Co-Review Finalization and Turn-Budget Control

**Issue:** #1268

**Status:** Approved design

**Surface:** `npx aitm co-review`

## Provenance

This design extends the model-agnostic co-review handshake delivered by #1266 and
specified in
`docs/superpowers/specs/2026-08-14-cross-agent-spec-review-handshake-design.md`.
It preserves that protocol's role separation, immutable runtime artifacts, Git
validation, append-only audit sequence, atomic state projection, and non-stealing
mutex.

The concrete archival story comes from the manually produced #1117 archive at
commit `5c2f1dd75d0f1e492550e28d673c0ac387c51939`, under
`docs/superpowers/reviews/1117/`. That archive demonstrates the desired durable
evidence but is not itself a generalized implementation contract.

## Purpose

The existing protocol can reach reviewer consensus or exhaust its authorized
review-turn budget, but it does not publish durable review evidence and cannot
change its budget while active. This extension adds:

1. deterministic finalization of an accepted review into a caller-selected,
   tracked repository directory;
2. human-authorized adjustment of the absolute review-turn maximum during an
   active cycle;
3. a complete closing owner turn when the last reviewer turn requests changes;
4. resumable intervention with optional human supplemental review context; and
5. an explicit human decision to finalize an exhausted cycle as good enough.

The protocol still coordinates local review state. It does not launch agents,
judge the substance of prose, edit the authoritative artifact, update a GitHub
issue, or perform Git publication.

## Terms and Invariants

A **review turn** is one successful reviewer handoff. `reviewTurnsUsed` counts
completed reviewer handoffs. `maxReviewTurns` is the greatest number of reviewer
handoffs currently authorized. Owner turns do not consume the budget.

A **review cycle** begins when an owner presents a committed specification or plan,
includes the reviewer's findings, and ends after the owner has made any resulting
artifact edits and written the corresponding response. Consequently, a reviewer
changes-requested decision on the last authorized reviewer turn must still grant
the closing owner turn.

The budget invariant remains:

```text
remainingReviewTurns = maxReviewTurns - reviewTurnsUsed
```

`remainingReviewTurns` is never negative. A requested maximum may be clamped to
the minimum that preserves a turn already in progress.

An accepted protocol is terminal. Reviewer consensus or an explicit human
good-enough decision may enter `accepted`; after that transition, protocol state
and events cannot be mutated. Archive metadata belongs only in the generated
manifest, not in accepted protocol state.

## Selected Architecture

### Focused additive extension

The existing CLI parser remains in `scripts/review/co-review.mjs`. The protocol
library continues to own lifecycle validation, integrity, event ordering, mutex
use, and state transitions. One shared budget-adjustment primitive serves active
adjustment and intervention-time continuation.

A focused archival library derives durable output from validated terminal evidence.
It does not own review turns or mutate protocol state. A small GitHub identity
helper resolves the authenticated human for governed actions.

The extension retains the `aitm.co-review/v1` state and event envelopes. New fields
are optional for legacy state, and new event types are additive:

- `budget-adjustment`;
- `supplement`;
- the extended `continue` event; and
- `human-good-enough`.

The accepted decision basis is explicit:

- `reviewer-consensus`; or
- `human-good-enough`.

### Human identity

Human actions resolve the authenticated GitHub login with the configured GitHub
CLI rather than accepting a new actor argument. Resolution failure refuses before
protocol mutation. The existing `--approved-by` continuation option remains a
deprecated compatibility input; when supplied, it must equal the resolved login.

Agent `claim` and `handoff` commands retain `--actor`. Owner and reviewer are two
protocol identities even when both operate through the same workstation and
GitHub account.

## Command Surface

### Initialization

New sessions configure their durable destination at initialization:

```text
npx aitm co-review init --dir <runtime-path> --artifact <repo-path> \
  --owner <identity> --reviewer <identity> --max-turns <N> \
  --archive-dir <tracked-repo-path>
```

`--archive-dir` resolves inside the current repository, outside the ignored runtime
directory, without symbolic-link escape. The target may not be an ignored path.
Initialization records the normalized repository-relative destination. Existing
protocols without this field remain readable and can provide `--archive-dir`
during explicit finalization.

### Active budget adjustment

```text
npx aitm co-review set-max-turns <N> --dir <runtime-path>
```

This command operates only while lifecycle state is `active`. `<N>` is an absolute,
nonnegative integer. It is not an added-turn count.

The effective minimum depends on the active role:

- owner turn: `reviewTurnsUsed`;
- reviewer turn, whether available or claimed: `reviewTurnsUsed + 1`.

If the requested maximum is below that minimum, the command uses the minimum. This
turn-floor behavior implements a short circuit: finish the cycle through its owner
response, but do not start another reviewer turn. A requested value of zero is
therefore valid. Negative and non-integer values refuse.

Under the existing mutex, the command revalidates state and integrity, preserves
the current role, claim, round, artifact, commit, and immutable artifacts, then
appends a `budget-adjustment` event containing:

- prior maximum;
- requested maximum;
- effective maximum;
- turns used and remaining;
- authenticated GitHub login; and
- timestamp.

If the effective maximum already equals the recorded maximum, the command is an
idempotent no-op and emits no duplicate event. Accepted and
`intervention-required` sessions refuse this command.

There is intentionally no global `co-review --max-turns` form. Active adjustment
and exhausted-session continuation are distinct lifecycle actions.

### Supplement registration

During `intervention-required`, an agent that conducted supplemental brainstorming
for the user may register its Markdown summary:

```text
npx aitm co-review supplement --dir <runtime-path> --file <markdown>
```

This command is designed for agent execution rather than routine manual entry. It
does not take `--actor`. It resolves the GitHub login, acquires the protocol mutex,
and verifies that the input is a regular Markdown file inside the ignored runtime
directory, outside protocol state, and not a symbolic link.

Registration assigns a stable protocol supplement ID, records the path and
SHA-256, targets the next reviewer round, appends a `supplement` event, and leaves
the protocol in intervention. Multiple supplements may accumulate. Exact
registration retry is idempotent; changed bytes or reused conflicting paths refuse.

Supplements provide context to the next reviewer. They do not edit the
authoritative artifact and are not copied or listed in the final archive.

### Continuation

```text
npx aitm co-review continue --dir <runtime-path> [--max-turns <N>]
```

Only `intervention-required` may continue. The authenticated GitHub login is the
human authorization record.

The new maximum is calculated as follows:

- no budget flag: `reviewTurnsUsed + 1`;
- `--max-turns N` where `N <= reviewTurnsUsed`: `reviewTurnsUsed + 1`;
- `--max-turns N` where `N > reviewTurnsUsed`: `N`.

The legacy form remains supported:

```text
npx aitm co-review continue --dir <runtime-path> \
  --additional-turns <positive-integer>
```

It adapts to the shared primitive using `currentMaxReviewTurns + N`. The absolute
and additional flags are mutually exclusive. The existing `--focus <file>` form
remains as a compatibility shortcut that registers one supplement and continues
atomically. It retains the existing focus-file location rules even though the new
standalone `supplement` command requires its agent-authored file inside the runtime
directory.

Continuation preserves turns used and freezes all pending supplements into the
next reviewer directive. A reviewer handoff must contain one
`[supplement:S-NNN]` acknowledgment for every frozen supplement. The helper checks
markers without interpreting or rewriting prose. Successful reviewer handoff marks
that frozen set consumed so it cannot leak into later rounds.

An author-completed intervention resumes with the reviewer available. A legacy
session that entered intervention immediately after its final reviewer handoff
resumes with the owner available so the closing response can be completed.

### Finalization

```text
npx aitm co-review finalize --dir <runtime-path> \
  [--archive-dir <tracked-repo-path>]
```

For reviewer consensus, the reviewer `handoff --decision accepted` first persists
the terminal accepted state, releases the protocol mutex, and automatically invokes
finalization. The configured initialization destination is used.

If automatic publication fails, acceptance remains durable and immutable. The
handoff reports the failure, and `status` reports that finalization is required with
the exact retry command.

An exhausted session can be stopped as good enough only after the closing owner
handoff has entered `intervention-required` and both sides of the final evidence
pair exist:

```text
npx aitm co-review finalize --dir <runtime-path> --good-enough \
  [--archive-dir <tracked-repo-path>]
```

This is the only not-yet-accepted lifecycle allowed by `finalize`. It resolves the
GitHub login, validates all terminal evidence and the destination, records a
`human-good-enough` event, transitions to immutable `accepted`, and then publishes
the archive. It is not a separate `accept` command. Active sessions and
intervention states lacking a completed closing owner handoff refuse.

`--archive-dir` is required only for legacy protocols without a configured
destination. When both exist, a differing override refuses.

## Exhaustion and Resumption

Reviewer acceptance always takes precedence over budget exhaustion.

When a reviewer requests changes and consumes the final allowed reviewer turn, the
protocol records the review and makes the owner available even though remaining
reviewer turns equal zero. The reviewer document itself is the unresolved review;
new sessions do not require a separate summary file. Legacy summaries remain valid
evidence.

The closing owner must answer the recorded review, commit or confirm the
authoritative artifact, and hand off the immutable response under the existing
finding-disposition contract. Because no reviewer capacity remains, that handoff
enters `intervention-required` instead of making the reviewer available.

`status` identifies the unresolved reviewer document and any explicit finding IDs
when a review exists, then asks whether the user wants to continue. Its available
actions are:

1. continue with another reviewer turn;
2. finalize an author-completed, two-sided state as good enough; or
3. take no action and return later.

The third choice makes no mutation. A later `status` reproduces the same recovery
guidance. If a zero-turn short circuit occurs before any reviewer handoff, there is
no two-sided evidence pair, so good-enough finalization is unavailable; the user may
continue later or leave the session untouched. The protocol does not distinguish
natural exhaustion from a user-requested short circuit; both are simply exhaustion
at the effective maximum.

## Archive Contract

### Eligibility and evidence resolution

Version 1 archives accepted sessions only:

- reviewer consensus; or
- author-completed exhaustion explicitly accepted as human good enough.

Not-yet-accepted or abandoned intervention state is not archival material.

The archival library resolves every source by recorded event reference and hash,
never by filename patterns.

For reviewer consensus, the final evidence pair is:

1. the owner response immediately preceding the accepted review; and
2. the reviewer document carrying the accepted decision.

For human good enough, the final evidence pair is:

1. the unresolved reviewer document; and
2. the closing owner response and its latest artifact commit.

The accepted artifact is resolved at its accepted commit and verified against its
recorded Git blob and SHA-256 before any output is written.

### Fidelity policy

All three core artifacts are Markdown:

1. the authoritative specification or plan;
2. the final reviewer comments; and
3. the final owner response.

The archive copies the review and response bytes exactly. Source and repository
copy hashes must therefore match. It never creates `.raw` companions, normalizes
Markdown, invokes a formatter or spell checker, corrects language, or rewrites
reviewer meaning.

Agents are responsible for producing normal, repository-ready Markdown. The host
repository owns its document formatting, linting, spelling, and commit gates;
`co-review` neither discovers nor executes those policies. If archived Markdown
does not satisfy the host's rules, the host refuses publication through its normal
workflow.

### Stable output

Output names derive from the artifact basename, recorded round, role, and configured
identity. Slugs use a documented lowercase normalization; a short identity digest
is appended when normalization is lossy or collides. Example shapes are:

```text
README.md
<artifact>-r<round>-owner-<identity>-response.md
<artifact>-r<round>-reviewer-<identity>-review.md
```

The generated `README.md` is both provenance explanation and machine-checkable
manifest. It records at least:

- protocol ID and schema;
- authoritative artifact path;
- accepted commit, Git blob, and SHA-256;
- owner and reviewer identities;
- lifecycle decision and decision basis;
- acceptance timestamp and authenticated human when applicable;
- review turns used, maximum, and remaining;
- final owner response and reviewer document source paths;
- source and archived SHA-256 values;
- archive-relative output paths; and
- the rule that the accepted specification remains normative while the archived
  review and response are evidence.

The manifest does not list runtime supplements. Their substance is carried forward
through the reviewer's acknowledged response.

### Atomic publication and retry

Finalization performs complete integrity and destination preflight before writing.
It creates a sibling staging directory, copies exact evidence, generates the
manifest last, validates the staged tree, and atomically renames the complete tree
to the configured destination.

A crash may leave a staging directory, but it cannot leave a destination that
appears complete. Staging remnants are never treated as an archive. An exact retry
against a complete destination validates every expected path and byte hash and
succeeds without rewriting. Missing, extra, or different destination content
refuses with a precise conflict diagnostic.

Finalization never deletes, edits, or relocates runtime originals. It does not
stage, commit, push, open a pull request, edit the authoritative artifact, update
the GitHub issue, or touch unrelated dirty files. Success prints every produced
path plus the applicable repository verification and commit guidance.

## Concurrency and Failure Behavior

Every protocol mutation uses the existing atomic-directory mutex. The mutator
validates before locking, rereads and validates inside the lock, prepares one event
and state projection, appends the event, atomically replaces state, verifies the
result, and releases the lock. It never steals a surviving mutex.

Important failure boundaries are:

- GitHub identity failure: refuse before mutation;
- integrity or stale-state failure: refuse before mutation or archive writes;
- concurrent mutation: one caller owns the mutex and the other refuses;
- interrupted event/state transition: existing audit/projection mismatch detection
  blocks further mutation for human inspection;
- acceptance followed by archive failure: accepted state remains terminal and
  `status` directs an exact finalization retry;
- interrupted staging: the destination remains absent and incomplete staging is
  not authoritative;
- complete identical destination: idempotent success without rewrite;
- conflicting destination: refuse without modifying either source or destination.

No command silently repairs evidence, removes staging remnants, steals a lock, or
rewrites accepted state.

## Status and Recovery Help

Human-readable and JSON status add:

- configured archive destination and archive completion state;
- accepted decision basis;
- latest budget adjustment, including requested and effective maximum;
- pending and frozen supplement IDs, paths, hashes, and target round;
- closing-owner-turn exhaustion state;
- unresolved reviewer document and explicit finding IDs;
- authenticated human provenance for continuation or good-enough acceptance; and
- one copyable next command.

Top-level and command-specific help document `set-max-turns`, `supplement`, and
`finalize`, the revised `continue` forms, short-circuit behavior, closing owner
turn, automatic consensus finalization, good-enough finalization, exact-byte archive
policy, legacy behavior, refusal causes, and recovery after partial failure.

Help reminds agents that response, review, supplement, and archive inputs are
Markdown expected to satisfy the host repository's governance. Help parsing remains
read-only and available before repository discovery.

## Compatibility

- Existing `status`, `claim`, `wait`, and agent `handoff` forms remain valid.
- Existing runtime directories remain readable.
- Legacy accepted sessions can finalize with an explicit archive destination.
- Legacy exhausted sessions receive their missing closing owner turn on continue.
- Existing summary evidence is retained but no longer required at final reviewer
  exhaustion.
- `continue --additional-turns` remains an adapter.
- `continue --focus` remains an atomic register-and-continue shortcut.
- `--approved-by` remains only as a deprecated authenticated-login assertion.
- Accepted protocols remain immutable; archive state is derived from the manifest.

## Validation Strategy

Development follows test-driven development. Focused co-review tests are written
and observed failing before each production behavior is added.

### Budget and lifecycle tests

- active owner-available, reviewer-available, and claimed adjustment;
- increase, decrease, zero short circuit, floor clamping, and remaining arithmetic;
- negative and non-integer refusal;
- exact retry without duplicate event;
- missing or mismatched GitHub identity refusal before mutation;
- accepted and intervention adjustment refusal;
- mutex contention and stale-state revalidation;
- final changes-requested reviewer handoff granting a closing owner turn;
- closing owner handoff entering intervention;
- unchanged intervention when the user takes no action;
- bare continue, absolute maximum above used, absolute maximum at or below used,
  mutually exclusive flags, and additional-turn compatibility;
- author-completed and legacy reviewer-exhausted continuation role selection; and
- human-readable and JSON budget/status output.

### Supplement tests

- one and multiple registrations with stable IDs, paths, hashes, actor, and target
  round;
- exact retry and changed-input conflict;
- intervention-only enforcement and immutable-file validation;
- continue freezing the pending set;
- missing acknowledgment refusal;
- acknowledgment and consumption without later-round leakage; and
- compatibility behavior for `continue --focus`.

### Finalization tests

- reviewer consensus automatically produces the correct response/review pair;
- good-enough finalization produces the unresolved review/closing response pair;
- active and incomplete-intervention refusal;
- arbitrary artifact, identity, runtime, and archive paths;
- accepted commit, blob, artifact hash, and manifest provenance;
- exact Markdown bytes and equal source/archive hashes;
- integrity failure before output;
- manifest-last atomic publication and injected partial-write failures;
- exact retry without rewrite and precise conflicting-destination refusal;
- accepted state preserved when automatic publication fails;
- legacy accepted protocol with explicit destination;
- runtime originals unchanged;
- unrelated dirty files untouched; and
- unchanged Git HEAD and index with no stage, commit, push, or protocol archive
  mutation.

The focused co-review unit and fixture suites run throughout development. Before
completion, formatting, spelling, linting, `git diff --check`, and the repository's
affected-test verification workflow run against the implementation. A full
clean-trunk baseline is not repeated merely because the governed worktree is new;
broader tests run when the change or repository gate requires them.

## Alternatives Considered

### Normalize archived Markdown

Rejected. Deterministic formatting could still alter reviewer prose and make the
repository copy differ from the immutable evidence.

### Raw evidence plus rendered Markdown

Rejected. A second `.raw` representation complicates provenance and conflicts with
the requirement that the three final artifacts are ordinary Markdown documents.

### Caller-prepared publishable copies

Rejected for version 1. It shifts deterministic pairing and fidelity work to the
caller and creates another artifact whose authority must be explained.

### Archive metadata in accepted protocol state

Rejected. Archive failure after consensus would either mutate terminal state or
misrepresent publication. The tracked manifest is the durable archive record.

### Separate `accept` and `archive` commands

Rejected. Human good enough means stop reviewing and finalize the evidence; a
second housekeeping command adds no useful authority boundary.

### Global `co-review --max-turns`

Rejected. It obscures whether the caller intends active adjustment or continuation
from exhausted intervention.

### Rewrite the protocol as schema version 2

Rejected. The requirements fit additive commands, events, optional state fields,
and focused libraries without invalidating existing runtime evidence.

## Out of Scope

- Archiving unresolved or abandoned intervention sessions.
- Automatically fixing Markdown to satisfy host-repository policy.
- Including supplemental brainstorming files in the durable archive.
- Editing the specification or plan from supplemental brainstorming while the
  protocol is in intervention.
- Multiple concurrent reviewers or human identities.
- Cryptographic identity beyond the configured authenticated GitHub account.
- Launching or messaging agents.
- Staging, committing, pushing, opening a pull request, or updating a GitHub issue.
- Automatic deletion of runtime evidence, stale mutexes, or abandoned staging
  directories.
