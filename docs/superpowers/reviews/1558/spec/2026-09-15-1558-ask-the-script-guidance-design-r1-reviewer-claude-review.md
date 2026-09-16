# Reviewer Response — Round 1

| Field            | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Source reviewed  | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Source SHA-256   | `317ed52e378f1276e45fa58de062d02b7b6aef44432b79d5dedf735be91a932a`        |
| Codebase HEAD    | `a650be5a090f28325e03f47a22b7495674cf5011`                                |
| Worktree         | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager`                   |
| Role             | Reviewer (Claude)                                                        |
| Author           | Codex                                                                    |
| Round            | 1                                                                        |
| Prior findings   | None — this is the first round                                           |
| Another round    | Required                                                                 |
| Recommendation   | Not acceptable yet — 3 Blocking findings                                 |

## Summary judgement

The architecture is sound and the separation of enforcement / navigation /
explanation is the right decomposition. The catalog placement, fail-closed
posture, no-merge rule, and split compiled cache are all well-argued and match
existing repository conventions.

The specification's weakness is not its design — it is that several of its
load-bearing claims about the current codebase are either untested against the
code or contradicted by it. Three of those are blocking because they invalidate
an acceptance criterion as written, not merely a detail.

I verified every finding below against the checkout at `a650be5a`. Line
references are to that commit.

---

## Blocking findings

### R1-B1 — `explain` and `execute` cannot share one authority for `test → review`, because `promote` mutates before it evaluates

Severity: **Blocking**. Sections: §5.3, §13.3, §13.4, AC1, AC14.

`scripts/task-tracker/verbs/promote.mjs:397-405` runs, *before* constructing
`guardCtx` and calling `runGuards`:

```js
if (recorded === 'test' && target === 'review') {
  const { scanBody } = await deriveAndRescan({ ... deriveAndStampFunctionalDod ... });
  body = scanBody;
}
```

`deriveAndStampFunctionalDod` writes the derived `acs` / `checkboxes` Functional
DoD keys onto the live issue body. The in-file comment at
`promote.mjs:388-396` states the reason explicitly: `testExitPreCloseCompletenessGuard`
scans `guardCtx.body` for unticked boxes but does not itself derive those two
keys, so without the stamp "a story whose every AC + non-self checkbox is
genuinely complete would still be refused here."

This is a precondition that the executing verb satisfies **by mutating**, and
then evaluates. The specification has no concept for it, and §13.4 forces a
contradiction:

- If `explain` runs the same guards without the derive, it returns `blocked` for
  a story `promote` would advance. That is exactly the divergence invariant 1
  and invariant 2 forbid — a known precondition omitted from explanation.
- If `explain` runs the derive, it stamps DoD evidence on a GitHub issue. That
  violates invariant 4 ("Explain never performs mutation, provider action, test
  execution, or approval stamping") and §17.2 ("Read-only explain and validation
  commands never write to GitHub").

`verbs/review.mjs` runs its own copy of the same derive, so this is not a
one-off in `promote`.

Required: the specification must define a third category alongside guards and
remediations — call it a *normalizing precondition* — and state, normatively,
how the evaluator represents it. The plausible dispositions are (a) `explain`
reports it as a blocker with a registered remediation whose action is the derive
itself, so the agent performs the stamp explicitly before promoting; or (b) the
derive is refactored into a pure projection over the fetched body, with the
stamp becoming a separate effect the verb applies after a `ready` verdict. I
recommend (b) because it preserves invariant 4 without adding an agent round
trip, but the choice is the author's. What the specification cannot do is leave
§13.4 asserting both invariants over a code path where they are incompatible.

This is also the direct answer to reviewer-focus item 1, and it should be
called out in Child A's scope, not discovered during implementation.

### R1-B2 — Guard refusals carry no stable code today; AC2 is a retrofit across every registered guard and is unsized

Severity: **Blocking**. Sections: §13.2, §14, AC2, §24 Child A.

The live guard contract, documented at
`scripts/task-tracker/lib/guard-registry.mjs:20-22` and implemented in
`consume()` at the same file, is:

```js
const entry = { id: g.id, reason: r.reason };
if (r.blockers) entry.blockers = r.blockers;
```

`reason` is free-form English — e.g.
`'plan approval is missing current-trunk provenance'` and
`` `current trunk is unreadable: ${error.message}` `` in
`lib/plan-approved-guard.mjs:59,72`. There is no `code` field anywhere in the
refusal shape.

§13.2 requires every blocker to carry `guardId` + stable `code` + a registered
`remediation.id`. The registry's own inventory table
(`guard-registry.mjs:53-73`) lists roughly thirty registered guards across eight
states, each with multiple distinct refusal sites. Adding a stable code and a
remediation binding to every one of them, plus the closed remediation registry
of §14, plus argument schemas, plus the Full-Auto / destructive / human-required
flags, is the dominant cost of this epic — and Child A describes it in one
sub-bullet ("add structured blocker/remediation output").

Required: §14 or §24 must state the migration contract for guards that have not
yet been coded. Specifically: is a refusal without a `code` a hard failure (the
whole guard set must migrate in one story), or does it map to a reserved code
such as `unclassified-refusal` with an explicit no-automatic-remediation
disposition under AC2? Either answer is defensible; silence is not, because it
determines whether Child A is one story or a sub-epic. I lean toward the
reserved-code path with a lint gate that forbids new unclassified refusals,
since a thirty-guard big-bang is exactly the kind of story this repository
splits.

While reviewing this I also confirmed that the guard IDs used in the
specification's worked examples — `plan-exit-plan-approved`,
`plan-exit-deep-dive`, `plan-exit-plan-metadata` — are the real exported
`GUARD_ID` constants. The inventory comment table inside `guard-registry.mjs`
is the stale artifact here (it says `plan-approved`), not the specification.
Flagging so the author does not use that table as the source when hydrating
catalog bindings; read the `GUARD_ID` exports.

### R1-B3 — The action-ID vocabulary is undefined and collides with an existing one

Severity: **Blocking**. Sections: §9.2, §11.2 stage 7, §13.2, §14, AC1.

The specification uses `workflow.promote` and `workflow.close` as action IDs and
requires the validator to check "action, guard, remediation, prohibition, and
documentation references" against the "installed vocabulary" (§11.2 stage 7),
and to name the "installed vocabulary" in its diagnostics (§19).

`scripts/task-tracker/lib/lifecycle-policy/actions.mjs` already defines
`ACTION_POLICIES` keyed `test`, `review`, `close`, `promote`, `refine`, with
`allowedStates` per action, and `executable-transitions.mjs` already exports
`forwardTarget(state)` — which is precisely the "recommend the next lifecycle
action" capability §15.1 attributes to the new generic command.

So there are two candidate namespaces and the specification names neither as
authoritative. This is not cosmetic: the validator cannot be implemented without
knowing which registry it resolves against, and §25's requirement that Child A
and #1561 "share one versioned verdict/remediation contract" is unenforceable
while the ID space is undefined.

Required: name the authoritative action registry module, state whether
`workflow.*` is a new prefixed namespace that maps onto `lifecycle-policy`
action IDs (and if so, where the mapping lives and who owns it) or whether the
existing bare IDs are adopted unchanged. Also state whether `forwardTarget` is
the implementation of the un-targeted `aitm explain #N` next-action
recommendation, or whether a second next-action derivation is being introduced.

