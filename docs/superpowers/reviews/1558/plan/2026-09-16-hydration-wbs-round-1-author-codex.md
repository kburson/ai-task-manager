# #1558 Hydration WBS — Round 1 Author Response

**Role:** Codex, author response and revision; Sol5.6 drafted the original WBS. Claude is the independent reviewer. Manual orchestration only.

**Disposition:** Revised for re-review. All six blocking findings are accepted in substance. Task 10 now splits, producing **26 children**, not 25. No agreement, hydration, runtime implementation, or feasibility is claimed.

## Reviewed inputs and revised artifact

| Artifact                 | Identity                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round-1 WBS              | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs.md`; SHA-256 `0d86d3af4be89c21a599520ed767a10f19be673f79ade851b2ff33e4de063422`; preserved byte-for-byte                                                                                        |
| Reviewer response        | `docs/superpowers/reviews/1558/plan/2026-09-16-hydration-wbs-round-1-reviewer-claude.md`; received SHA-256 `f1ca96e9a349ddaa3e88b84c4735465cbed841edacfd1299d4fb985e9e12a040`; formatted committed SHA-256 `71f21146eda63dc5adc1606f5aeff09db38cd8bf86ad7c61a222a95747a5f9f1` |
| Revised WBS              | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r2.md`; SHA-256 `bc58ab2116b1f0f86acbf3b37e5052dca5c65686670b41088c319bd1b3a09f82`                                                                                                              |
| Artifact commit          | `f4970b17a8296d789f220fb020aa59ff101cc54a`                                                                                                                                                                                                                                    |
| Unchanged technical plan | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`; SHA-256 `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`                                                                                                                   |
| Unchanged ratified spec  | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; SHA-256 `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`                                                                                                                        |
| Baseline commit          | `a168753999617066d98bbc1227c4b5d97fa531c5`                                                                                                                                                                                                                                    |

The original untracked WBS passed direct formatting unchanged and is now preserved alongside revision 2. The reviewer response needed Prettier normalization; findings, code examples and conclusions were not rewritten. The original received response remains in the source checkout; the two digests distinguish its received and formatted bytes. One spelling dictionary entry, `disambiguator`, preserves the reviewer's wording while allowing the normal lint checks.

Review and revisions live on `codex/1558-hydration-wbs-review` in `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager`. The other checkout's untracked originals and trunk branch were not edited.

## Blocking findings

### H1 — Accept: allocate explicit child ACs

Revision 2 gives every split child its own user story, scope/files, boundaries, estimates, test behavior, explicit ACs and verifier. There are now twelve split children because Task 10 also splits. The AC allocation table partitions all original criteria for Tasks 1a, 1b, 10 and 12 by behavior, distinguishing implementation ownership from final aggregate certification.

The formerly indivisible 1a AC2 is assigned to WBS 2 for physical interception/custom-promise/escape/package proof and WBS 3 for coherent authority, unchanged predicates and positive lifecycle-request reconciliation. WBS 4 certifies their composition through VC1. Equivalent explicit partitions cover candidate semantic execution versus measurement and source trust versus route integration. Siblings do not inherit a whole-parent criterion that depends on future work.

### H2 — Accept: use a numeric expanded source plan

Confirmed all three mechanisms in `decomposition-policy.mjs` and `decomposition-wbs-coverage.mjs`: original 1a/1b headings are omitted, duplicate original headings reject split claims, and titles must equal heading titles. Merely adding Source-WBS fields cannot fix this.

The selected remedy is a new, explicit hydration-plan revision: this WBS becomes the accepted `Source-plan` if the human accepts it. It has unique `### Task 1:` through `### Task 26:` headings and exact title equality. Each task records the original plan section separately as `Baseline-plan-section`. Parent metadata selects this revision too. The agreed technical plan and spec remain unchanged; no reconciler code change or waiver is introduced.

Fourteen retained technical task bodies are copied unchanged, including their exact original verifiers. WBS 9 additionally has the GO entry criterion and VC27. Original Task references in copied bodies explicitly retain baseline numbering. Task 17's heading title governs. The embedded post-hydration command calls the existing extractor and reconciler and requires 26/26 before independently checking live fields and native edges.

