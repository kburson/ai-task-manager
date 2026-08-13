# Fail-Open / Fail-Closed Policy

> The single reference for **how each kind of failure must behave** in this
> package. A swallowed error in a safety-critical path looks identical to a
> swallowed error in a telemetry path unless we say, up front, which is which.
> This document classifies every category of runtime path as **fail-closed**
> (a failure must abort the operation and surface) or **best-effort** (a failure
> may be tolerated silently, but only with an explicit justifying comment at the
> catch site). `#562`'s independent fail-open audit cites this matrix when
> deciding whether a given `catch` is an integrity bug or an acceptable swallow.

## The two postures

- **fail-closed** — the operation must not proceed or report success if this
  step fails. The error propagates (throw / non-zero exit / explicit refusal).
  Silently swallowing here is an integrity bug: it lets a state mutation, marker
  write, or precondition check no-op while the caller believes it succeeded.
- **best-effort** — the failure is non-fatal to the primary operation. The catch
  may swallow, but the catch body MUST carry an inline comment stating _why_ the
  swallow is deliberate (the audit test in
  `tests/unit/core/empty-catch-audit.test.mjs` fails on any empty catch lacking one).
  Silence is opt-in and reviewed, never the path of least resistance.

The literal token **fail-closed** is used as the greppable classification label
throughout this doc and the test suite so the policy can be machine-checked and
cannot silently drift.

## Classification matrix

| Category                         | Examples                                                                                        | Posture         | Rationale                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| State mutation                   | `scripts/gh/move-state.mjs` (the single Status mutator), verb→move-state delegation             | **fail-closed** | A board move that silently no-ops while reporting "moved" is the core integrity failure this guards.   |
| Marker preservation              | `mutateIssueBody` invariant-marker check (`findLostMarkers` → `MarkerLossError`)                | **fail-closed** | Dropping an invariant marker corrupts the audit trail; the write must abort, not persist the loss.     |
| Checkbox / AC proof              | `findCheckboxesTickedWithoutProof`, `findAcsWithoutVerifierOrInvalidTag`, fabricated-proof scan | **fail-closed** | A tick without evidence is an unverified claim; close/review preconditions must refuse it.             |
| Close / transition preconditions | child-still-open gate, DoD-verified gate, blocked-by-not-done guard, `runGuards` entry/exit     | **fail-closed** | These gates exist to stop premature progress; swallowing their failure defeats their entire purpose.   |
| GitHub / telemetry side effects  | audit-comment posts, timing-event rows, `postComment` after a decision is already made          | best-effort     | The core decision has already been made and persisted; a failed comment must not abort the operation.  |
| Cache / derived reads            | optional `JSON.parse` of cached project values, `readFileSync` of optional state                | best-effort     | A missing or corrupt cache falls back to a recomputed default; the read failing is not fatal.          |
| Cleanup                          | `unlinkSync(tmp)` in `finally`, `rmdirSync` lock release, `deregisterTask` fleet cleanup        | best-effort     | The primary work already completed; failing to tidy a temp file or lock dir must not fail the command. |
| Recovery / unpark                | dependent-unpark side effects, worktree-info probes (`git rev-parse`)                           | best-effort     | These enrich the result; their absence degrades gracefully rather than corrupting state.               |

## How best-effort catches are enforced

`no-empty` in `eslint.config.mjs` is configured with `allowEmptyCatch: true`, so
eslint does **not** flag empty catch blocks. The enforcement is therefore the
audit test, not the linter: `tests/unit/core/empty-catch-audit.test.mjs` walks the
runtime scope (`bin/`, `scripts/`, excluding tests/maintenance/migrate), finds
every `catch { … }` whose body is whitespace-only, and fails unless the body
carries a justifying comment. Every best-effort swallow in the tree now reads
`catch { /* best-effort: <reason> */ }`; a newly-introduced bare `catch {}` fails
the test until its author either justifies it or converts it to surface the error.

## How fail-closed paths are proven

`tests/unit/lib/fail-closed-gates.test.mjs` exercises three representative
fail-closed cases and asserts each aborts rather than swallows:

1. **State mutation** — `move-state.mjs` invoked outside the verb pipeline (no
   `AITM_VERB_CONTEXT`/`AITM_INTERNAL`, non-TTY) refuses with a non-zero exit
   instead of mutating the board.
2. **Marker loss** — `findLostMarkers` reports a dropped invariant marker, and
   `MarkerLossError` is the typed failure `mutateIssueBody` throws for it.
3. **Close precondition** — `findCheckboxesTickedWithoutProof` flags a
   `- [ ]` → `- [x]` transition that carries no execution-evidence marker.