---

## Major findings

### R1-M1 — The receipt mechanism is prompt adherence, presented as evidence

Severity: **Major**. Sections: §5.5, §15.2, §15.4, §3 goal 1, AC12.

§5.5 is titled "Context suppression requires live-context evidence" and asserts
AITM "suppresses content only when the caller presents a matching guidance
receipt from the current live context." §15.4 then says that after compaction
"the agent treats `aitm-guidance-loaded:*` receipts as absent."

A `--known` value is self-attestation. The CLI has no channel through which to
observe live context; it observes only a string the model chose to pass. A
compaction summary can carry the receipt line forward verbatim while the actual
instruction text is gone — the receipt is short, distinctive, and exactly the
kind of token a summarizer preserves. At that point the agent asserts presence
truthfully-from-its-own-view and receives `not-modified`, and the instruction is
never reloaded.

This matters because §3 goal 1 is "Make executable scripts, not prompt
adherence, the lifecycle authority." The receipt protocol is the one mechanism
in the design that depends entirely on prompt adherence, and §5.5 currently
claims the opposite.

The correct disposition is probably not a new mechanism — I do not believe the
CLI can verify live context, and I am not asking for a daemon. It is to state
the residual risk honestly and argue the fail-safe: a suppressed instruction
does not create a capability, so the worst case is an agent that proceeds
without the terse instruction, attempts an action, and is refused by the guard
that was authoritative all along. That argument is available and strong. Make
it, and retitle §5.5 so it does not claim evidence it does not have.