### H3 — Accept the containment defect; keep the feasibility issue open on NO-GO

Revision 2 distinguishes completed **measurement** from completed **issue**. WBS 8 may commit honest NO-GO accounting with VC18 green, but its GO closure criterion stays unchecked and VC27 fails. It remains OPEN in Develop on the planned path. Every runtime child directly depends on that open issue, in addition to its original technical predecessors. No completion edge can therefore be satisfied merely by green accounting.

WBS 9 independently verifies pinned decision/input identity and reruns VC27 before runtime entry. The hydration procedure preserves all blockers if it resumes after NO-GO. Closing/canceling the feasibility child as not planned is expressly prohibited as a workaround.

I did not adopt a Develop-to-Backlog `shelve`/`park` procedure: `lifecycle-policy/actions.mjs` allows those verbs only from Refine/Ready for Planning. No state change is needed for a NO-GO found during Develop verification. If detected later, the issue stays open; a return to Develop uses `demote --rework` only when real candidate code changes justify it. These are existing workflow mechanics, not a newly implemented hardcoded feasibility guard.

### H4 — Accept: separate admission capabilities and install release refusal first

WBS 20/12a owns source profiles, trust selection, the admission API, the single recovery classification, release identity/assets and the B2-absent release refusal. VC26 runs new source/trust and negative release-refusal suites plus existing package-boundary checks. Proving that release is refused is a passing negative-path test; it does not require B2 to exist.

WBS 21/12b owns the complete `admission-surface.json`, all canonical/alias/direct route wiring, the unclassified-route CI gate, serialized annotation, downstream installation/init and aggregate certification. VC12 remains the original aggregate command and exercises source/trust plus complete route coverage. There is no arbitrary “first half” of an inventory or competing recovery allowlist.

The B2-absent release assertion is installed in 12a, before any loader-adjacent merge; 12b extends it, and Task 13 satisfies it through actual certification. B1 remains incomplete until both admission children land and cannot ship without B2.

### H5 — Accept: serialize harness work and state ownership

WBS 1 → 2 → 3 → 4 is strictly serial. WBS 2 owns initial CLI/preload/transport modules, `captureLegacyWorkflow`, interception and physical-ledger tests. WBS 3 owns the authority/store helper, lifecycle fixtures and authority tests; it extends the launcher to consume them without redefining interception symbols. WBS 4 introduces the aggregate baseline suite and freezes the runner generation.

VC19/20/21 are stage-specific inventory, transport and authority checks. The complete original VC1 belongs to WBS 4. An early transport proof uses explicit local request/response fixtures; it does not claim completed lifecycle-authority coverage before WBS 3. The later measurement task consumes WBS 4's frozen generation and extends the WBS 2 runner.

### H6 — Accept: define units, derive counts, and split Task 10

A counted unit is a distinct capability or independently rejectable certification deliverable. RED, implementation, GREEN and commit phases are not separate capabilities. Revision 2 enumerates each counted unit and allocates its hours; it does not equate units with AC count or Step count.

Task 4 remains three units: immutable observations, full two-pass evaluation, and the atomic derived-result/promote migration. Task 8 remains three: complete preflight, evidence-dependent navigation, and direct/delegated integration certification. Both receive explicit retention decisions and scope-growth stop conditions.

Task 10's close readiness/navigation work is distinct from the aggregate seven-action conformance and authority-cost/residual-inventory certification. I agree that four substantive units are present. It now splits into two 16-hour/two-unit children, and downstream dependencies wait for aggregate completion. Task 12's six capability units are separately derived; its estimate increases from 40 to 44 hours, with the narrow remaining margin and mandatory early re-estimation made explicit. These are planning estimates, not measured labor or changes to context budgets.

## Remaining findings and suggestions

