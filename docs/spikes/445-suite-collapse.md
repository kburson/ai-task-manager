# Spike #445 — Collapsing duplicate test-suite verifier runs into one

**Status:** complete (2026-06-16)
**Type:** investigation spike
**Trigger:** Driving #444 to Done, stamping five Acceptance Criteria plus the
`tests` Functional DoD item drove **six** full runs of `npm run test:all` (292
test files), each taking minutes — because every one of those checkboxes
declares the same suite command and each stamp executes it independently with no
de-duplication or result reuse.
**Follow-up implementation issue:** #446.

## Summary

Evidence stamping has no layer that recognizes "this exact command already ran
green at this exact tree state." Each `ac-stamp` / `dod-stamp` invocation runs
its declared verifier(s) from scratch, and the `test` verb runs the whole
`## Verification Commands` set again in its sandbox. When K checkboxes all
declare `npm run test:all`, the suite runs K times. This spike traces the
execution paths, confirms there is no cache anywhere on the path, evaluates three
de-duplication strategies, fixes the recommended one (a content-addressed result
cache keyed on `(command, HEAD sha, clean-tree)`), defines which commands are
eligible for collapsing, and files #446 to implement it. No production behavior
change lands in this spike.

<!-- AC1-anchor: per-checkbox-execution -->

## AC1 — How identical suite commands are executed once per checkbox today

Verifier execution is centralized in one primitive,
`scripts/task-tracker/lib/evidence-runner.mjs` → `runVerifiers({ commands, pexec, cwd, timeout, maxBuffer })`:

- It iterates `commands` **sequentially**, `splitCmd`-parses each string into
  argv, runs it via `pexec` (`TEST_RUNNER_TIMEOUT_MS` timeout, 64 MiB
  `maxBuffer`), and stops at the first non-zero exit (`firstFailure`).
- It has **no cache** — not across process invocations, and not even within a
  single `commands` array. A command repeated in the list runs twice.

Three consumers sit on top of that primitive:

- **`verbs/ac-stamp.mjs`** — for one AC label, reads that AC line's declared
  `aitm-verified cmd="…"` commands (`target.evidenceCommands`), calls
  `runVerifiers` once, refuses on failure, then writes
  `aitm-ac-evidence:KEY cmd=… exit=0 sha=<HEAD> ts=<ISO>`.
  **One AC = one `runVerifiers` call = one full suite run.**
- **`verbs/dod-stamp.mjs`** — identical shape for a Functional DoD key
  (`tests` / `lint` / `commits`). One stamp = one run.
- **The `test` verb** — runs the full `## Verification Commands` list in its
  sandbox worktree as yet another independent execution.

None of these consult or populate a shared result store, so there is nothing
between them to notice that the same command already passed.

### The #444 six-run case

On #444 the body declared `npm run test:all` on five Acceptance Criteria and on
the `tests` DoD item. Driving the issue therefore issued six separate
`ac-stamp`/`dod-stamp` calls, each invoking `runVerifiers(['npm run test:all'])`
against an unchanged working tree at the same `HEAD`. Result: six full 292-file
suite runs to prove a fact a single green run already established.

<!-- AC2-anchor: dedup-strategies -->

## AC2 — De-duplication strategies evaluated

**Strategy A — Per-invocation run cache.** Memoize `(normalized command)` →
result inside a single CLI process. Cheap, no persistence, zero
cross-invocation correctness risk. But each AC/DoD stamp is its **own** CLI
process, so this only helps a batch verb that stamps many checkboxes in one
process — it does nothing for the actual #444 flow of six separate invocations.

**Strategy B — Batch `stamp-all` verb.** A new verb collects every distinct
declared command across all AC + DoD checkboxes, runs each **once**, then fans
the single result out to every matching marker. Largest win for the #444 shape
and conceptually clean. Cost: a new verb plus a fan-out writer, and it only
collapses within that one verb's run — separate `ac-stamp x` / `dod-stamp tests`
calls (still a supported path) keep re-running. It also changes the operator
workflow rather than transparently speeding the existing one.

**Strategy C — Content-addressed result cache (recommended).** Persist
`(normalized command, HEAD sha, clean-tree flag)` → `{ exit, ts }` to a small
on-disk store under `.ai-task-manager/`. Before running a verifier, look up that
key; on a hit with a verified-clean tree at the same `HEAD`, reuse the prior
green result instead of re-executing. Collapses **across** independent verb
invocations (exactly the #444 case) with no workflow change — every existing
`ac-stamp`/`dod-stamp`/`test` call transparently benefits. Highest correctness
burden (cache key must be airtight; see AC3), but it is the only option that
fixes the observed problem without forcing operators onto a new verb.

**Recommendation: Strategy C**, with Strategy A's in-process memo as a trivial
sub-case it subsumes. Strategy B is not pursued — it solves a narrower slice at
the cost of a parallel workflow.

<!-- AC3-anchor: genuine-evidence -->

## AC3 — Preserving genuine evidence

A cache that hands back a stale "pass" would forge proof, so the cache key is
the entire safety argument. The recommended design admits a cached result only
when **all** hold:

1. **Same command** — byte-identical after the same normalization the markers
   use (`splitCmd`-stable, whitespace-collapsed).
2. **Same `HEAD` sha** — the cached entry records the commit it ran against; a
   different `HEAD` is a miss.
3. **Clean tree** — the working tree must be verified clean (no unstaged or
   uncommitted changes) both when the entry was written and when it is reused.
   A dirty tree is always a miss and always re-runs.

A cache hit therefore certifies the same real execution the marker would have
recorded anyway: same command, same commit, same tree. The stamped marker keeps
its real `cmd` / `exit=0` / `sha=<HEAD>` / `ts`, where `ts` is the timestamp of
the **original** real run. The invariant is "run once, attribute the _same real
run_ to each marker," never "skip the run." Any doubt about tree state resolves
to a miss (re-run), never a hit.

<!-- AC4-anchor: eligibility-boundary -->

## AC4 — Eligibility boundary for collapsible commands

Collapsing earns its keep only for heavyweight, deterministic-at-a-given-tree
suite runs. The boundary:

**Eligible (cache + collapse):** automated test-suite commands whose cost is
high and whose result is a pure function of the tree —
`npm run test:all`, `npm test`, `npm run test:slow`, `npm run test:fast`.

**Not eligible (always run per marker):** fast or idempotent commands where the
run is cheaper than the cache bookkeeping and the per-marker record is the point
— `npm run lint`, `npm run format:check`, and `git log …`-style commit-trail
checks. `git log` in particular is near-instant and tied to commit state, so
caching it saves nothing and risks confusion.

The eligibility test is encoded as an allowlist of normalized suite commands
rather than a heuristic, so a new suite command must be opted in explicitly —
failing closed (run every time) is the safe default.

<!-- AC5-anchor: follow-up-issue -->

## AC5 — Follow-up implementation issue

Implementation is warranted: the #444 cost (six redundant multi-minute suite
runs) recurs on every multi-AC issue that shares a suite command, which is the
common case. Filed **#446** to implement Strategy C (content-addressed
`(command, HEAD sha, clean-tree)` result cache with the AC4 eligibility
allowlist and the AC3 genuine-evidence invariant), referencing this spike. No
production code changed in #445.