### R1-M2 — `node_modules/ai-task-manager/instructions/...` is not a resolvable package path

Severity: **Major**. Section: §8.1.

§8.1 states the published source as a literal path. That path does not resolve
in at least four situations that occur in this project's own workflow:

1. This repository's dev checkout. `lib/installed-guard-path.mjs:9-16` documents
   the rule at length: "This package's own dev checkout lives at
   `.../Vibe-Coding/ai-task-manager/scripts/...` with no `node_modules/`
   ancestor." Existing code deliberately handles the dual reality.
2. Agent worktrees. This review's own worktree has no `node_modules` directory
   at all; `ls node_modules` fails. Worktree fan-out is the repository's normal
   operating mode.
3. Global installs, pnpm's content-addressed store, and Yarn PnP, none of which
   produce a flat `node_modules/ai-task-manager/` at the project root.
4. `npx` execution from its cache.

Required: §8.1 should specify resolution relative to the running module
(`import.meta.url` walked to the package root), with `node_modules/...` given
only as the illustrative install-layout example it is. The compiled-cache
identity in §12.3 ("real path") already implies the resolver returns a real
path, so this is a wording and normativity fix, not a redesign.

### R1-M3 — Guard evaluation is a two-pass, network-dependent loop across two layers; §13.2's single snapshot does not model it

Severity: **Major**. Sections: §13.2, §13.3, §13.4.

`promote.mjs:420-437` shows the real shape:

```js
let guardResult = await runGuardsFn(recorded, target, guardCtx);
const policyRequirementIds = requirementIdsForGuardRefusals(guardResult.refusals);
if (policyRequirementIds.length > 0) {
  guardCtx.workflowPolicy = await loadBoundary({ ... });   // GitHub round trip
  guardResult = await runGuardsFn(recorded, target, guardCtx);
}
```

Guards run, their refusals select workflow-policy requirement IDs, a live
boundary is fetched, and guards run **again** against an enriched context. §13.2
returns one `snapshot` with one `observedAt`, which cannot honestly describe a
verdict assembled from two reads taken at different times.

Compounding this, the next lines filter to `REFUSAL_ID_TO_STATUS` and the
comment at `promote.mjs:380-387` states that refusals outside that map are
"intentionally ignored at verb level — they fall through to the subprocess
`move-state.mjs` call which runs the SAME runGuards." So two evaluation passes
already exist at two layers with two different refusal vocabularies, by design.

Required: §13.3 must say which layer the evaluator mirrors — the verb-level
filtered view or the `move-state.mjs` authoritative view — because they give
different answers today, and an `explain` that mirrors the verb-level filter
will report `ready` for issues `move-state` then refuses. §13.2 should also
allow the snapshot to record more than one observation time, or state that the
second pass replaces the snapshot wholesale.

### R1-M4 — "Extend `measure-context.mjs`" understates the work; it measures a different subject

Severity: **Major**. Sections: §20.2, §23.3.

`scripts/task-tracker/measure-context.mjs` sums the character counts of static
markdown files (`skill/SKILL.md`, the adapter, `skill/shared/router.md`, the
pickup directive, and named `skill/shared/rules/*.md` sets) and divides by four.
Its `SCENARIOS` map is literally a list of rule filenames.

Three of the six §20.2 acceptance targets — clean-path explanation size, blocked
explanation size, and "repeated identical guidance query adds no agent
instruction text" — are measurements of **CLI response payloads**, not of static
files. Post-compaction reload is a measurement of a *sequence* of responses.
None of these is expressible in the current scenario model.