| ID  | Disposition and change                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Accepted. All ten resulting children meeting the review threshold have an explicit retention decision; all remain below both mandatory split thresholds.                                                                                                                                                                                                                      |
| M2  | Accepted. At Refine and before expanded scope, 24 hours, a fourth unit, unknown sizing or a changed boundary stops execution for reviewed re-decomposition. The 22-hour admission estimates explicitly disclose their two-hour margin.                                                                                                                                        |
| M3  | Accepted. Task 10 splits; aggregate parity/cost certification has its own owner and completion gate.                                                                                                                                                                                                                                                                          |
| M4  | Accepted as an estimate concern, not proof of a particular duration. The revised 44-hour estimate names source/layout, recovery, release, full-route integration, annotation and certification units; it assumes registry-driven enumeration and parameterized coverage, with early re-sizing if distinct effect boundaries exceed the envelope. No route coverage is waived. |
| M5  | Accepted. Use `npx aitm block ... --by ...`, numeric WBS rank, explicit current parent priority and unset assignee. Verify readback; creation itself does not write dependencies or inherit priority.                                                                                                                                                                         |
| M6  | Accepted. Active Source-plan metadata points at the unique numeric revision; all provenance fields belong under Plan Metadata. Source-WBS fields are documentary, not checker inputs.                                                                                                                                                                                         |
| M7  | Accepted. Harness siblings are serialized; redundant candidate edges are removed. Direct GO dependencies on every runtime child are intentional, separately explained constraints.                                                                                                                                                                                            |
| M8  | Accepted. WBS 4 owns Task 1a Step 5 and the frozen input generation; WBS 2 owns the runner, WBS 3 its scenario integration. Later tasks consume the complete WBS 4 generation.                                                                                                                                                                                                |
| S1  | Adopted. A full create-issue invocation includes required story/scope/AC/origin fragments, metadata, verification commands, rank and priority, beginning with a dry run.                                                                                                                                                                                                      |
| S2  | Adopted. Bare fragment content, renderer-compatible AC lines and rendered-body readback are required; no duplicated section/checkbox wrappers.                                                                                                                                                                                                                                |
| S3  | Adopted. Investigate duplicate-child refusals and reuse only a proven matching existing child; no blanket override.                                                                                                                                                                                                                                                           |
| S4  | Adopted. Exact numeric-heading title governs, including “certify the consumer release.”                                                                                                                                                                                                                                                                                       |

## Additional investigation and verification

The current `fetchEpicChildren` path enriches open children using refinement snapshots. It can flag newly created Backlog children as lacking current refinement evidence. Running the full materialized delivery-readiness check at hydration would therefore conflate two stages. Revision 2's read-only command fetches complete native sub-issues, raw project fields and native dependency edges, calls the existing coverage reconciler, and separately verifies the hydration contract. Later Plan-exit still uses its normal unmodified refinement/branch gates.

Verification performed before artifact hashing/commit:

- The shipped extractor discovers 26 unique numeric sections, each with runnable command declarations; section selection and synthetic claim reconciliation pass 26/26.
- Executed the document's exact embedded coverage-command body against offline Git/GitHub/project fixtures. Its positive case passes; thirteen negative cases reject missing children, duplicate claims, wrong title, old heading, wrong commit, missing GO dependency, wrong rank/state/priority, assigned size/estimate/owner, and unreadable dependency edges.
- All fourteen retained baseline task bodies compare exactly after formatting. Baseline plan/spec hashes remain unchanged; the original WBS input remains byte-identical.
- Direct Prettier and Markdown lint bypass ignore exclusions for every authored/reviewed document; scoped spelling checks pass. `npm run format:check` and `npm run lint` passed for the artifact revision; this author response additionally passed direct formatting, Markdown lint and spelling checks before its separate commit.

No future implementation verifier was run or claimed green. The offline 26/26 fixture is a representation check, not evidence of created GitHub children. No issues, states, native edges, runtime source or context budgets were changed. No push or PR is part of this review handoff.

## Requested next review

Review revision 2 at the artifact commit above. In particular, check the new numeric authority mapping, open-issue NO-GO hold, Task 10 split, child AC allocation, early B2 refusal and the executable hydration coverage command. The proposed fixes remain subject to your agreement; this response does not close your findings unilaterally.
