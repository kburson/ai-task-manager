# Polish Master Plan — Dueling Code-Review Synthesis

Date: 2026-06-26
Reviewer 2: Claude (Opus 4.8), validating the Codex / ChatGPT 5.5 package in `docs/code-review/`.

This document validates the external review against the live repository, corrects what it
over- or under-stated, adds findings it missed, and converts the confirmed weaknesses into a
sequenced suite of refactor user stories. **Stories here are drafts** — file them through the
sanctioned wrapper (`scripts/gh/create-issue.mjs`), never `gh issue create` directly.

---

## 1. Validation Table

Every claim below was checked against the current tree (commit `16fad67`), not taken on trust.

| #   | External finding                     | Classification                     | Evidence (verified)                                                                                                                                                                                               | Correction / nuance                                                                                                                                                                                                         |
| --- | ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No normal CI workflow                | **Confirmed**                      | `.github/workflows/` holds only `label-beta-report.yml`, `label-discuss.yml`                                                                                                                                      | Accurate. Keep as a top-priority item.                                                                                                                                                                                      |
| 2   | npm package surface too broad        | **Confirmed — understated**        | `npm pack` = 797 entries; **436 of them are test files** (55% of the package), 21 archive files                                                                                                                   | A `files` allowlist _already exists_ but is too permissive (`scripts/`, `docs/archive/` wholesale). Fix is "tighten existing allowlist + guard test," not "add one." Cheap, high-leverage.                                  |
| 3   | `move-state.mjs` violates SRP        | **Confirmed — priority wrong**     | 959 lines; owns policy, validation, guards, mutation, timing, markers, cache, unpark                                                                                                                              | True, but it is the **central safety boundary** with deeply coupled tests (guard-parity, audit-lane e2e). Splitting is high-risk/high-effort. Demote to a **late** story gated behind characterization tests. See §3.       |
| 4   | Verb discovery brittle (regex)       | **Confirmed — softened**           | `bin/aitm-registry.mjs:38` `parseVerbs()` reads `task-tracker.mjs` and parses `case 'foo':`                                                                                                                       | Real, but an _intentional_ single-source-of-truth design (per its own header comment), and it works. Manifest is an improvement, not a fire. Medium-Low.                                                                    |
| 5   | Guard architecture has stale residue | **Confirmed — UPGRADED**           | `guard-registry.mjs` header says "Skeleton-only. No callers yet." — but it is wired into `move-state.mjs`, `promote.mjs`, `close.mjs`, `review.mjs`, `guard-bootstrap.mjs`; `runGuards` fires on every transition | The comment is not merely stale, it is **actively false**. In an AI-facing repo this is dangerous: an agent reading it concludes the guard system is unimplemented and may bypass it. Promote to **high-value/low-effort**. |
| 6   | Shared AI rules duplicated           | **Partially confirmed — softened** | `skill/adapters/codex/SKILL.md` restates the issue-create rule and Checkpoint-Pause rule that also live in `skill/shared/rules/*.md`                                                                              | It restates _with pointers_ ("see full rule in…"), deliberate adapter autonomy, not blind copy. Drift risk is real but lower than implied. Medium.                                                                          |
| 7   | Runtime context too broad            | **Confirmed**                      | `runtime.mjs` `buildContext()` attaches ~20+ members (`safePostTiming`, `flushActiveToGH`, `drainQueueIfAny`, `cfg`, `role`, `pexec`, …) handed to every verb                                                     | Accurate ISP weakness. High-effort/low-urgency.                                                                                                                                                                             |
| 8   | Fail-open paths need central policy  | **Confirmed — enriched**           | 30+ empty `catch {}` swallows (`hook-handler.mjs`, `fleet-registry.mjs`, `word-counter.mjs`, `heal-backlog.mjs`); 14 best-effort catches in task-tracker                                                          | The review gestured at this abstractly; the concrete instances above should anchor the policy work. Medium.                                                                                                                 |
| 9   | Compatibility-retirement ledger      | **Confirmed**                      | Finding #5's false comment is exhibit A                                                                                                                                                                           | Cheap doc + process. Low-Medium.                                                                                                                                                                                            |
| 10  | Architecture overview doc            | **Confirmed**                      | No single runtime-contract map exists; architecture is spread across prose/templates/scripts                                                                                                                      | High onboarding value, low effort.                                                                                                                                                                                          |