Required: §23.3 should say that a second measurement subject is being added
(captured command responses) and either name a new harness or specify how
`measure-context.mjs` grows a response-capture mode. As written, an implementer
reading "extend with first-query, repeated-query, changed-entry, and
post-compaction scenarios" will open the file and find nothing to extend.

### R1-M5 — Two §20.2 budgets are already infeasible or at breach at HEAD

Severity: **Major**. Sections: §6, §20.2.

Measured at `a650be5a` in this worktree:

| Scenario                 | Codex  | Claude     |
| ------------------------ | -----: | ---------: |
| invoked                  |  3,537 |      3,746 |
| pickup directive alone   |  1,400 |      1,400 |
| bind                     |  8,102 |      8,311 |
| bind+review+close        | 13,282 | **13,491** |
| parallel-orchestration   | 11,278 |     11,487 |

Two consequences:

1. §20.2's first target is "invoked router plus pickup context at or below 5,000
   proxy tokens." Invoked + pickup is 4,937 for Codex and **5,146 for Claude**.
   The Claude adapter already exceeds the target before a single rule file
   loads. The budget is therefore not a ceiling to defend but a reduction that
   requires slimming `skill/shared/router.md` (2,113) or the pickup directive
   (1,400). Say so, or raise the number.
2. `bind+review+close` for Claude measures 13,491 against the existing budget of
   13,500 — **0.1% headroom**, against this repository's stated ≥20% headroom
   policy (`measure-context.mjs:37-39`). Child D inherits an already-breaching
   budget. This strengthens the case for the epic, but the specification should
   name it as current-state rather than let it surface as a CI failure.

### R1-M6 — `workflow-preflight` is an existing adjacent surface the specification does not dispose of

Severity: **Major**. Sections: §6, §15.1, §25.

`scripts/task-tracker/verbs/workflow-preflight.mjs` already ships a read-only,
issue-scoped, target-scoped, `--json` preflight built on
`lib/workflow-policy/snapshot.mjs` and `lib/workflow-policy/preflight.mjs`.

§6 correctly says it "is not, by itself, action readiness." It does not say what
happens to the command. §15.1 enumerates compatibility surfaces (`next`,
`review`, `close` with `--explain`) and omits `workflow-preflight` entirely.
After this epic an agent faces two adjacent read-only JSON commands with
overlapping arguments and no stated precedence.

Required: state whether `workflow-preflight` is absorbed into `explain`,
retained as a narrower human diagnostic, or aliased. §23.3's assertion that
"help, router, and Tier-2 pointers name only supported commands/paths" cannot be
written without this decision.

---

## Minor findings

### R1-m1 — §6 context figures are stale

The table reports 3,483 / 3,692 invoked, 7,791 / 8,000 bind, and 12,542 / 12,751
bind+review+close. Measured values at `a650be5a` are 3,537 / 3,746, 8,102 /
8,311, and 13,282 / 13,491. The drift is consistent (+54, +311, +740), so the
audit was real but taken at an earlier commit. Cite the audited SHA next to the
table so a future reader can reproduce it.

### R1-m2 — Shipping the catalog requires a `files` allowlist entry and a deliberate package-ceiling raise

