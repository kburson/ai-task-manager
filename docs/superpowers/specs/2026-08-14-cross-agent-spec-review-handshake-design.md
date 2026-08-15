# Model-Agnostic Co-Review Handshake

**Issue:** #1266

**Status:** Approved design

**Surface:** `npx aitm co-review`

## Provenance

This design generalizes the transient Codex/Claude protocol introduced by commit
`10ffbcf3904e2f1b29aaebc5e8b3b59ae7a3e487` for issue #1117. The source file was
first copied without alteration and verified as Git blob
`8c6c09623bee54d6b51e298bab08bce6ca570765`. The generalized design preserves its
atomic state, immutable round artifacts, role ownership, Git validation, bounded
wait, and append-only audit intent while removing issue-, model-, and path-specific
assumptions.

## Purpose

`co-review` coordinates two independently operating agents through repeated review
rounds over one authoritative, committed artifact:

```text
owner revises artifact and writes response
  -> reviewer examines both and writes review
  -> owner responds and revises
  -> repeat until reviewer explicitly accepts
```

The protocol answers five recovery questions without relying on chat history:

1. What artifact and exact Git revision are under review?
2. Who is the configured owner and reviewer, and whose turn is it?
3. What immutable response or review completed each round?
4. Did the reviewer accept, request changes, or exhaust the human-approved turn
   budget?
5. What exact command should the current actor run next?

The helper coordinates local review state only. It does not decide whether a design
is correct, launch an agent, message a session, mutate an AITM issue, or replace the
authoritative Git history.

## Roles and Authority

The protocol has roles, not model names:

- **owner** exclusively edits and commits the authoritative artifact, and writes an
  immutable response to the preceding review;
- **reviewer** reads the artifact and response, performs read-only repository checks,
  and writes an immutable review with an explicit decision;
- **human** configures the review-turn budget and is the only authority that may add
  turns, provide refocus instructions, repair protocol state, change role ownership,
  or resolve a stuck mutex.

`--owner` and `--reviewer` record caller-supplied actor identities. The helper maps
those identities to roles and never special-cases Codex, Claude, or any other model.
An actor identity is coordination provenance, not authentication.

Only the helper mutates protocol state. It never edits round artifacts, the
authoritative artifact, the Git index, commits, branches, issue state, or task
records.

## Selected Architecture

### Standalone routed command

The committed entrypoint is `scripts/review/co-review.mjs`, exposed as
`npx aitm co-review`. Protocol rules live in `scripts/review/lib/protocol.mjs` and
recovery-oriented command documentation lives in `scripts/review/lib/help.mjs`.
The command is registered as an `agent-callable-standalone` entrypoint and follows
the repository self-documentation contract.

### Caller-selected local directory

Every command takes `--dir <path>`. A caller normally chooses a Git-ignored runtime
directory such as `.tmp/1117-review`; the command refuses initialization if the
directory is tracked or not ignored. Nothing in the runtime directory is committed.

The directory contains:

- `state.json` — atomic current-state projection;
- `events.jsonl` — append-only initialization, claim, handoff, and continuation
  events;
- `.co-review-lock/` — short-lived non-stealing command mutex;
- caller-created immutable review and response Markdown files;
- optional immutable human refocus files supplied to `continue`.

The helper validates and hashes completed artifacts but does not write their prose.

### State and audit trail

`state.json` uses schema `aitm.co-review/v1` and records:

- protocol ID, runtime directory, repository root, and worktree identity;
- configured owner and reviewer identities;
- authoritative artifact path relative to the repository root;
- monotonically increasing revision and review round;
- current role, availability or claim, claimant, and claim timestamp;
- lifecycle status: `active`, `accepted`, or `intervention-required`;
- last handoff, message, decision, exact commit, artifact blob hash, and round
  artifact hashes;
- `reviewTurnsUsed`, `maxReviewTurns`, and remaining turns;
- imported-review provenance, when initialization bootstraps an existing review;
- the latest continuation approval and optional refocus-file hash.

`state.json` is an operational projection. `events.jsonl` is the immutable local
audit sequence. Both mirror budget fields after each mutation so a context-reset
agent can recover without reconstructing counts from filenames.

## Review-Turn Budget and Human Interception

Initialization requires `--max-turns <positive-integer>`. A review turn is consumed
whenever the reviewer successfully hands off one immutable review, regardless of
its decision. An imported review counts as reviewer turn 1. Owner revisions and
failed/refused commands do not consume turns.

Reviewer decisions are exactly:

- `accepted` — terminal success;
- `changes-requested` — return control to the owner when budget remains.

Acceptance has precedence over budget exhaustion: an `accepted` decision on the
last allowed reviewer turn ends in `accepted`.

A `changes-requested` decision on the last allowed turn must include
`--summary <file>`. The summary is an immutable reviewer-written handoff for the
human: unresolved findings, material risks, points of agreement, and a recommended
next focus. The helper hashes it and enters `intervention-required`; neither agent
may claim or hand off again.

The human can resume with:

