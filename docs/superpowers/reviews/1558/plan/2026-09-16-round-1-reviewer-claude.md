# #1558 Implementation Plan — Reviewer Response, Round 1

- **Artifact under review:** `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md` (751 lines)
- **Pinned source spec digest (as asserted by the plan):** `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d`
- **Repository baseline asserted by the plan:** `a5d0245b812959e906adc834f149cebca43ab08d`
- **Role:** Reviewer (Claude). **Author:** Codex. **Round:** 1.
- **Terminal recommendation:** **REQUEST CHANGES.**

## 0. Disclosure of reviewer method and its limits

This review was performed **read-only, without shell access**. The PreToolUse Bash guard in
this worktree (`scripts/task-tracker/bash-guard.mjs`) fails **closed** for every command:

```
Internal guard error: Cannot find package 'ai-peer-review' imported from
.../scripts/task-tracker/lib/peer-review-adapter.mjs
```

`ai-peer-review@0.2.2` is a declared runtime dependency in this worktree's `package.json`,
but `node_modules/` is not populated here. Consequences the author must weigh when reading
this response:

1. **No `grep`/`find`/`git`.** Every codebase claim below is grounded in a file I opened by
   exact path and quote by `path:line`. I could not sweep for counter-examples, so **absence
   evidence in this review is weak**; presence evidence is strong.
2. **I did not compute the plan file's own SHA-256** (no shell). The author should stamp it.
3. **I could not run any Verification Command**, execute the parser, or measure context.
4. **`node_modules/` is absent**, so I could not inspect `js-yaml`'s installed API surface.
   Finding R1-06 is therefore raised as an *unverified dependency*, not as a defect claim.

Findings are ranked. Severity: **BLOCKER** (plan cannot be hydrated as written) /
**MAJOR** (will surface as rework or a false-green gate) / **MINOR** (precision).

---

## 1. BLOCKER findings

### R1-01 — BLOCKER — Task 15's context ceilings are ~2.4x below today's measured cost, and the plan defers that risk to the terminal task

**Evidence.** `scripts/task-tracker/measure-context.mjs:40-51` records the *current measured*
proxy-token cost of the existing adapters, in the source comments next to each budget:

```js
  claude: {
    bind: 12000,
    'bind+review+close': 13500, // measured 10774 + ~25% headroom
    'parallel-orchestration': 14000, // measured 10889 + ~29% headroom
  },
  codex: {
    bind: 12000,
    'bind+review+close': 17000, // measured 13286 after #454 + ~21% headroom
    'parallel-orchestration': 17500, // measured 13805 after #454 + ~21% headroom
  },
```

The plan's Global Constraints (line 32) fix the full bind-to-close ceiling at **7,000** with a
working maximum of **5,600**, and Task 15 Step 1 asserts both adapters must satisfy
`report.fullLifecycle.proxy <= 5600`.

Required reduction, against measured values already in the tree:

| Adapter | Measured `bind+review+close` | Task 15 working max | Required reduction |
| ------- | ---------------------------- | ------------------- | ------------------ |
| claude  | 10,774                       | 5,600               | **−48%**           |
| codex   | 13,286                       | 5,600               | **−58%**           |

Task 15 Step 2 forecloses the only listed escape: *"raising token ceilings is not a fix."*
Task 14 Step 5 explicitly permits a red pre-slim report. So the plan front-loads fourteen
tasks of extraction, validation, caching and catalog work, and only discovers at Task 15
whether the headline deliverable is physically reachable.

**Why this is a blocker, not a risk note.** The plan itself (line 59) warns that
*"Tasks 2, 6, 8, and 10 must not hide additional readiness or entrypoint work inside a small
estimate."* The same discipline is not applied to the one task carrying unbounded,
non-negotiable, terminal risk. There is no stated contingency if slimming lands at, say,
7,400 — which would be a 44% reduction and still a failure.