**Overall:** the external review is honest and largely correct. It made **zero false positives**.
Its weaknesses are (a) one inverted priority (#3), (b) two understatements (#2 magnitude, #5 severity),
and (c) a whole missing dimension — see §2.

---

## 2. Findings the External Review Missed

The Codex pass was **100% architecture/maintainability** and explicitly did not test correctness,
concurrency, or security. That is the single biggest gap.

| ID  | Finding                                                                                                  | Evidence                                                                                            | Why it matters                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **No correctness / concurrency / security pass was attempted**                                           | Review scope statement; only the _fast_ test lane was run (`npm test`), never `test:slow`/`quality` | A maintainability review that finds no bugs hasn't looked for them. A real concurrency bug class already exists in this repo (concurrent `/task test` runs delete each other's fixed-path worktrees and post false-red tables). Architecture polish must not crowd out a functional pass. |
| N2  | **`init-project-config.sh` (1631 lines) is the largest file in the repo** — bigger than `move-state.mjs` | `wc -l`                                                                                             | The review fixated on `move-state.mjs` (959) and never named the 1631-line bash script. A monolithic, node-test-fleet-invisible shell installer is arguably the _worse_ maintainability hazard.                                                                                           |
| N3  | **Empty `catch {}` swallows are concrete, not hypothetical**                                             | 30+ sites incl. `hook-handler.mjs:156,172`, `fleet-registry.mjs:35,38,48,63`                        | Turns abstract finding #8 into an actionable audit list.                                                                                                                                                                                                                                  |
| N4  | **"All tests pass" is unverified for the slow/quality lanes**                                            | evidence.md admits `test:slow`, `lint`, `quality` were not run                                      | Any refactor plan needs a green full-suite baseline first, or the safety net is assumed, not proven.                                                                                                                                                                                      |

---

## 3. Corrected Priority Model

The external backlog ranks the `move-state.mjs` split as **High**. That is the most dangerous
recommendation in the package: it is the highest-risk, highest-effort change, and its existing
tests are coupled to current structure (they give _false_ refactor confidence). Re-ranked:

- **Do first (cheap, high-leverage, near-zero risk):** CI, package boundary, guard-comment fix, architecture doc, retirement ledger.
- **Do next (structural, moderate risk, needs tests first):** fail-open policy, command manifest, adapter de-dup, **characterization tests for the orchestrators**.
- **Do last (large refactors, gated behind characterization tests):** split `move-state.mjs`, decompose `init-project-config.sh`, narrow the runtime ctx.
- **Run in parallel, independent track:** the functional/correctness/concurrency pass (N1).

---

## 4. Refactor Story Suite

Sequenced into waves. Each story is sized S/M/L and carries acceptance criteria ready to refine.

### Wave 1 — Foundations (cheap, safe, unblockers)