```text
npx aitm co-review continue --dir <path> \
  --additional-turns <positive-integer> \
  --approved-by <identity> \
  [--focus <file>]
```

Continuation adds to `maxReviewTurns`; it never resets or decrements
`reviewTurnsUsed`. `--approved-by` records declared local provenance and is not
cryptographic authorization. `--focus` is an optional immutable human direction
file: the helper verifies it is outside protocol state, hashes it, records it in the
event, and makes the next owner turn available. It supplements rather than replaces
the authoritative artifact.

## Commands and Transitions

All mutation failures are fail-closed: validate first, then acquire the mutex and
revalidate, and either commit one complete transition or leave both state files
unchanged.

### `init`

```text
npx aitm co-review init --dir <path> --artifact <repo-relative-path> \
  --owner <identity> --reviewer <identity> --max-turns <N> \
  [--import-review <file> --review-of <commit>]
```

Without an import, round 1 starts available to the owner, who commits or confirms
the artifact and hands it to the reviewer. With `--import-review`, the paired
`--review-of` commit must contain the exact artifact blob, the review is validated
and hashed as reviewer turn 1, and round 2 starts available to the owner. This
supports #1117's existing R1 without rewriting it.

Initialization resolves the repository root and worktree, requires a clean artifact
and index relationship, verifies distinct owner/reviewer identities, positive
budget, ignored runtime directory, artifact containment, import immutability, and
Git commit reachability from the current branch. An exact retry is idempotent;
different configuration refuses without overwrite.

### `status`

```text
npx aitm co-review status --dir <path> [--json]
```

Reports lifecycle status, current role and actor, round, claim, artifact and commit,
last handoff, review turns used/max/remaining, refocus provenance, integrity drift,
and a copyable next command. It is read-only and uses a distinct nonzero integrity
result when recorded artifacts have drifted.

### `claim`

```text
npx aitm co-review claim --dir <path> --actor <identity>
```

Succeeds only for the identity mapped to the available current role. An exact retry
by the recorded claimant is idempotent and emits no duplicate event. Wrong actor,
already-claimed-by-other, accepted, intervention-required, and integrity-drift
claims refuse without mutation.

### `wait`

```text
npx aitm co-review wait --dir <path> --actor <identity> [--timeout <seconds>]
```

Returns immediately when that actor may claim. Otherwise it polls for no longer
than the bounded timeout (default 55 seconds, maximum 60), prints current status and
next action, and exits with a documented timeout code. A timeout is not a protocol
failure and never mutates state.

### Owner `handoff`

```text
npx aitm co-review handoff --dir <path> --actor <owner-identity> \
  --response <immutable-file> --artifact <same-authoritative-path> \
  --commit <exact-sha> [--answers <preceding-review>] \
  --message <text>
```

The helper accepts the owner handoff only when:

- the owner holds the claimed turn;
- the response exists inside the runtime directory and uses the expected round;
- `--answers` is present after a review and exactly matches its recorded path/hash;
- the response addresses every preceding finding ID using one disposition:
  `accepted`, `accepted-with-modification`, `rejected`, or `deferred`;
- rejected dispositions cite repository evidence, and deferred dispositions name a
  follow-up issue and retained safe boundary;
- the exact commit resolves from the current branch and contains the artifact path;
- the worktree artifact, Git index, and committed artifact blob are identical;
- the artifact path remains the configured authoritative path; and
- every recorded dependency can be hashed without drift.

The handoff records the response, answered-review, artifact blob, exact commit, and
message, then makes the reviewer turn available. The owner stops editing after a
successful handoff.

### Reviewer `handoff`

```text
npx aitm co-review handoff --dir <path> --actor <reviewer-identity> \
  --review <immutable-file> --review-of <exact-owner-commit> \
  --decision <accepted|changes-requested> \
  [--summary <immutable-file>] --message <text>
```

The helper accepts the reviewer handoff only when:

- the reviewer holds the claimed turn;
- the review exists inside the runtime directory, has the expected round, and can
  be hashed;
- every actionable finding has a stable, unique finding ID;
- `--review-of` equals the preceding owner commit;
- the authoritative artifact, Git index, and branch remain unchanged from the
  owner handoff;
- the decision is explicit; and
- on the last allowed `changes-requested` turn, the required summary exists, is
  distinct from the review and state files, and can be hashed.

An accepted review records terminal `accepted`, even on the last allowed turn. A
changes-requested review returns an available owner turn when budget remains or
enters `intervention-required` with the summary when it does not.

### `continue`

Only `intervention-required` may continue. The command rejects zero/negative turns,
missing approval identity, mutable or state-overlapping focus paths, accepted
protocols, and active protocols. Success appends a continuation event, increases
the maximum, preserves used turns, records approval/refocus hashes, and makes the
owner available.

## Round Artifact Contract

Round files are caller-written Markdown stored under the runtime directory. The
configured roles may choose descriptive filenames, but each path becomes immutable
when its handoff succeeds and cannot equal a state, lock, artifact, or another round
path.