**Requested change.** Add a **feasibility probe that runs before Task 1 is hydrated** (a
spike child, or Task 1 Step 0) that measures an *irreducible floor*: the five permanent rules,
hard boundary prohibitions, canonical command pointers, receipt emission, and post-compaction
invalidation — i.e. exactly what Task 15's Interfaces paragraph says must be retained — plus a
representative worst-case blocked explanation. `measure-context.mjs` can produce this today
against a hand-written skeleton router/pickup; it costs hours, not tasks. Publish the number.
If floor + explanation traffic exceeds 5,600, the ceilings or the scope must change *before*
Tasks 1–14 are executed, not after.

### R1-02 — BLOCKER — Task 2's "freeze every pass's input" collides with a live `Reflect.set` mutation inside `runGuards`

**Evidence.** `scripts/task-tracker/lib/guard-registry.mjs:165-176`:

```js
  function finish(out) {
    if (warns.length > 0) out.warns = warns;
    if (Object.keys(derived).length > 0) out.derived = derived;
    if (
      ctx &&
      typeof ctx === 'object' &&
      Object.prototype.hasOwnProperty.call(derived, 'refinementPlan')
    ) {
      Reflect.set(ctx, 'refinementPlan', derived.refinementPlan);
    }
    return out;
  }
```

`runGuards` **writes back into the caller's `ctx`**. Task 2 Step 1 states *"Freeze every pass's
input"* and Task 2 Step 3 states the orchestration *"calls existing guards rather than
implementing their predicates again."* These two requirements are jointly unsatisfiable
against the current registry: ES modules are strict-mode, so `Reflect.set` on a frozen `ctx`
returns `false` — silently dropping `refinementPlan` — and an `Object.freeze`d target combined
with a strict-mode property assignment path will throw. Either way, the Refine path's
`refinementPlan` hand-off breaks or is silently lost, and the failure is state-dependent
(only on transitions where a guard emits `derived.refinementPlan`), so it will not appear in
most fixtures.

**Requested change.** Task 2 must name `guard-registry.mjs:172` explicitly and choose a
disposition: (a) change `runGuards` to return `derived.refinementPlan` in its result and
migrate the existing consumer, or (b) pass a deliberately unfrozen, single-purpose
write-through channel and freeze everything else. Whichever is chosen, add an explicit
regression asserting `refinementPlan` still reaches its consumer under the frozen-attempt
model. Silently relying on `Reflect.set`'s boolean return is not acceptable.

### R1-03 — BLOCKER — "Explanation performs no effects" is asserted but not established: registered guards shell out, and at least one performs a `git fetch`

**Evidence.** `scripts/task-tracker/lib/guard-registry.mjs:23-25` documents the contract:

> `run` may be sync OR async — `runGuards` awaits the result either way, so guards that shell
> out to git/gh can coexist with pure-data guards.

The registered inventory at `guard-registry.mjs:52-73` includes `develop-exit-commit-trail-head`
and `review-exit-close-gates`. `CLAUDE.md` states of the commit-attribution gate: *"The gate
runs `git fetch` before it reads, so the check is against the authoritative remote tip."*

