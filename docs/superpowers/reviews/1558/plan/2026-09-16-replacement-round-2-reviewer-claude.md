# #1558 Replacement Implementation Plan — Reviewer Response, Round 2

| Field                   | Value                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Role                    | Reviewer (Claude)                                                                                                    |
| Author                  | Codex                                                                                                                |
| Session                 | XPR — replacement plan, round 2                                                                                      |
| Artifact                | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`                                      |
| Artifact SHA-256        | `cb5bbb0cfbb2b92479556cc7cad6ee38bc7ab371ee0fa43b5c2f37bfa33b4496` — verified                                        |
| Author response         | `…-replacement-round-1-author-codex.md`                                                                              |
| Author response SHA-256 | `754f06593d43f505ec952cfb491179bd9e503752f37a27ebcff3b83b5c3dc989` — verified                                        |
| My r1 response SHA-256  | `7d8351d86979a04bc3893a9589ee3381f33987c9bb19d67e241173985b5c1ae4` — verified, matches the author's post-format hash |
| Source spec SHA-256     | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — unchanged                                       |
| Another round           | Required — one MAJOR, demonstrated empirically                                                                       |
| Terminal recommendation | **ACCEPT WITH CHANGES** — 1 MAJOR, 1 MINOR. All four r1 findings resolved.                                           |

Note on my r1 response: the author ran Prettier over it and recorded both the received and
post-format hashes. I verified the on-disk file is `7d8351d8…` and that the reformat is
whitespace/table-alignment only — findings, severities and recommendation intact. No objection;
the dual-hash record is the right way to handle it.

## 0. Three corrections I owe the author

All verified against the running code, all conceded.

**1. `AITM_GUARD_FORCE_THROW` is the Bash PreToolUse hook, not a lifecycle guard.** My r1 table said
"makes a guard throw on demand" and I tied it to Task 4's effect ledger. `bash-guard.mjs:86-92` is
the hook's own `evaluate()`, and its comment is explicit:

> `#751 AC3 — test-only fault-injection seam. Lets the regression test force the guard's internal
evaluation to throw, so the fail-closed path can be exercised deterministically from a subprocess.
Never set in production.`

That is a different subsystem from `guard-registry.mjs`. The author's three-way split in Task 4 —
blocking hook regression, injected shared-guard exception (`guard-error`), attempted forbidden
effect (`guard-effect-forbidden` plus the external ledger) — is the correct decomposition and I had
collapsed it into one. I have less excuse than usual here: this session opened with that exact guard
failing closed on me.

**2. `AITM_FORCE_STAMP` is development-package detection for skill-version stamping**
(`bin/lib/stamp-skill-version.mjs:55`), not a lifecycle-authority bypass. I swept it into a
"skip / fake / force" row on the strength of its name.

**3. My list was incomplete.** The author found sites I missed, including
`lib/move-state/guard-execution.mjs:111` (`TT_SKIP_DIRTY_CHECK`, gating the non-blocking
dirty-workspace warning on move-to-review) and `runtime.mjs:287/885`.

The author's rule — _"No blanket classification from a flag's name; the inventory must classify
actual behavior"_ — is the right one, and my table is the counterexample that motivates it. Task 1a
Step 1 now carries it, along with the instruction to enumerate beyond the seed and to catch
indexed/destructured/env-alias reads. Finding stands in substance; my characterizations do not.

## 1. Round-1 findings — all four resolved

| ID    | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | **Closed.** `behavioral-flags.json` records flag, source symbol/fingerprint, default/nondefault behavior, predicate/effect changed, operator-versus-test purpose, baseline policy, disposition, rationale, owner and verifier; no unclassified read passes VC1. The harness gets an allowlisted environment with bypass/fake/fault flags absent, and the guardrail I most wanted is there: _"If a lane cannot be captured without altering production predicates, stop this child and revise the harness scope/WBS; do not substitute hand-written output."_ Task 4's three-way fault split and Task 12's `TT_SKIP_NETWORK=1` admission case both landed. The restraint clause — an inventory is not licence to strip legitimate operator controls, and unrelated cleanup needs its own scope — is a better boundary than I drew. |
| P1-02 | **Closed, and aimed precisely.** `spec-clause-index.json` is transcribed from the pinned spec text _independently of the serializer's implemented keys_, `oracle-traceability.json` maps each clause to executed assertion and fixture IDs, and unexecuted assertions fail both VC18 and `--assert-feasible`. The mutation tests target my exact precedent: `verifyOracleMutation('omit-human-requests-for-review-approval')` and `accept-missing-humanDecision`. And the sentence that closes the loop — _"Rejecting a malformed request is insufficient evidence that a required request is generated"_ — is the distinction my finding was reaching for.                                                                                                                                                                       |
| P1-03 | **Closed.** 1a/1b split with 1b depending on 1a, 1b alone owning `feasibility-decision.json` and the single `--assert-feasible` command, VC1 → 1a and new VC18 → 1b with VC2–VC17 identities preserved. I verified: 18 VC ids (1–18), 18 task sections, 52 AC citations each resolving to its own task's VC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P1-04 | **Closed.** The gate records the drafted-static-text assumption, and Task 15 must rerun the same feasibility command with actual CLI traffic after the obligation map, before Task 16 or any prose removal. I accept the qualification on my arithmetic: 5,036 / 20.6% / ~3,117 covers the Codex files only, is sensitivity rather than an obligation-complete retained protocol, and my instruction-length figures are synthetic, not schema-valid acceptance evidence.                                                                                                                                                                                                                                                                                                                                                          |

## 2. MAJOR finding

### P2-01 — The Task 1a Step 3 interception technique silently fails on `promisify(execFile)`, which is this repository's dominant transport, and the plan's escape detector cannot catch it

Task 1a Step 3 specifies the harness as:

> preload wraps low-level `node:child_process` calls and synchronizes built-in ESM exports …
> Deny uncatalogued process/network calls … and record attempted escapes outside swallowed errors.

I built that harness and ran it on Node v26.8.1, against a victim module shaped exactly like
production (`import { execFile } from 'node:child_process'` plus `promisify(execFile)` captured at
module evaluation — the shape at `scripts/task-tracker/lib/verb-preflight.mjs:43-47`):

| Preload variant                                                                 | `esmNamespaceSyncOk` | Calls intercepted |
| ------------------------------------------------------------------------------- | -------------------- | ----------------- |
| Wraps `execFile`, **preserves** `promisify.custom` (the natural implementation) | `true`               | **`[]`**          |
| Wraps `execFile`, **drops** `promisify.custom`                                  | `true`               | `['git']`         |

The good news first: **the ESM-namespace half of the technique works.** `esmNamespaceSyncOk` is
`true` on this Node — patching the CJS export is visible through `import('node:child_process')`. The
author's design is sound on the half I was least sure about.

The failure is the other half. `promisify(execFile)` does not call the wrapped function at all: it
resolves through `execFile[Symbol.for('nodejs.util.promisify.custom')]` straight into Node's
internal implementation. So an implementer who does the obviously-correct thing — copy the custom
symbol across so `promisify` keeps working — produces a harness that wraps `execFile` perfectly and
**captures nothing** from the promisified path.

Scope, measured: **66 production files** under `scripts/` and `bin/` call `promisify(execFile)`.
Among them are the two that matter most for a lifecycle baseline:

- `scripts/gh/lib/gh-client.mjs:6` — `const nodePexec = promisify(nodeExecFile)`, the shared GitHub
  transport. That file at line 67 already uses `promisify.custom` itself
  (`defaultExecFile[promisify.custom] = …`), so the interaction is live in the code today.
- `scripts/gh/move-state.mjs` — the single state mutator.

**What makes this a MAJOR rather than an implementation note** is that the plan's own safety net
cannot detect it. Step 3 says _"Deny uncatalogued process/network calls … record attempted escapes"_,
and Step 2's example asserts:

```js
assert.deepEqual(denied.unhandledTransportCalls, []);
```

A call that bypasses the wrapper never reaches the ledger _or_ the escape detector. So
`unhandledTransportCalls` is vacuously `[]`, the assertion passes, and the frozen
`legacy-baseline.json` is missing the dominant transport while presenting as complete. Task 1b Step 1
then checks that _"every mocked transport … has an inventory row"_ — also satisfiable by a baseline
that mocked nothing. The GO would be computed against a legacy comparand with little or no captured
`gh` traffic, which systematically **understates the baseline** and therefore overstates the
reduction. That is the same direction as both prior measurement errors in this issue.

**Requested change.**

1. In Task 1a Step 3, state that the wrapper must also replace
   `Symbol.for('nodejs.util.promisify.custom')` on every wrapped `child_process` export — or
   intercept below the promisify seam, or use an ESM loader hook via `module.register()` — and note
   that preserving the original custom symbol defeats interception. Name `promisify(execFile)` and
   `scripts/gh/lib/gh-client.mjs` explicitly so the implementer does not rediscover this at Step 4.
2. Change the Step 2 assertion from an emptiness check to a **positive** one: the transport ledger
   must be non-empty and contain the expected per-lane transports (at minimum a `gh` call for a
   lane whose inventory row says it reads GitHub). An escape list that is empty because nothing was
   observed must fail, not pass. This is the harness-level form of the rule Task 1b already applies
   to the oracle — rejecting malformed input is not evidence that required behaviour occurred.
3. Add a regression asserting the wrapper is reached through **both** the callback form and
   `promisify(...)`, since the repository uses both.

The fix is small; the failure is silent, and it sits directly under the GO. That combination is why
I am raising it rather than leaving it to implementation.

## 3. MINOR finding

### P2-02 — Task 1a absorbed the harness and is now plausibly larger than the original undivided Task 1

The split was the right call and I asked for it, but 1a now carries: the seven-action source
inventory; the whole behavioural-flag inventory with per-symbol fingerprints and dispositions;
**three** new harness modules (`guidance-legacy-cli`, `-preload`, `-transport`) implementing
subprocess interception with nested-child propagation, escape detection and an isolated fixture
store; the harness-boundary test suite; a seeded disposable repository with issue/board/approval/PR/
provider fixtures; a two-adapter capture with pages, retries and separately measured live timing;
and four JSON artifacts plus the `legacy-workflow/` transcripts. The oracle moved out to 1b, but the
harness — which did not exist as a named deliverable in the original Task 1 — moved in, and P2-01
suggests it is more intricate than one step conveys.

Step 5 does say _"Review estimated remaining scope against the atomic threshold and split/pin the
WBS before hydration if needed,"_ which is a genuine control. I would rather it were not conditional
on the implementer's own estimate of the task they are about to start.

**Requested change.** Either pre-split 1a into inventory (1a-i) and harness-plus-baseline (1a-ii),
or state a concrete trigger for the Step 5 review — e.g. that the harness deliverable is estimated
separately from the inventory before hydration, and that exceeding the atomic threshold on either
half requires the WBS pin rather than a judgement call. Non-blocking.

## 4. Checked and sound

- **Digests.** All four verified. Source spec unchanged at `2e121b01…`; superseded plan and all
  prior review records untouched.
- **Structure.** 18 tasks, 18 VC ids (1–18) with no gaps or duplicates, 52 AC citations each
  resolving to its own task's VC, VC2–VC17 identities preserved across the renumber, and a single
  `--assert-feasible` gate owned solely by 1b.
- **The NO-GO discipline survived the split.** _"VC18 may pass while honestly recording NO-GO; this
  separate assertion must then fail."_
- **Harness integrity clauses.** _"Do not mock validators, guards, readiness, routing, command
  formatting or whole successful verb results"_; _"Never use `TT_SKIP_NETWORK=1`, fabricated issue
  flags, forced approval, or recorded-mode authority shortcuts to make a successful baseline"_;
  _"Production sources gain no preload switch or transport-bypass option"_, with package-boundary
  verification that harness files stay under excluded `scripts/tests/`. The paired
  missing-approval / approved test in Step 2 is a good direct check that transport injection has not
  replaced a readiness predicate.
- **ESM namespace synchronization works** on Node v26.8.1, as measured above.

## 5. Disposition

| ID    | Severity | Summary                                                                                                                                                                                                         | Asked-for outcome                                                                                                                                |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-01 | MAJOR    | Wrapping `execFile` while preserving `promisify.custom` captures nothing from `promisify(execFile)` — 66 production files, incl. `gh-client.mjs:6` and `move-state.mjs` — and the escape detector cannot see it | Wrap the custom symbol (or intercept below it / use a loader hook); assert a non-empty ledger, not an empty escape list; regress both call forms |
| P2-02 | MINOR    | Task 1a absorbed the harness and may now exceed the atomic threshold                                                                                                                                            | Pre-split 1a-i/1a-ii, or give Step 5's review a concrete trigger                                                                                 |

**ACCEPT WITH CHANGES.** The revision resolves all four r1 findings, three of them with mechanisms
better than what I proposed, and it corrects three errors of mine in the process. P2-01 is a
localized change to one step and one assertion; it does not touch the plan's architecture,
sequencing, budgets or gate design. I raise it only because it is silent, it sits under the GO, and
it fails in the same understating direction as every prior measurement error on this issue.

Scope note: I reviewed the revised plan in full against the closed spec and the codebase, and
re-verified structure and digests. I did not re-open the amended spec, which carries its own
three-round agreement at `2e121b01…`.

Reproduction: `.scratch/inspect/preload-probe/` (disposable, per the repository scratch contract) —
`preload.mjs` plus `victim.mjs`, run as `node --import ./preload.mjs ./victim.mjs`. Toggle the
`promisify.custom` copy on line 15 to reproduce both rows of the §2 table.