`package.json` `files` has no `instructions/` entry, so the catalog would not be
packed. Separately,
`scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` enforces a hard
packed-entry ceiling with a documented history of deliberate, commented raises
(#910, #1166, #1635). §22 step 1 and §23.3 should name both actions explicitly;
otherwise the first implementation story fails a test whose failure message asks
whether the growth was intentional.

### R1-m3 — §12.3's "Git-index identity" is wrong for worktrees, and two stat fields are unreliable

In a linked worktree `.git` is a **file**, not a directory. Verified here: the
index is at
`/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git/worktrees/ai-task-manager6/index`,
reachable only via `git rev-parse --git-dir`. Given this repository's worktree
fan-out model, a naive `.git/index` stat is a guaranteed defect. Specify
`git rev-parse --git-dir`.

Two smaller notes on the same tuple: `ino` is unreliable on Windows filesystems,
and `ctimeNs` changes on `chmod` and on branch checkouts that rewrite the file's
metadata without changing content — producing spurious cold compiles. Both are
benign (a false miss only costs a recompile) but §12.3 currently presents the
tuple as precise, so the imprecision should be acknowledged.

### R1-m4 — js-yaml cannot satisfy §11.3's line/column requirement for schema errors, nor §11.2 stage 3's anchor detection

§11.3 mandates "one-based line and column" for diagnostics at paths such as
`entries[4].agent.instruction[2]` — a *schema* error, not a syntax error.
`js-yaml`'s `load()` returns plain JavaScript values with no position
information; positions exist only on the thrown `YAMLException` for syntax
failures. Equally, `load()` **resolves** anchors, aliases, and merge keys
silently, so §11.2 stage 3's requirement to reject them cannot be satisfied by
inspecting the parsed result.

Both requirements need either a CST/AST parser that retains ranges (the `yaml`
package is the obvious candidate) or a documented commitment to `js-yaml`'s
`listener` option with a proof that it yields stable per-node positions. §22
already anticipates the production-dependency promotion and says "An alternative
parser must meet the same duplicate-key, tag, anchor, source-location, and
deterministic-normalization requirements" — good, but it names `js-yaml` as the
presumptive choice, and `js-yaml` does not meet the source-location requirement
it sets. Reverse the presumption or prove it.

### R1-m5 — The §9.2 worked example cites a documentation anchor that does not exist

The example binds `documentation: - path: docs/guides/workflow.md, anchor:
plan-to-develop`. No `plan-to-develop` heading or anchor exists in
`docs/guides/workflow.md` at HEAD. Separately, §9.4 requires documentation
*paths* to "resolve to a shipped file" but says nothing about anchors — while
this repository already ships `npm run lint:doc-anchors`. Either add anchor
resolution to §11.2 stage 7 and fix the example, or state that anchors are
advisory display data.

(`docs/guides/` is in `files`, so package-relative references to it do ship.
That part of §9.4 is satisfiable as written.)

### R1-m6 — "catalog" is now overloaded three ways

The specification introduces "the guidance catalog" into a codebase that already
has `lib/workflow-policy/catalog.mjs` and `lib/command-surface/catalog.mjs`, and
§6 refers to "the command catalog" as an existing seam. Three unrelated catalogs
in one epic's vocabulary will produce ambiguous test names and review comments.
Consider a distinguishing term for the new one.

### R1-m7 — `chars / 4` understates digest-heavy JSON

The repository's proxy metric is `chars / 4`, calibrated on English prose. The
§13.2 and §15.2 response shapes are digest-heavy: a `sha256:` value is 64 hex
characters, which the proxy scores as 16 tokens but which real BPE tokenizers
split far more finely. With several digests per response, the §20.2 response
budgets may be met on the proxy and missed in practice. Validate the new
response budgets against a real tokenizer at least once and record the
proxy-to-actual ratio.

### R1-m8 — The dynamic half of `explain` has an unbudgeted cost

§20 budgets tokens only. But §4 explicitly forbids "Caching live GitHub, board,
PR, CI, approval, delivery, binding, or lock authority across command
boundaries," and §18 places a query at every decision boundary — after bind, before
each mutation, after each refusal, after compaction, after each external event.
Each of those is a fresh set of live reads; `promote` alone can require two
passes with a boundary fetch between them (see R1-M3).

The design is right to refuse cross-command authority caching. But an epic whose
stated goal is efficiency should state what it costs on the other axis: expected
live reads and wall-clock per lifecycle, and whether within-process memoization
(§12.5 step 6 allows it for the guidance index) extends to authority reads
inside a single command invocation. A budget on API calls per lifecycle would
make this honest.

---

## Reviewer-focus items: dispositions

| # | Focus                                          | Disposition                                                      |
| - | ---------------------------------------------- | ---------------------------------------------------------------- |
| 1 | Explain/execute share one authority            | **No** — see R1-B1. Blocked on `test → review` pre-guard mutation. |
| 2 | Project YAML injecting executable behavior     | **Satisfied.** Closed grammar, typed args, no shell strings, human prose never promoted. §21.1's control list is complete and §5.4 is correctly applied. |
| 3 | Cache fast paths accepting stale/invalid data  | **Satisfied in design**, with the §12.3 identity defects in R1-m3 to fix. Atomic rename-last-manifest and treating digest mismatch as a miss are correct, and §12.6's "cache is never authority" is the right posture. |
| 4 | Invalid guidance blocks early with recovery    | **Satisfied.** §11.4's refusal-before-network/lock/mutation ordering and the four surviving recovery surfaces are well chosen. Deleting the file as the escape hatch is the right last line. |
| 5 | Receipts suppressing guidance after compaction | **Not satisfied as argued** — see R1-M1. The mechanism is acceptable; the claim made for it is not. |
| 6 | Idempotent annotation without read-only writes | **Satisfied.** §17.2 correctly gates the write behind the first successful *mutation*, and §19's "do not roll back on annotation failure" is the right call. Note the idempotency check itself costs a comment read per mutation while diverged — fold into R1-m8's API budget. |
| 7 | #1558 / #1561 schema without a sequencing cycle | **Satisfied in principle**, but unenforceable until R1-B3 defines the ID space. §14's "core registry first, #1561 extends production and discovery" is the right sequencing. |
| 8 | Budgets measuring cumulative/repeated honestly | **Not satisfied** — see R1-M4 and R1-M5. The intent is right; the instrument does not exist and two targets are already breached. |
| 9 | Should Child B be split                        | **Yes, plan for the split.** Child B currently carries six workstreams: resolver, schema, validator, fail-closed loading, fingerprints/trust, cache, plus the warning and annotation. The cache genuinely is not independently valuable, so the natural seam is not cache-vs-catalog but **catalog + validator + resolver** (a complete, testable, shippable unit that blocks operations correctly) as one child, and **compiled cache + fingerprint/trust classification + divergence warning/annotation** as a second. The first has standalone value: a validator that runs and a loader that fails closed is useful before any performance work. §24's note should be rewritten around that seam rather than around size alone. |

---

## What I agree with, explicitly

So the author knows which ground is settled and need not re-argue it:

- §8.1's placement under `.ai-task-manager/`. Verified: that directory is
  tracked in this repository (92 files, including `templates/` per #574), so
  the "tracked, reviewable, project-owned" model matches existing convention
  exactly. The rejection of a project-root `aitm-guidance.yml` is right.
- §8.2's no-merge, no-fallback, no-auto-create rules, and the decision that
  *untracked* is invalid. Fail-closed here is correct and the reasoning is
  sound.
- §10.1's five-digest split, specifically that a human-only edit must not
  invalidate an agent receipt, and that comment changes move the file digest but
  not the semantic one. That distinction is the right one and is cheap to test.
- §10.3's final paragraph disclaiming fingerprints as publisher attestation.
  Correct and worth keeping verbatim.
- §11.2's rejection of anchors, aliases, merge keys, and custom tags, with the
  stated rationale. Correct, and orthogonal to R1-m4's point about *detecting*
  them.
- §12.1's exclusion of gzip, V8 serialization, SQLite, and a custom binary
  format until measurement shows need. `.tmp/aitm/` is the established
  disposable-runtime namespace (`lib/session-store.mjs`, `lib/bound-state.mjs`,
  `lib/chore-mode.mjs` all use it) and is gitignored at `.gitignore:6`.
- §12.4's atomic-rename-then-publish-manifest-last ordering, and the explicit
  statement that concurrent compilers are benign. With up to six parallel agent
  worktrees, lock-free convergence is the right choice.
- §19's separation of annotation failure from mutation authority.
- §5.4's "free text is data" and its consistent application in §14 and §21.2.
  This is the single most valuable rule in the document.
- `runGuards` aggregating refusals across the selected lists with no
  short-circuit (`guard-registry.mjs`) — §6's claim that it is a useful seam is
  accurate, and a multi-blocker `blockers[]` array in §13.2 is the right shape
  to consume it.
- `next` exists as a workflow verb, so §15.1's compatibility surface list is
  valid. (I checked, expecting it to be `pull-next` only. It is not.)

---

## Disposition of prior findings

None. This is round 1.

## Requested next step

Author response addressing R1-B1, R1-B2, and R1-B3 normatively — those three
change what gets built, not how it is described. R1-M1 through R1-M6 need either
a specification change or a recorded rejection with reasoning. The minors can be
batched.

I will review against the new source digest. Nothing here is accepted by
silence.
