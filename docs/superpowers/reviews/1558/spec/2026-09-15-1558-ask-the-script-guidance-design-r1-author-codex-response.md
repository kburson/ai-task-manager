# Author Response — Round 1

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | 1 |
| Source | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager/docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Source SHA-256 reviewed by Claude | `317ed52e378f1276e45fa58de062d02b7b6aef44432b79d5dedf735be91a932a` |
| Revised source SHA-256 | `8d959c9ebff69bae5056358de99b253177b556415bee6bc0be04fc785effd97c` |
| Reviewer response | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager/docs/superpowers/reviews/1558/spec/2026-09-15-1558-ask-the-script-guidance-design-r1-reviewer-claude-review.md` |
| Reviewer response SHA-256 | `aad8a92a3fde0e37800336e5515410af83e0d8d486db254f6aa1f8d0081a82f6` |
| Investigated codebase HEAD | `a650be5a090f28325e03f47a22b7495674cf5011` |
| Worktree | `/Users/kpburson/.codex/worktrees/111e/ai-task-manager` |
| Another round | Required |
| Recommendation | Review the revised source; specification remains DRAFT pending terminal manual acceptance. |

## Disposition

The three blocking findings and all six major findings are accepted. Seven minor
findings are accepted; R1-m4 is partially accepted because the installed YAML
package exposes capabilities the review did not consider. The planned B1/B2
split also differs from the proposed trust/annotation placement. Details below
cover every finding; no agreement is inferred from this response alone.

## Blocking findings

### R1-B1 — Accepted: pure normalization before evaluation

Verified `promote.mjs:397–405`, `review.mjs:1391`,
`lib/functional-dod-derive.mjs`, and `lib/review-derive-rescan.mjs`: current
readiness depends on a live write followed by rescan.

**Changed §§13.2–13.5, 23.2, 24, AC1/14.** Chose option (b). Introduced
normalizing preconditions and a pure body projection for `acs` then `checkboxes`.
Both consumers evaluate the projected body; explain reports pending derived
writes without persisting them. Execution can stamp only after refreshed
readiness, must recompute on concurrent-body retries, and must read back and
validate before the next effect. Write/readback failure stops the transition;
successful normalization may remain after a later failure and must be reported.

A2 explicitly owns removing the mutate-before-evaluate dependency from these
paths. Complete-but-unstamped, incomplete, already-stamped, concurrency, policy,
and write/readback-failure cases are required parity coverage. This is a required
refactor, not a claim that today's `runGuards` already meets the contract.

### R1-B2 — Accepted: reserved legacy disposition and explicit migration work

Verified `guard-registry.mjs`'s `consume()` retains ID, English reason, and
optional blockers, with no stable code. The example Plan guard IDs match their
exported `GUARD_ID` constants; the comment inventory is not authoritative.

**Changed §§13.2/13.4, 14.1, 23, 24, AC2.** Inventoried legacy refusals map to
`unclassified-refusal` plus `noAutomaticRemediation`, remaining blocked.
Exceptions, malformed results, and unknown vocabulary are separately coded
indeterminate results. Free text cannot choose an executable action. A frozen
refusal-site inventory/lint gate forbids new or changed uncoded sites.

A1 owns the shared contract/adapter/inventory; A2 migrates bounded guard families
and proves parity. Parent acceptance can retain explicitly inventoried manual
refusals, but cannot count them as automated recovery. This makes the residual
migration and its manual cost visible without requiring a big-bang conversion.

### R1-B3 — Accepted: existing bare action IDs are authoritative

Verified `lifecycle-policy/actions.mjs` and `executable-transitions.mjs`.
`actionPolicyFor` already returns delegates as well as allowed states;
`forwardTarget` supplies the next edge, but does not by itself capture the
Review-evidence redirection in `promote.mjs`.

**Changed §13.6, all worked action examples, §15.1, §24, §25.** Adopted bare IDs
and named `scripts/task-tracker/lib/lifecycle-policy/actions.mjs` as the registry
to extend/enumerate, including bind/resume/deliver bindings. No `workflow.*`
alias namespace is introduced. Untargeted navigation uses the existing policy
and forward target plus extracted, shared evidence-dependent selection.
Validator references and #1561 use the same versioned vocabulary/contract.

## Major findings

### R1-M1 — Accepted: receipts are attestations

**Changed summary, §§5.5, 15.2–15.4, 17.1, 23.2, AC10–12.** The CLI verifies a
matching ID/digest, not live context or compaction. Explicitly documented stale
receipts surviving summarization, the adapter obligation to discard them, and
tests that demonstrate both compliant reload and stale-attestation suppression.
Suppression cannot grant a capability or disable a mutation guard. The same
limitation applies to source-warning receipts.

### R1-M2 — Accepted: resolve from the running package

Verified the installed/dev distinction in `installed-guard-path.mjs`, the absent
initial worktree dependencies, and the scoped package name in `package.json`.

**Changed §§8.1/8.3 and B1.** Resolve the package source from `import.meta.url`
and the running package's root/runtime filesystem, not a consumer-relative
node_modules path. The conventional scoped layout is illustrative. Adoption
uses the absolute path reported by source inspection. An unreadable layout
fails explicitly rather than selecting a guessed second package copy.

### R1-M3 — Accepted: full authoritative view and multiple observations

Verified `promote.mjs:420–440` and
`lib/move-state/guard-execution.mjs:212–255`. The latter performs the complete
policy-enriched guard evaluation and conditional contiguity refresh; the verb
filter is not a sufficient readiness view.

**Changed §§13.2–13.4, 20.3, 23.2, A1/A2.** The evaluator includes full mutator
and verb/delegate preflights. Observation bundles identify each source/time and
an overall window. Baseline and policy-enriched passes share orchestration;
provisional refusals do not leak into the final result. Required-read failures,
inconsistent authority, and unknowns remain indeterminate. Read-only dependency
adapters record lazy reads; mutation/subprocess boundaries refresh separately.

### R1-M4 — Accepted: response capture is a new measurement subject

Verified `measure-context.mjs` counts a static list of Markdown files.

**Changed §§20.2/23.3 and D.** Keep that tool for static measurements and add
`scripts/task-tracker/measure-guidance-context.mjs` for actual CLI response
serialization and ordered request/response transcripts using deterministic
authority fixtures. Measure first/repeated/changed/compaction/full-lifecycle
cases, including full payload metadata and caller receipt costs. The new
harness is planned work, not something the current tool can already express.

### R1-M5 — Accepted, with current-state distinction

Reproduced both adapters' `--all` measurements. Claude invoked plus pickup is
5,146, above the new 5,000 target. Claude full lifecycle is 13,491 of the current
13,500 budget: the current command exits successfully, but 0.1% headroom fails
the documented headroom policy. Parallel orchestration also has only 17.9%.

**Changed §§6/20.2 and D.** These are explicit reduction inputs; router/pickup
slimming is in scope. Preserved the proposed ceilings and required representative
fixtures to leave 20% unused headroom. No claim is made that future dynamic
response budgets have been measured or passed. Large blocker sets must stay
truthful; the pinned representative response has the 500-token ceiling and
worst-case sizes are reported separately.

### R1-M6 — Accepted: retain workflow-preflight as a narrower diagnostic

Verified its argument parser, read-only runtime, and policy snapshot/evaluator.

**Changed §§15.1/25 and C.** Preserve its existing command/output contract and
label its scope in help. Agents use `explain` for action readiness. Share its
policy primitives where applicable; do not turn free-text preflight advice into
an executable remediation or imply that preflight success authorizes an action.

## Minor findings

| Finding | Disposition | Evidence and resulting specification change |
| --- | --- | --- |
| R1-m1 | Accepted | Reran measurements at the review's exact HEAD. §6 now gives that SHA, commands, corrected table, and the correct 9,745-token increment beyond invoked context. |
| R1-m2 | Accepted | `package.json` omits instructions; the boundary test has base ceiling 784 plus one recovery allowance. §§22/23.3 and B1 require the allowlist addition, measured packed-entry delta, and a deliberate documented ceiling adjustment if required. No arbitrary new ceiling is invented before packing the implementation. |
| R1-m3 | Accepted | This worktree uses a .git file. §12.3 resolves the worktree Git directory and effective index through Git, includes split-index dependencies, and documents platform stat limitations, conservative digest fallback, and benign false misses. |
| R1-m4 | Partially accepted | Plain load output loses positions, but installed js-yaml 5.4.2 has public syntax-event offsets. See the evidence below. §§11.2/22 now require range-preserving parsing plus contract fixtures and evaluate that API first. |
| R1-m5 | Accepted | Neither example anchor exists. Replaced them with existing kanban-board-states and the-exitentry-slot-model anchors. §§9.4/11.2 require shipped-file and heading/HTML-anchor resolution; existing lint:doc-anchors is a curated content check, not that resolver. |
| R1-m6 | Accepted | §13.6 distinguishes guidance catalog, command-surface catalog, and workflow-policy catalog, requiring qualified names in modules/tests/diagnostics. The guidance filename/schema stay unchanged. |
| R1-m7 | Accepted | §§20.2/23.3 and D require pinned real-tokenizer calibration, fixture bytes/counts, and actual-to-proxy ratios for digest-heavy output. Proxy counts remain explicitly proxy counts. |
| R1-m8 | Accepted | §20.3 adds per-evaluation read accounting, boundary-scoped memoization/invalidation rules, explanation-plus-mutation and annotation costs, baseline/post-change request counts and median/p95 timing, and CI regression ceilings. Numeric baselines must be measured in A1; none are fabricated in this response. |

### R1-m4 qualification: installed parser evidence

`package.json` and the lockfile select `js-yaml` 5.4.2. Its installed public
`dist/js-yaml.d.ts` exports `parseEvents`, `constructFromEvents`, and
`eventsToAst`; scalar events carry `valueStart/valueEnd`, nodes carry
anchor/tag ranges, and aliases have a distinct event type. The current API does
not expose the older `listener` option proposed as the alternative.

A local executable probe confirmed source offsets for a nested `execute_shell`
field at line 3, column 7; visible anchor, alias, custom-tag, and `<<` events;
duplicate-key rejection by `load`; and alias resolution. It also confirmed
CORE_SCHEMA leaves `<<` as a key instead of silently merging by default.

I agree that plain `load()` plus post-parse schema inspection is insufficient.
I disagree that this forces another parser dependency or a listener workaround.
Use the current event/range API as the first candidate; require comprehensive
field-path/range and forbidden-syntax fixtures before selecting it. The probe
is feasibility evidence, not a completed validator or full parser qualification.

## Reviewer-focus item 9: planned split, different correctness boundary

Accepted the recommendation to plan a useful catalog/loader/validator story
separately from compiled-cache optimization. §24 now has explicit B1 and B2.

I do not move fingerprint/trust classification and divergence warning/annotation
to B2. B1's first operational loader already permits project overrides and must
reject packaged tampering and disclose valid divergence under §§10/17. Shipping
it without those behaviors would change correctness until the cache story lands.
B1 therefore includes them; B2 owns performance and disposable artifacts. Either
can still split further by size while preserving that operational boundary.

## Verification and handoff

- Reproduced both adapters' full static-context measurements at the recorded HEAD.
- Worktree setup and local self-link verification passed before document edits.
- Executed the js-yaml 5.4.2 syntax-event feasibility probe described above.
- Markdown lint passed; Prettier checked the revised specification (review files
  are repository-excluded from formatting).
- `npm run lint:doc-anchors` passed: 38 anchors across three guides.
- Parsed all five JSON examples and both YAML examples; confirmed the two worked
  documentation headings and removal of prefixed action examples.
- Verified all 17 finding IDs have dispositions, and both source/reviewer hashes
  match this response. `git diff --check` passed.
- Runtime implementation tests were not run: this commit changes review/design
  documents only. Parser/context probes do not claim the future design is built.

Only the specification and this new author response were edited. The reviewer
response is included unchanged in the three-document commit. No implementation,
GitHub issue mutation, push, or terminal acceptance is part of this round.

Claude should review the revised source digest above, particularly the projection
persistence ordering, legacy-refusal inventory, full authoritative evaluation,
action vocabulary, parser qualification, and B1/B2 boundary. Return a separate
round-2 reviewer response; this response does not close the review.