**US-1 · Add CI for quality gates** · S · (= external #1)

- GitHub Actions workflow on PR + push to trunk.
- Runs `npm run format:check`, `npm run lint`, `npm test` (fast lane).
- `npm run test:slow` runs nightly or on a `ci-slow` label, with documented rationale.
- Establishes the green baseline that every later wave depends on (resolves N4).

**US-2 · Tighten the npm package boundary** · S · (= external #2, corrected)

- Narrow the existing `files` allowlist (and/or add `.npmignore`) so `scripts/**/tests/**`, `docs/archive/**`, and maintenance/report scripts are excluded.
- Add a package-content guard test: fails if entry count exceeds a ceiling or an unexpected path appears.
- Target: drop the 436 packed test files to ~0. Verify with `npm pack --dry-run --json`.

**US-3 · Fix the false guard-registry comment + author the guard-architecture doc** · S · (= external #5, upgraded)

- Replace "Skeleton-only. No callers yet." with the real wiring (`guard-bootstrap` → `runGuards` at every transition).
- One authoritative doc: registry → bootstrap → adapters → `runGuards` call site in `move-state.mjs`, with the exit/entry slot model.
- Grep proves no other source comment still claims the guard system is unimplemented.

**US-4 · Architecture / runtime-contract overview** · S · (= external #10)

- One short doc mapping Tier-0/1/2 skill loading, `npx aitm` dispatch, state machine, guard registry, issue-body mutator.
- Explicitly labels which paths are **runtime contract** vs **dev/test/support** (feeds US-2).

**US-5 · Compatibility-retirement ledger** · S · (= external #9)

- A ledger file listing deprecated markers, shims, legacy aliases: each with rationale, owner, removal condition, review date.
- Seed it with the guard "skeleton" residue and any deprecated body markers.

### Wave 2 — Structure & safety (needs Wave 1 green baseline)

**US-6 · Fail-open / fail-closed policy matrix + empty-catch audit** · M · (= external #8 + N3)

- Policy doc classifying every gate/telemetry/cache/timing/mutation/recovery path as fail-closed or best-effort.
- Audit the 30+ empty `catch {}` sites (list in N3); each either justified-as-best-effort in-comment or converted to surface the error.
- Tests for ≥3 critical fail-closed gates (state mutation, marker loss, close-precondition).

**US-7 · Command manifest replacing regex verb discovery** · M · (= external #4, softened)

- Explicit manifest: verbs, aliases, descriptions, policy, dispatch target.
- `aitm-registry.mjs` consumes the manifest instead of parsing `case` labels; help + dispatch share one source.
- Tests cover the manifest-backed registry. (Lower urgency — schedule after US-6.)

**US-8 · De-duplicate shared rules across skill adapters** · M · (= external #6, softened)

- Adapter `SKILL.md` files keep platform bootstrap only; shared policy (issue-create, checkpoint, state movement, review) lives once in Tier-2 rule files, referenced not restated.
- A reviewer can name the single authoritative file for each rule.

**US-9 · Characterization-test harness for the orchestrators** · M · **(precondition for Wave 3)**

- Golden/characterization tests that pin the _observed external behavior_ of `move-state.mjs`, `close.mjs`, `promote.mjs` (transition outcomes, markers stamped, guard refusals, timing rows) independent of internal structure.
- This is the safety net that makes the Wave 3 splits non-reckless. **Do not start US-10/11/12 until this is green.**

### Wave 3 — Large refactors (gated behind US-9)

**US-10 · Split `move-state.mjs` into focused modules** · L · (= external #3, re-sequenced)

- Extract: input/policy, transition-plan, guard-execution, GitHub mutation, audit/timing, cache/unpark.
- Public behavior of `/task promote|demote|reconcile` unchanged; US-9 characterization tests stay green.
- New focused unit tests for the extracted policy + transition-plan modules.

**US-11 · Decompose `init-project-config.sh` (1631 lines)** · L · (= N2, net-new)

- Extract config-init logic into node modules under `scripts/task-tracker/` reachable by the test fleet (mirrors the existing `config-init` verb path).
- Bash entry shrinks to a thin shim; new logic is unit-tested.

**US-12 · Narrow the runtime context into capability objects** · L · (= external #7)

- Decompose `buildContext()` into `githubClient`, `stateRunner`, `timingRecorder`, `issueBodyMutator`, `projectConfig`.
- Migrate ≥1 large verb to a narrow dependency interface; prove it runs against a small fixture, not the full ctx.

### Independent Track — Correctness (parallel to all waves)

**US-13 · Functional correctness & concurrency pass** · M · (= N1, net-new — the dimension Codex skipped)

- Targeted audit for race conditions (start with the known concurrent-`/task test` fixed-worktree-path deletion race), fail-open gates that should be closed, and command-injection surface in the `gh`/shell call sites.
- File each confirmed defect as its own issue via the wrapper; annotate blockers per the BLOCKED protocol.
- Not blocked by, and does not block, the architecture waves.

---

## 5. Risk Summary — What to Fix First and Why

1. **US-1 + US-2 + US-3 + US-4** (all Wave 1, all S): maximum leverage per unit risk. CI + a tight package + truthful guard docs + an architecture map fix the review's top _real_ problems (no enforcement, noisy surface, misleading AI-facing comments) without touching a single orchestration path.
2. **US-9 before any Wave 3 work**: the external review's instinct to split `move-state.mjs` is right but premature. Build the characterization net first; otherwise the "tests pass" signal is structurally coupled and worthless as a refactor guard.
3. **US-13 deserves a slot regardless of the architecture work**: the most important thing this synthesis adds is that _nobody has looked for bugs yet_. A polish plan that only sands the architecture and never runs the slow/quality lanes or hunts the known race is incomplete.