`git fetch` mutates local refs and performs network I/O. Task 2's AC ("explanation performs no
effects"), Task 5 Step 1 (`assert.deepEqual(fixture.effects, [])`), Task 7 Step 1
(`assert.deepEqual(fixture.effects, [])`) and Task 12 Step 5 ("explain/validate/source/human
help never write GitHub, stamp evidence, run tests, or invoke providers") all presuppose that
running the **complete** guard set is effect-free. It is not, and the plan nowhere classifies
guard-level effects.

Compounding this: `runGuards` swallows throws into refusals (`guard-registry.mjs:148-150`).
If Task 2's "effect-capable test ports throw" is implemented by making the git port throw,
that throw becomes `{ok:false, reason: 'guard "x" threw: ...'}` — a **refusal**, not a test
failure. The no-effect assertions can therefore pass while silently converting every
effect-performing guard into a blocker, producing a plausible-looking but wrong decision.

**Requested change.** Add to Task 1 an explicit **per-guard effect classification** (pure /
read-only-network / ref-mutating / effectful), recorded in the frozen inventory alongside
siteId. Task 2 must then state which class explanation may execute and what it substitutes for
the rest (cached observation, explicit `indeterminate`, or a read-only variant such as
`git ls-remote` in place of `git fetch`). Add a negative test asserting that a thrown effect
port fails the test rather than degrading to a refusal.

### R1-04 — BLOCKER — Task 1's scope omits the ~30 guard modules whose refusals it must type, and the runtime blocker shape cannot carry a code today

**Evidence.** Two facts, both from `guard-registry.mjs`.

First, the runtime refusal shape (`guard-registry.mjs:136-142`, `178-186`) is:

```js
      const out = { ok: false, reason: result.reason ?? '(no reason given)' };
      if (Array.isArray(result.blockers)) out.blockers = result.blockers;
...
      const entry = { id: g.id, reason: r.reason };
```

A refusal carries exactly **guard id + free-text reason**. There is no code field, and a guard
with several refusal branches (e.g. `blocked-by`, `plan-entry-fields`, `review-exit-close-gates`)
collapses all of them onto one id. Task 1's `normalizeRefusal` maps `(raw, {siteId, guardId,
legacyInventory})` to a typed Blocker with a *"stable guardId/code"* (line 140), while Task 8
Step 2 forbids *"no reason parsing."* With only id + prose available at runtime, sub-branch
identity is unrecoverable without modifying the guards themselves to emit codes.

Second, `guard-registry.mjs:6-11` names where guards actually live:

> `state-bootstrap.mjs` — registers every guard into its state slot via `registerGuard`, walking
> the per-state container modules in `scripts/task-tracker/states/` (#292).
> `guard-bootstrap.mjs` is a deprecation shim that re-exports `bootstrapGuards` from here.

Task 1's Scope/files (line 152) lists `lib/lifecycle-policy/actions.mjs`, `lib/guard-registry.mjs`
and `lib/guard-bootstrap.mjs` — the **deprecation shim** — and never names `state-bootstrap.mjs`
or `scripts/task-tracker/states/`. The plan's own File and interface map (lines 69–91) likewise
omits both. Yet the registry table at `guard-registry.mjs:52-73` enumerates roughly **30
distinct registered guards** across eight states, and Task 1 Step 4 requires *"Every reachable
site must be typed or match a frozen legacy record."*

**Requested change.** (a) Add `scripts/task-tracker/state-bootstrap.mjs` and
`scripts/task-tracker/states/*.mjs` to both the file map and Task 1's Scope/files, and correct
the `guard-bootstrap.mjs` reference to note it is a shim. (b) State explicitly whether Task 1
modifies guard `run()` implementations to return a stable `code`. If yes, that is ~30 modules
and their regressions, and Task 1 is no longer a single atomic child — split it by guard family
per the plan's own line 59 rule. If no, explain how sub-branch codes are derived without reason
parsing, because the current shape does not permit it.

---

## 2. MAJOR findings

### R1-05 — MAJOR — Two documented escape hatches let a *skipped* authority read return `ok`, contradicting the "required-read failure → indeterminate" AC

**Evidence.** `scripts/task-tracker/lib/verb-preflight.mjs:142-144`:

```js
  if (process.env.TT_SKIP_NETWORK === '1') {
    return { ok: true, stateAfter: stateBefore, changed: false, skippedNetwork: true };
  }
```

and `verb-preflight.mjs:163-164`:

```js
  const gateAssignee = cfg.preferences?.gateAssigneeMatch ?? true;
  if (gateAssignee && !ownershipManagement) {
```

`TT_SKIP_NETWORK=1` returns **`ok: true`** without reading the board or the marker.
`gateAssigneeMatch: false` skips the entire ownership check. Both are sanctioned and referenced
in the fail-closed comment at `verb-preflight.mjs:194-196`.

Task 2's AC states *"Required-read failures, incompatible evidence, malformed results, and
pending adapters never become ready."* Under `TT_SKIP_NETWORK=1`, a required read is not merely
failed — it is never attempted — and the existing code returns success. An explanation built on
this path would report `ready` on the strength of a read it did not perform. The plan never
mentions `TT_SKIP_NETWORK` or `gateAssigneeMatch`.

**Requested change.** Task 4 must state the disposition: either these modes force
`status: 'indeterminate'` with a named blocker (my recommendation — a skipped read is not
evidence), or the decision's `snapshot` must carry an explicit `skipped` provenance marker and
the AC must be reworded to exempt it. Add fixtures for both modes to Task 4 Step 2.

### R1-06 — MAJOR — The entire Task 9 parser contract rests on a `js-yaml` event API that the plan never establishes exists, and the fallback ripples into Tasks 10–11

**Evidence.** The plan's Tech Stack (line 9): *"Initially evaluate the installed `js-yaml` 5.4.2
event API."* Task 9 Step 1: *"Use `parseEvents` to inspect syntax and field ranges before
`constructFromEvents`."* Every Step 1 fixture (nested sequences, block scalars, duplicate keys,
explicit tags, anchors/aliases, merge keys, **raw range offsets independent of decoded scalar
values**) presumes a low-level event or CST API.

`package.json:104` carries `"js-yaml": "^5.4.2"` in **devDependencies**. I could not verify the
installed API surface — `node_modules/` is absent in this worktree (see §0). I therefore raise
this as an unverified dependency, not a defect.

The structural problem is independent of which parser wins. Task 9 Step 2's fallback — *"Use a
second parser only if the event API fails this contract"* — is a mid-task branch, but the parser
choice is an input to:

- `package.json` / `package-lock.json` production dependencies (Task 9 Scope),
- the published release fingerprint `instructions/aitm-guidance.release.json` (Task 10),
- **cache identity, which the plan says includes "runtime versions"** (Task 11 Step 3),
- and Task 11's warm-path assertion `assert.equal(warm.parserCalls, 0)`, which requires a
  nameable parser entry point to trap.

Discovering at Task 9 Step 2 that the parser must change invalidates work already scoped into
Tasks 10 and 11.

**Requested change.** Promote parser selection to an explicit gate **before** Task 9 is
hydrated: a named spike with a go/no-go that produces (a) evidence the chosen API exposes raw
source ranges for the six scalar forms in Step 1, and (b) the pinned production version. Record
the decision in the plan. Also state explicitly that `js-yaml` moves `devDependencies` →
`dependencies`, since Task 9's AC3 ("The selected parser is available in production
dependencies") is otherwise unverifiable against a devDependency.

### R1-07 — MAJOR — Task 3 omits `evidenceStamp: true`; without it the normalization write will be refused by the #522 proof-introduction guard

**Evidence.** `scripts/task-tracker/lib/functional-dod-derive.mjs:66-77`:

```js
  return mutateIssueBody({
    issueNumber,
    repo,
    deps,
    // #522 — sanctioned close-pipeline auto-stamp: the derived `acs`/`checkboxes`
    // evidence is computed from the body's own ticked state at close time, so the
    // proof-introduction guard is bypassed for this minting site.
    evidenceStamp: true,
```

The derived-DoD write is a **sanctioned proof-minting site** and only succeeds because it passes
`evidenceStamp: true`. Task 3's Interfaces say only *"Consumes `mutateIssueBody` through the
existing versioned boundary,"* and the planned signature
`persistReadyNormalizations({ decision, refreshAndEvaluate, mutateBody, readBack })` carries no
such flag. If the extracted persistence path calls `mutateBody` without it, every
`functional-dod-derived` normalization is refused by the guard this comment describes — and the
failure will look like `normalization-persist-failed`, i.e. it will be misdiagnosed as a write
fault rather than a lost bypass.

**Requested change.** Name `evidenceStamp: true` in Task 3's Interfaces as a preserved
invariant, and add a Step 4 assertion that the persisted write carries it. Relatedly: the
`evidenceStamp` bypass is exactly the kind of authority the Global Constraint *"A successful
explanation is never a grant"* exists to protect — the plan should state that the flag is set
only inside `persistReadyNormalizations`, never reachable from the explain path.

### R1-08 — MAJOR — Task 10 scopes "every operational command kind" as one child; the command surface is at least 21 commands with distinct effect paths

**Evidence.** `scripts/task-tracker/lib/command-surface/catalog.mjs:12-38` enumerates:

```js
      'promote', 'next', 'refine', 'plan', 'test', 'review', 'close',
      'demote', 'reject', 'shelve', 'park', 'cancel-plan', 'force',
      'supersede', 'plan-approve', 'approve', 'review-probe', 'resume',
      'bind', 'rebind', 'callback',
```

Task 10 Step 2 requires RED coverage *"including every operational command kind in
command-surface enumeration and direct supported task-tracker/installer entrypoints,"* plus an
inventory of *"imports and startup paths for effects before `buildContext`."* That is 21+
commands — including the destructive/override lane (`force`, `supersede`), the human-approval
lane (`plan-approve`, `approve`), and `review-probe`/`callback` — each needing its own
before-effects trap.

The plan's own line 59 flags Task 10 as a task that *"must not hide additional readiness or
entrypoint work inside a small estimate."* The scope as written does exactly that.

**Requested change.** Either enumerate the command list inside Task 10 so its Refine estimate is
grounded, or split Task 10 into (10a) admission gate + source/trust + recovery CLI, and (10b)
entrypoint sweep + divergence annotation. Also confirm the seven-action v1 registry and the
21-command admission surface are *deliberately* different sets; today the plan uses "operational
command" and "v1 action" almost interchangeably.

### R1-09 — MAJOR — `listLifecycleActions()` has no stated disposition for the five registered non-v1 actions

**Evidence.** `scripts/task-tracker/lib/lifecycle-policy/actions.mjs:12-50` defines
`ACTION_POLICIES` with nine keys: `test`, `review`, `close`, `promote`, `refine`, `demote`,
`shelve`, `park`, `cancel-plan`. Of the plan's seven v1 actions (bind, resume, promote, test,
review, deliver, close), **four** are present; `bind`, `resume` and `deliver` must be added
(Task 1 Interfaces acknowledges this). But `refine`, `demote`, `shelve`, `park` and
`cancel-plan` are already registered and are **not** in the v1 set.

Task 1's AC says *"All seven v1 actions use one bare-ID registry."* Task 8 Step 4 says *"No
untested lane can inherit readiness merely because its action ID is registered."* Neither says
what `listLifecycleActions()` returns for the five non-v1 actions, nor what
`readiness: 'pending'` obliges a caller to do. An explanation consumer that iterates the registry
will encounter them.

**Requested change.** State explicitly that `listLifecycleActions()` returns all twelve
descriptors with `readiness: 'pending'` for non-v1 actions, and that `explain --action demote`
returns a named `action-not-explain-ready` refusal rather than an error or a fabricated
decision. Add that case to Task 12 Step 1's "unsupported action" coverage.

### R1-10 — MAJOR — `measure-context.mjs` keeps its own budgets; VC15 will report green from the legacy tool while the real gate is red

**Evidence.** `measure-context.mjs:35` and `:40-51` define `BUDGETS` and `SCENARIO_BUDGETS`, and
the file header (`:16-17`) states `--all` gives *"Non-zero exit if any scenario breaches its
budget."* VC15 (line 719) runs:

```
node scripts/task-tracker/measure-context.mjs --all --adapter codex &&
node scripts/task-tracker/measure-context.mjs --all --adapter claude &&
node scripts/task-tracker/measure-guidance-context.mjs --all --assert-budgets --json
```

At codex's current 13,286 measured tokens against its own 17,000 budget, the first two commands
**pass today and will keep passing** after any slimming, while the new harness enforces 5,600.
Task 15's Scope says only *"`measure-context.mjs` scenarios"* are modified — not its budgets.

**Requested change.** Task 15 must state that `SCENARIO_BUDGETS` is lowered to be consistent
with the §20.2 ceilings (or that `measure-context.mjs` is retired in favour of
`measure-guidance-context.mjs`). Two independent budget tables that can disagree is precisely
the false-green shape the plan's integrity constraints exist to prevent.

---

## 3. MINOR findings

### R1-11 — MINOR — `forwardTarget` does not live in `actions.mjs`; the file map omits two lifecycle-policy modules

`actions.mjs:2` imports `forwardTarget` from `./executable-transitions.mjs`, and `index.mjs:2-7`
re-exports `forwardTarget`, `backwardTargets`, `validateExecutableTransition` and
`validateTransition` from there; `stateIds`/`stateIndex`/`normalizeStateId` come from
`states.mjs`. Task 4's Interfaces says navigation *"calls `actionPolicyFor('promote', state)` and
`forwardTarget(state)`"* without naming the owning module, and the File and interface map
(lines 69–91) lists only `actions.mjs`. Add `executable-transitions.mjs` and `states.mjs` to the
map so the shared-navigation seam is unambiguous.

### R1-12 — MINOR — `verbs/deliver.mjs` imports a fifth preflight the plan never names

`scripts/task-tracker/verbs/deliver.mjs:40-45` imports **four** validators:

```js
  validateDeliveryPreflight,
  validateHistoricalReconstructionPreflight,
  validateHistoricalRecoveryPreflight,
  validateMergedDeliveryPreflight,
```

Task 7's Interfaces names three of them and omits `validateHistoricalRecoveryPreflight`. The
plan gestures at it obliquely (*"optional recovery explanations may remain unsupported but cannot
be labeled ready"*), but an inventory task should name the symbol. Add it explicitly with its
disposition.

### R1-13 — MINOR — Task 4's refusal fixture list omits the live `migration-freeze` refusal (exit 14)

`verb-preflight.mjs:129-137` returns `kind: 'migration-freeze'` / `EXIT_MIGRATION_FREEZE = 14`
(`:52`) from `isReadyForPlanMigrationActive()`, **before** any network read, bind reconciliation
or guard. It is the first refusal any session can hit. Task 4 Step 1's fixture list (worktree /
binding / ownership mismatch, issue state, field / parent / dependency / contiguity, plan
approval / deep-dive / metadata / estimate, unmapped transition) does not include it. Add it —
and note it is a *global* freeze, so it is a plausible source of a `ready`/`blocked` parity
mismatch if the evaluator consults it and the executor short-circuits earlier, or vice versa.

### R1-14 — MINOR — Task 3's pure projection must replicate a base-vs-next asymmetry in the current derive

`functional-dod-derive.mjs:75-113` parses `items` (and therefore `acsItem.checked` /
`cbItem.checked`) from **`base`**, while `deriveAcsStatus`/`deriveCheckboxesStatus` are evaluated
against the progressively-mutated **`next`**. A naive re-implementation that re-parses `items`
from `next` between the two keys changes tick behavior. Task 3 Step 3 says *"Derive acs before
checkboxes with current exact eligibility rules"* — please make the base/next split explicit, and
assert it directly, since Task 3's AC1 claims byte-level parity with execution.

### R1-15 — MINOR — Task 4's "do not invent `verbs/bind.mjs`" is right, but `bind`/`rebind` *are* first-class commands

`catalog.mjs:33-34` registers both `bind` and `rebind` in `CURSOR_TRIGGER_BY_COMMAND`, and
`catalog.mjs:7-8` wires `EXECUTABLE_ENTRYPOINTS` and `ROUTE_IDENTITIES`. So while
`verbs/bind.mjs` may not exist, there is a real bind command surface with route identity — and
`rebind` is a distinct command sharing the binding path that appears in neither the v1 seven nor
any task. Clarify whether `rebind` is explain-ready, `pending`, or deliberately out of scope.

---

## 4. What I checked and found sound

Recorded so the author does not re-litigate settled ground:

- **Derivation rule IDs preserved.** `derive:all-acceptance-criteria-ticked` and
  `derive:all-non-self-non-lifecycle-checkboxes-ticked` exist verbatim at
  `functional-dod-derive.mjs:85` and `:105`. Task 3's preservation requirement is correct.
- **`deriveAndRescan` really is mutate-before-evaluate.** `review-derive-rescan.mjs:59-95` runs
  the stamping derive, then re-fetches. Task 6 Step 3's instruction to remove it from the
  readiness path is well-targeted, and Task 3's note about replacing stale fallback behavior in
  `review-derive-rescan.test.mjs` correctly anticipates the regression churn.
- **`instructions/` is genuinely absent from the package allowlist.** `package.json:53-75` lists
  `bin/`, `config/`, `skill/`, `hooks/`, `scripts/`, `statusline/`, `docs/…`, `templates/` — no
  `instructions/`. Task 9's allowlist requirement is real, not defensive.
- **Headroom arithmetic is internally consistent.** 5,000/300/500/7,000 × 0.8 = 4,000/240/400/5,600,
  and the base (fraction of ceiling) matches the repo's existing #204 convention as documented at
  `measure-context.mjs:38-39`.
- **Verification-Command paths sampled and confirmed to exist:**
  `scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs` (`@story #502`),
  `.../guard-parity-early-stages.test.mjs` (`@story #310`),
  `.../test-407-binding-survives.test.mjs` (`@story #407`),
  `scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs` (`@story #1631`),
  `scripts/task-tracker/measure-context.mjs`, `scripts/dev-env/setup-local-worktree.sh`,
  `scripts/task-tracker/verbs/deliver.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`.
  I did **not** sample all 15 VCs.
- **`--all` already fails non-zero on breach** (`measure-context.mjs:16-17`), so the tool is a
  usable gate — see R1-10 for the budget-table caveat.

---

## 5. Requested disposition

| ID     | Severity | Summary                                                                      | Reviewer's asked-for outcome                     |
| ------ | -------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| R1-01  | BLOCKER  | 5,600-token ceiling vs 10,774/13,286 measured; risk deferred to Task 15       | Add pre-Task-1 feasibility probe with a number   |
| R1-02  | BLOCKER  | `Reflect.set(ctx,…)` in `runGuards` vs "freeze every pass's input"            | Name the site; choose and test a disposition     |
| R1-03  | BLOCKER  | Guards shell out / `git fetch`; "no effects" AC unestablished                 | Per-guard effect classification in Task 1        |
| R1-04  | BLOCKER  | ~30 guard modules and `state-bootstrap.mjs` absent from Task 1 scope; no runtime code field | Correct scope; state whether guards are modified |
| R1-05  | MAJOR    | `TT_SKIP_NETWORK` / `gateAssigneeMatch` make a skipped read `ok`              | Force indeterminate, or carry `skipped` provenance |
| R1-06  | MAJOR    | `js-yaml` event API unverified; fallback ripples into Tasks 10–11             | Parser go/no-go gate before Task 9               |
| R1-07  | MAJOR    | `evidenceStamp: true` omitted from Task 3 interfaces                          | Name it as a preserved invariant + assert it     |
| R1-08  | MAJOR    | Task 10 spans 21+ commands as one child                                       | Enumerate or split 10a/10b                       |
| R1-09  | MAJOR    | Five registered non-v1 actions have no `listLifecycleActions()` disposition   | State return shape + `action-not-explain-ready`  |
| R1-10  | MAJOR    | `measure-context.mjs` budgets unchanged → VC15 false green                    | Lower `SCENARIO_BUDGETS` or retire the tool      |
| R1-11  | MINOR    | `forwardTarget` owner module missing from file map                            | Add `executable-transitions.mjs`, `states.mjs`   |
| R1-12  | MINOR    | `validateHistoricalRecoveryPreflight` unnamed                                 | Name it with a disposition                       |
| R1-13  | MINOR    | `migration-freeze` (exit 14) missing from Task 4 fixtures                     | Add the fixture                                  |
| R1-14  | MINOR    | base-vs-next parse asymmetry in derive                                        | Make explicit; assert directly                   |
| R1-15  | MINOR    | `bind`/`rebind` command surface vs "no `verbs/bind.mjs`"                       | Clarify `rebind` scope                           |

**Terminal recommendation: REQUEST CHANGES.** R1-01 is the one I would not trade away — the plan
commits fifteen tasks against a context target that today's own instrumentation says is roughly
2.4x away, and forbids the only named escape. Everything else is tractable inside the existing
structure.

I did not review: §20's full cost model against a live run, the cache-identity matrix (Task 11)
against real `git rev-parse --git-path index` behaviour, or the traceability table row-by-row.
Those need shell access; flag if you want them in round 2 and I will ask for the worktree's
`node_modules` to be restored first.