A reviewer assigns stable finding IDs using `[finding:<ID>]`. The owner response
must contain one matching marker for every finding plus exactly one
`[disposition:<value>]`. Human-readable prose follows the marker. Findings omitted
from a response, duplicate dispositions, unknown dispositions, or invented response
IDs refuse the owner handoff. A no-findings accepted review is valid.

Hash validation occurs on every dependent transition and in `status`. Editing,
replacing, renaming, or deleting a handed-off artifact causes integrity drift and
blocks mutation until the human repairs or restarts the protocol.

## Mutex and Atomicity

Every mutating command acquires `.co-review-lock/` using atomic directory creation.
The lock records actor, command, process, host, and timestamp. While holding it the
helper rereads and validates state, prepares the next event and state, appends the
event, writes state to a sibling temporary file, atomically renames it, rereads the
result, and releases the mutex.

The helper never steals a lock. A surviving lock is reported with recovery context
and escalated to the human. Read-only help, status, and wait never acquire it; status
and wait tolerate a transient atomic replacement by bounded retry.

## Recovery-Grade Help Contract

Help must remain safe and useful before initialization, from any protocol state,
and after an agent loses all conversation context. These equivalent forms are
supported:

```text
npx aitm co-review help
npx aitm co-review --help
npx aitm co-review help <command>
npx aitm co-review <command> --help
```

Top-level help explains:

- **what** the tool coordinates and does not coordinate;
- **why** immutable two-artifact review and explicit decisions are required;
- **who** may act as owner, reviewer, and human continuation authority;
- **when** to initialize, claim, wait, hand off, continue, or stop;
- **where** the committed artifact and ignored runtime files live;
- **how** turns, claims, decisions, budgets, imports, summaries, refocus, hashes,
  mutexes, and Git validation work;
- the complete lifecycle, command list, option glossary, artifact marker formats,
  exit-code table, copyable end-to-end examples (fresh and imported R1), common
  refusal causes, recovery guidance, and a context-reset checklist.

Per-command help repeats enough context to operate safely without first reading
top-level help. It includes purpose, authorized caller, prerequisites, exact syntax,
required and optional flags, mutations/non-mutations, validations, output, exit
codes, state transition, idempotency, examples, failure recovery, and next commands.

Help parsing happens before repository discovery, configuration loading, runtime
directory access, lock acquisition, network access, or any write. Tests snapshot
the required sections and prove help leaves the filesystem and Git state unchanged.
Parse and runtime errors name the failed invariant, state what was not changed, and
print the most relevant next command or help invocation.

## Failure Behavior

- Wrong role/identity, unclaimed turn, wrong round, malformed state, missing or
  changed artifact, unverifiable commit, dirty artifact/index, branch drift,
  incomplete finding coverage, invalid decision, exhausted budget, or missing
  summary: refuse without protocol mutation.
- Concurrent mutations: one owns the mutex; the other reports the lock and refuses.
- Wait timeout: return the documented timeout result with no state change.
- Stale mutex: report its metadata and require human inspection; never steal.
- Owner changes during reviewer turn: refuse reviewer handoff and escalate.
- Round artifact drift: report expected/actual path and hash, block mutation, and
  preserve evidence.
- Accepted protocols: all mutating commands remain terminally refused.

## Validation Strategy

Focused Node tests cover help before initialization and per-command completeness;
fresh and imported initialization; imported-turn accounting; role and claim
idempotency; concurrent serialization; owner Git/index/artifact checks; finding and
disposition coverage; explicit reviewer decisions; acceptance precedence; budget
exhaustion summary; continuation accumulation and refocus hashing; terminal refusal;
bounded wait; stale lock; immutable drift; atomic state/events; status next actions;
and model/issue/path independence.

An end-to-end temporary Git repository exercises two changes-requested rounds,
terminal acceptance, and the ordered event trail. A second scenario imports #1117
R1, confirms it consumes turn 1, exhausts the configured budget, records a summary,
continues with additional turns and refocus, then reaches acceptance.

## Alternatives Considered

### Bare sentinel files

Small and portable, but unable to validate artifacts, serialize claims, preserve
decisions, or enforce a human turn budget.

### Git commits, issue comments, or labels as the turn channel

Durable but too heavy for every exchange, network-dependent, and liable to mix
review negotiation with authoritative artifact or task history.

### Session-specific messaging or model adapters

Can wake agents but couples correctness to one host/model and loses recovery after
session replacement. Messaging can be layered above this filesystem protocol later.

### Atomic local protocol and committed standalone CLI

Selected: portable Node.js plus shared filesystem, reusable across models and
issues, strict enough to preserve review provenance, and discoverable through the
committed AITM command surface.

## Out of Scope

- Launching, waking, prompting, or messaging agent sessions.
- Network transport or hosted coordination state.
- Multiple simultaneous reviewers or ownership transfer.
- Cryptographic authentication of actor or human identities.
- Automatically editing the artifact, response, review, or summary.
- Resolving disagreements or deciding whether findings are substantively correct.
- Mutating Git history, GitHub, AITM issues, or the AITM authoritative ledger.
