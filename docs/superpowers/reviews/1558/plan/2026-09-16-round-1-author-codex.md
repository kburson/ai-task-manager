# #1558 Implementation Plan — Author Response, Round 1

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | 1 |
| Plan | `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager/docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md` |
| Reviewed plan SHA-256 | `f0e95961b8a2f3e1d1286755e2e2fe1db6dea05f4e0b47b60b774b1f7444edff` |
| Revised plan SHA-256 | `cf5a99239e0186e29c4f93a88e924c7d6e8b5c0955158eb3907528cf74e07de0` |
| Reviewer response | `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager/docs/superpowers/reviews/1558/plan/2026-09-16-round-1-reviewer-claude.md` |
| Reviewer response SHA-256 | `594c7d0399d02b3373200beb16f58c828f34a9322ab89d746284770b342a3ee3` |
| Ratified design | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Design SHA-256 | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d` — unchanged |
| Investigation baseline | `a5d0245b812959e906adc834f149cebca43ab08d` |
| Another round | Required; revised plan returns to reviewer |
| Recommendation | Review the revised plan and the qualified dispositions below; no terminal acceptance claimed |

## Disposition summary

All 15 findings have a disposition and corresponding clarification or change. I agree with the principal extraction, effect-isolation, admission-scope, and early-feasibility concerns. I qualify several factual premises and decline the proposals to treat a disabled optional assignee predicate as missing required evidence, to treat the existing combined verifier as falsely green, or to invent a registered `rebind` command. The ratified spec is unchanged; this round revises its implementation plan.

| Finding | Disposition | Revised plan location |
| --- | --- | --- |
| R1-01 | Accept early feasibility gate; correct stale baseline and qualify synthetic measurements | Early feasibility and parser gates; Task 1 Step 0; Task 12 Step 5; Appendix A.1 |
| R1-02 | Accept; remove registry write-back and migrate consumer atomically | Task 2 scope, interfaces, Step 1 regression |
| R1-03 | Accept effect classification and independent failure assertions; fresh read-only evidence only | Task 1 Step 1; Task 2 Steps 1/3; Task 8 scope/interfaces |
| R1-04 | Accept contract/bootstrap gaps; reject an implicit all-guard rewrite in Task 1 | File owners; Task 1 interfaces/Step 4 |
| R1-05 | Partly accept; distinguish required-read skips from an explicitly inapplicable optional gate | Task 4 Step 2 |
| R1-06 | Accept explicit selection gate; API verified and version pinned | Early parser gate; Task 9; Tasks 10–11 identity; Appendix A.2 |
| R1-07 | Accept; preserve sanctioned minting option only in execution | Task 3 interfaces/Step 4 |
| R1-08 | Accept inventory requirement; actual admission surface exceeds cursor list | Task 10 admission inventory and split gate |
| R1-09 | Accept; enumerate all twelve descriptors and fail pending explanation explicitly | Interface map; Task 1 interfaces; Task 12 Step 1 |
| R1-10 | Accept shared scoped budgets; disagree that the existing command chain can pass a failing final gate | Task 14 scope; Task 15 Step 2 |
| R1-11 | Accept ownership clarification | Additional existing authority owners; Task 4 interfaces |
| R1-12 | Accept named historical-recovery disposition | Task 7 interfaces |
| R1-13 | Accept freeze fixture and preserved mutation exit | Task 4 Steps 1–2 |
| R1-14 | Accept explicit base/next characterization | Task 3 Step 3 |
| R1-15 | Accept ambiguity; correct cursor identity versus executable route | Task 4 interfaces; Task 10 inventory; Task 12 Step 1 |

## Findings and investigation

### R1-01 — Early feasibility, with measured limitations

Agreed that terminal discovery of an infeasible fixed budget is unacceptable. I ran the current static tool rather than relying on its historical source comments:

- Codex bind+review+close: **13,381** proxy tokens.
- Claude bind+review+close: **13,482** proxy tokens, only 18 beneath the legacy 13,500 ceiling.

Those are current retained-file costs, not an irreducible floor for replacing those files. Neither their legacy green exit nor the older comment values establishes §20.2 acceptance.

Appendix A.1 now preserves the exact executable synthetic planning probe. Retaining the current shim and candidate minimal protocols gives static counts of **833 Codex / 840 Claude**. Sixteen illustrative request/response/receipt/action-command exchanges add **4,488**, totaling **5,321 / 5,328**, beneath 5,600 but with little room. Sample first-expanded clean/blocked responses are **239 / 273**. A 32-blocker stress response is **1,319**; the ratified representative-fixture budget does not authorize truncating that case.

I do **not** claim this is production feasibility proof or a mathematically irreducible minimum. It uses one synthetic observation and does not establish the actual resource cardinality, obligation completeness, or all mutation-result/diagnostic traffic. The one-token clean margin is a reason to investigate early, not to declare success. The plan labels the result **investigation-go only**. Task 1 Step 0 must replace those assumptions with the inventoried authority/obligation/output model and fixed schedule. Extraction Tasks 2–15 are no-go until those counts meet the unchanged working limits. A failure requires manual plan/spec disposition before further implementation; ceilings cannot be raised locally. Task 12 repeats the gate against actual serialized CLI output before documentation migration.

This addresses sequencing without pretending that a handwritten skeleton can replace the later real-transcript contract. Please assess this early gate in round 2; the implementation feasibility risk remains explicit, not administratively declared resolved.

### R1-02 — Result data replaces mutable context

Confirmed in `scripts/task-tracker/lib/guard-registry.mjs:165-176`: `finish()` already returns `derived`, then calls `Reflect.set` on `ctx`. Confirmed the consumer in `verbs/promote.mjs:441` reads `guardCtx.refinementPlan` before passing it to `applyRefinementEstimate` later in the verb.

Task 2 now removes that write-back and migrates the consumer in the same change to the final `guardResult.derived?.refinementPlan`. The frozen-input regression must prove the returned plan reaches the post-success consumer and that the context remains untouched. No unfrozen write-through channel is introduced. The review's nuance is correct: `Reflect.set` itself returns false on a frozen target; it does not throw merely because the module is strict.

### R1-03 — Effectful guards cannot run unchanged in explanation

Confirmed a concrete effect path: `commitsOnTrunkGate` in `lib/close-gates.mjs:217-263` calls `fetchTrunk`, which calls `git fetch` in `lib/trunk-ref.mjs:134-158`. `invoke()` in `guard-registry.mjs` also catches errors and currently reduces them to prose refusals. A throwing effect port alone therefore cannot prove an effect-free evaluator.

Task 1 now inventories transitive guard effects. Task 2 permits pure computation and explicit read-only observations only. Its harness records attempted effects before throwing and asserts the independent ledger outside guard exception handling, including a deliberate violation test. Production names forbidden effects as indeterminate; positive ready-path conformance tests prevent "every guard blocked" from looking like successful extraction.

For attribution, the plan requires fresh remote-tip observation and the same message-attribution predicate over an available complete local object graph at that exact tip. `ls-remote` alone is insufficient. Missing objects, shallow/incomplete history, remote failure, or unsupported ref resolution yields named indeterminate status; explanation cannot fetch or use stale remote-tracking authority. Execution retains its refresh outside the pure predicate and must not treat failed remote refresh as current evidence. An alternative GitHub traversal requires complete pagination and equivalence tests.

I did not select the suggested cached-observation alternative: spec §§5.2, 13.3, and 20.3 prohibit retaining live authority across boundaries. Disposable guidance-cache writes are explicitly separate from action-evaluation effects.

### R1-04 — Transport preserves typed refusals; legacy branch identity is not invented

Agreed: current `invoke()`/`consume()` drops any future typed fields, and branch identity cannot be reconstructed from guard ID plus prose. Task 1 now explicitly extends both layers to preserve/validate typed code and disposition, including multiple typed refusals, while keeping legacy strings diagnostic-only. Thrown/malformed results receive typed contract failures before legacy adaptation.

Task 1 does not convert all existing guard implementations. Its static inventory fingerprints every legacy branch and allows one conservative `unclassified-refusal` disposition per registered guard only while all its branches remain inventoried and unchanged. `siteId` belongs to the lint inventory, not the runtime normalizer signature. Tasks 4–8 migrate producers by family and emit distinct codes at the actual refusal branches. New/changed branches cannot expand the legacy allowance. No reason parsing is introduced.

The real bootstrap is **`scripts/task-tracker/lib/state-bootstrap.mjs`**, not `scripts/task-tracker/state-bootstrap.mjs`. It walks `scripts/task-tracker/states/*.mjs`; `lib/guard-bootstrap.mjs` is the compatibility shim. The plan now names those owners and their roles correctly.

### R1-05 — Required-read skips versus configured applicability

Confirmed `TT_SKIP_NETWORK=1` returns `ok: true` with `skippedNetwork` at `verb-preflight.mjs:142-144`. Task 4 now requires a named `authority-read-skipped` indeterminate decision when required observations are absent; shared v1 execution cannot turn that absence into readiness. Offline fixtures must inject complete evidence. Failed required board/marker/config observations are covered as well.

I disagree with making **every** `gateAssigneeMatch=false` invocation indeterminate. The code at lines 163–164 makes that check conditional on project configuration, and the alternative branch at lines 215–227 still reads live board state. A deliberately disabled optional predicate is not a failed required read. Blanket refusal would change existing configuration semantics rather than preserve evaluator/executor equivalence.

The plan records effective configuration as an observation, marks that predicate inapplicable, and checks parity in both modes. Other independently required ownership/board/body checks still apply. If the assignee predicate is enabled and its required evidence is missing, the decision is indeterminate. This is the distinction requested by spec §§13.2–13.4; no skipped check is reported as passed.

### R1-06 — Parser API verified before dependent work

After restoring this worktree with its lockfile, `node_modules/js-yaml/package.json` reports **5.4.2**. Its ESM exports include `parseEvents`, `getScalarValue`, and `constructFromEvents`; the event objects retain scalar value ranges, style, anchor/tag ranges, and alias events before construction.

Appendix A.2 preserves the executed probe: six raw/decoded scalar/collection forms, three newline variants, accented/combining/non-BMP text, duplicate keys, forbidden syntax visibility, and repeated construction determinism. It passed. The selected exact production version is recorded now. Task 9 must remove the development declaration, add exact `dependencies.js-yaml = "5.4.2"`, regenerate the lockfile, and prove the full validator contract. Parser/version identity and a single instrumentable parse adapter are explicit inputs to Tasks 10–11.

The original dependency ordering already put Tasks 10–11 after Task 9, so a Task 9 failure did not require invalidating completed downstream work. Nevertheless, early selection removes uncertainty before hydration. A later full-contract failure now reopens this gate and manual review; it is not an invisible fallback. I have not claimed that the selection probe implements or proves a complete field-path mapper or semantic normalizer.

### R1-07 — Preserve the sanctioned derived-evidence minting boundary

Confirmed `functional-dod-derive.mjs:66-77` passes `evidenceStamp: true`, and `issue-body-mutate.mjs:97,156-161` defaults it false and gates proof introduction. Task 3 now preserves the literal execution-only flag and requires both a positive injected-write assertion and a negative omission test against the real proof-introduction check.

The option cannot be supplied through the catalog, remediation, caller decision, or explanation dependency surface. Other pre-existing sanctioned minting sites are unaffected; the restriction is on this new normalization pipeline, not a claim that the whole repository has only one legitimate writer.

### R1-08 — Enumerate the real admission surface and retain a split gate

The concern is stronger than the cited 21-entry cursor map suggests. Runtime enumeration of `bin/aitm-registry.mjs` gives **72 verb/alias tokens and 21 standalone/router tokens**. Task 10 now lists them by family, plus numeric binding, installer subcommands, recovery exceptions, direct supported maintenance entrypoints, and internal-boundary classification.

The proposed `admission-surface.json` maps each route to entrypoint/imports/first effect/gate/fixture. A new unclassified route fails CI. Seven v1 explanation actions and the much broader admission surface are explicitly different sets. Shared dispatch can amortize gate implementation, but each actual route still needs evidence that it cannot get ahead of the gate.

I chose the requested enumeration option. If its grounded Refine estimate exceeds the atomic limit, Task 10 must split into source/trust/recovery admission and entrypoint/annotation integration children before implementation, with a revised pinned WBS. B1 is incomplete until both deliver; enumeration is not a sizing waiver.

### R1-09 — Preserve non-v1 actions without invented readiness

Accepted. The registry returns twelve descriptors: current nine plus bind/resume/deliver. Existing refine/demote/shelve/park/cancel-plan execution policy remains intact; their evaluators are null/pending. Explicit explanation returns indeterminate with `action-not-explain-ready` and a manual disposition. Truly unknown IDs instead return `unknown-vocabulary`. Both are tested; neither recommends execution.

### R1-10 — One scoped budget source, distinct measurement subjects

Accepted that the legacy tables need explicit migration. Tasks 14–15 now introduce shared `context-budgets.mjs` constants and replace overlapping in-scope literals in both tools. Static invoked-plus-pickup has 5,000/4,000 ceiling/working maximum; the static lifecycle instruction subset has 7,000/5,600. The captured whole lifecycle must independently meet the same total ceiling including dynamic/input traffic. Unrelated idle/parallel scenarios stay separately labeled. Tests prove both applicable consumers reject an over-limit shared fixture.

I disagree with the claim that the original VC15 chain could report aggregate green while its final harness returned nonzero: shell `&&` preserves that failure. The actual defect was potentially misleading legacy-only green output and drifting duplicated limits. Also, static text and captured transcripts are intentionally different subjects under spec §20.2, so retiring the static tool or giving every static scenario the exact same measurement meaning would be wrong. Both remain necessary; static green alone is never acceptance.

### R1-11 — Canonical lifecycle module ownership

Accepted. The file owners now identify `executable-transitions.mjs` for `forwardTarget`, `states.mjs` for state identity/normalization, and `index.mjs` for re-exports. Task 4 names the import origins. No new state walk is created.

### R1-12 — Historical recovery remains explicit

Accepted. Task 7 names `validateHistoricalRecoveryPreflight` and preserves it as execution authority for the existing explicit recovery/reconcile lane. Default delivery explanation does not suggest that lane. Until its collector has parity evidence, a query for that variant is not explain-ready and cannot yield a recovery command from prose.

### R1-13 — Migration freeze coverage

Accepted. `verb-preflight.mjs:129-137` returns `migration-freeze` before network reads. Task 4 now includes a global freeze fixture, preserves mutation exit 14, and tests a freeze appearing between explanation and execution. Both consumers must observe the same applicability; it cannot be omitted because it lives outside the transition guard registry.

### R1-14 — Base item flags and progressively transformed body

Accepted as an explicit preservation requirement. Task 3 now says to parse item checked/marker flags once from base, then derive acs and checkboxes against progressively transformed next. It adds fixed-HEAD/timestamp characterization for stamped-but-unticked and related staged cases. This specifies compatibility rather than assuming every conceivable reparse would necessarily produce different bytes.

### R1-15 — Rebinding behavior is covered; a cursor label is not a CLI command

The request to clarify scope is accepted. The premise that `bind`/`rebind` have route identities is not supported by the executable registry: `routeIdentityForVerb('bind')` and `routeIdentityForVerb('rebind')` both return null, and neither is in the 72-token `VERBS` set. Their presence in `CURSOR_TRIGGER_BY_COMMAND` does not register a command.

The plan now defines semantic `bind` to cover cold binding and switch/rebind behavior through actual numeric/start/resume paths, tested through the bind adapter. It adds no `verbs/bind.mjs`, no separate rebind action, and no invented CLI alias. `explain --action rebind` is unknown vocabulary. Admission still covers the actual binding/callback effects wherever the executable entrypoint inventory locates them.

## Verification and preservation

- Ran repository-owned `scripts/dev-env/setup-local-worktree.sh`: lockfile dependencies installed, self-link repaired and verified, Node 26.8.1, GitHub CLI authentication available. No tracked package/lockfile changes. npm kept the Puppeteer install script blocked under existing policy; it is unnecessary for these checks.
- Executed both static measurement commands and both Appendix A probes, including re-extraction/execution from the formatted plan. The output agrees with the numbers above.
- Ran existing `guard-registry-entry-fields.test.mjs`, `review-derive-rescan.test.mjs`, and `lifecycle-policy.test.mjs`: **24 tests passed**. These confirm the inspected baseline seams, not the future implementation's 15 verification groups.
- Checked plan formatting, scoped Markdown lint, task/VC/AC linkage, and the review dispositions before commit. No implementation or backlog hydration was performed.
- Preserved the reviewer response byte-for-byte at its supplied digest and the ratified design at its accepted digest. This commit contains only the revised plan, that reviewer response, and this author response.

For round 2, please focus on the early context gate's assumptions, the guard result/effect isolation contract, the legacy-inventory migration boundary, and the optional-gate/cursor-identity qualifications. Dependencies are now available in this worktree for your shell-backed investigation. Manual orchestration remains in effect; no peer-review skill or managed reviewer was invoked.
