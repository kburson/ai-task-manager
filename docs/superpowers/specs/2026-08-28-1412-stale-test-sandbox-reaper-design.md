# #1412 Stale Test Sandbox Reaper Design

## Status and scope

This document amends the approved #1412 design only for its unfinished AC4:

> Leaked `.tmp/.task-test-*` worktree registrations are reaped, and a test
> proves the reaper only targets that shape.

The existing prototype-copy implementation, current `/task test` sandbox path,
normal `finally` cleanup, verification receipts, lifecycle transitions, and
production locking semantics remain unchanged.

## Problem

`/task test` creates a detached Git worktree under the invoking project's
`.tmp/` directory. Normal success and failure paths remove it in `finally`, but
an abrupt process exit can bypass that cleanup. The registration then remains
in the repository's shared Git worktree metadata, increasing the cost of every
later `git worktree list` call.

The current sandbox name embeds its owning process ID:

```text
.task-test-<issue>-<8-char-sha>-<pid>-<8-hex-random>
```

That PID is the narrowest available ownership/liveness signal. Age alone is not
safe because a legitimate verification can run for a long time.

## Decision

Add a lazy stale-sandbox reaper to the beginning of `/task test`, before the
new run creates its own worktree.

The reaper may select a registered worktree only when every condition below is
true:

1. Its absolute path is a direct child of the invoking project's exact `.tmp/`
   directory.
2. Its basename exactly matches the current tokenized sandbox grammar, with a
   positive issue number, eight lowercase hexadecimal SHA characters, a
   positive PID, and an eight-character lowercase hexadecimal random token.
3. The encoded PID is not alive according to the existing non-signalling
   `process.kill(pid, 0)` liveness rule.

If any condition is unknown or ambiguous, the entry is retained. In
particular, the reaper does not select:

- a live sandbox;
- an entry outside the exact project `.tmp/` directory;
- nested paths beneath `.tmp/`;
- legacy deterministic `.task-test-*` names without a PID and random token;
- malformed or partially matching names;
- ordinary linked worktrees; or
- directories that merely exist on disk but are not returned by Git's
  registered-worktree inventory.

PID reuse intentionally produces a safe false negative: an old registration
whose PID now belongs to another live process is retained for a later run. The
reaper must never compensate with an age-based override.

## Components

### Pure classifier

A focused library owns the path grammar and selection rule. It accepts the
project directory, registered worktree paths, and an injectable PID-liveness
function. It returns only paths proven stale; it performs no Git or filesystem
mutation.

Keeping the rule pure makes AC4 demonstrable without constructing real leaked
worktrees or risking the developer's live worktree inventory.

### Side-effect adapter

The same library exposes a small adapter that obtains Git's registered
worktree paths and removes each classifier-approved path through injected
dependencies. Production dependencies use `git worktree list --porcelain` and
the existing two-stage `defaultRemoveWorktree` behavior: unregister through Git,
then remove any residual directory.

Failures are best-effort per candidate. One stale or concurrently changed
entry must not prevent `/task test` from running, and the adapter must not widen
its predicate in response to a removal failure.

### `/task test` integration

`runVerbTest` invokes the reaper once after it has resolved the project and
issue but before it computes or creates the current run's sandbox. The current
process is alive, so its own future path cannot be selected; concurrently active
runs are retained by their live PIDs.

Normal `finally` cleanup remains the primary cleanup path. Lazy reaping is only
crash recovery on a subsequent invocation.

## Data flow

```text
/task test starts
  -> list registered Git worktrees
  -> extract worktree paths from porcelain output
  -> classify exact project-local tokenized test paths
  -> retain live or ambiguous entries
  -> remove only dead-PID matches
  -> create and run the current verification sandbox
  -> preserve existing finally cleanup
```

## Error handling and concurrency

- Inventory failure is non-fatal and yields no candidates.
- A liveness probe that cannot prove a PID dead retains the entry.
- Removal is idempotent and best-effort, matching existing sandbox cleanup.
- The reaper works from registered Git entries rather than a filesystem glob,
  so unrelated `.tmp` files are never deletion candidates.
- A peer can exit between classification and removal; that only turns an
  already-dead candidate into a still-valid removal.
- A PID that is alive at classification time is never removed, even if it exits
  immediately afterward; the next invocation may reap it.

## Verification design

The focused AC4 test uses injected inventory, liveness, and removal functions.
It proves:

1. an exact project-local tokenized entry with a dead PID is selected and
   removed;
2. the same entry with a live PID is retained;
3. legacy, malformed, uppercase-token, zero-PID, nested, sibling-directory, and
   outside-project lookalikes are retained;
4. ordinary worktrees and unregistered filesystem paths are untouched;
5. multiple stale matches are independently attempted when one removal fails;
6. inventory failure is non-fatal and performs no removal; and
7. `/task test` invokes recovery before creating the current sandbox.

The issue's stale second verification command will be replaced with the exact
new focused test path. Existing focused close-repair verification and the full
unit, slow, lint, and format lanes remain required.

## Alternatives rejected

### Manual maintenance command

An operator-only command can clean known leaks but does not stop registrations
from accumulating after later crashes. It does not satisfy the recovery half of
AC4.

### Age-based or broad shape cleanup

An age threshold can remove a legitimate long-running verification, and a broad
`.task-test-*` match cannot establish ownership for legacy names. Both violate
the fail-safe concurrency boundary.

### Signal handlers as the only fix

Signal handlers cannot cover hard kills, host crashes, or runtime termination
that bypasses JavaScript cleanup. Existing `finally` cleanup plus next-run lazy
recovery covers more failure modes without adding process-global handlers.

## Non-goals

- Reaping legacy sandbox names that lack a trustworthy owner PID.
- Cleaning arbitrary filesystem residue that is not registered with Git.
- Memoizing or changing `git worktree list` behavior.
- Changing Test-stage state transitions, timing, evidence, or verification
  command policy.
- General Git mocking or network-fetch removal.
