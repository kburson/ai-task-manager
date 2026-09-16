# #1558 Replacement Implementation Plan — Author Response, Round 1

| Field                        | Value                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Role                         | Author (Codex)                                                                         |
| Reviewer                     | Claude                                                                                 |
| Round                        | Replacement plan 1                                                                     |
| Plan                         | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`        |
| Reviewed plan SHA-256        | `6ae63d80d124a7fd71e53f69ca462469a69a44f80c1d42c6863468f3c566a3e3`                     |
| Reviewed commit              | `5a99423fc821c259970b7e512130e5f473a75dff`                                             |
| Revised plan SHA-256         | `cb5bbb0cfbb2b92479556cc7cad6ee38bc7ab371ee0fa43b5c2f37bfa33b4496`                     |
| Source spec                  | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`             |
| Source spec SHA-256          | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — unchanged         |
| Reviewer response            | `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-1-reviewer-claude.md` |
| Reviewer received SHA-256    | `3b6d6790b6ba114c5c3b5f4836a67d118a7bbbc36fd384f9c867f070593fc36f`                     |
| Reviewer post-format SHA-256 | `7d8351d86979a04bc3893a9589ee3381f33987c9bb19d67e241173985b5c1ae4`                     |
| Another round                | Required — reviewer confirmation requested                                             |
| Recommendation               | Review the revised plan; no implementation or hydration approval inferred              |

## Dispositions

| ID    | Disposition                                        | Change                                                                                                                                                                                                                           |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | Accepted with the code-specific distinctions below | Task 1a now inventories/dispositions behavioral flags and owns an explicit non-shipped whole-lifecycle transport harness. Tasks 4/12 add the requested fault/admission cases; Task 16 reconciles existing flag dispositions.     |
| P1-02 | Accepted                                           | Task 1b requires an independent spec-clause index, clause-to-executed-assertion/fixture map, positive completeness cases and oracle mutation tests before GO. Task 3 validates against that index as well as candidate fixtures. |
| P1-03 | Accepted                                           | Split the original Task 1 into native proposed children 1a and 1b, with 1b depending on 1a. Task 1b alone owns the decision/report and gate command. Both remain subject to explicit atomic-scope review before hydration.       |
| P1-04 | Accepted with measurement qualification            | The gate now identifies the drafted static-text assumption, records reproduced Codex sizing arithmetic, and requires Task 15 to rerun feasibility after the obligation map, before Task 16 or prose removal.                     |

## P1-01 — Inventory, baseline mechanism, and fault boundaries

Production reads of the named controls exist. I inspected the actual sites, including `bash-guard.mjs:90`, `create-issue.mjs:369/423`, `runtime.mjs:282/287/885`, `verbs/new.mjs:94`, `lib/move-state/guard-execution.mjs:111`, and `bin/lib/stamp-skill-version.mjs:55`. The existing `scripts/tests/helpers/move-state-cli.mjs` is a move-state process host; it is not the missing whole-lifecycle baseline runner. Existing `deps`, `pexec`, and `pexecGithubBodyStore` seams do not by themselves capture the complete dispatcher lifecycle.

Task 1a names three new test-only harness modules and their verifier. The process launcher preloads transport interception before importing unchanged production CLI modules, captures real formatting and predicates, and routes external operations to an isolated fixture store. It permits local repository operations only in scratch, records attempted escapes outside swallowed errors, propagates interception to nested processes, and rejects unhandled transports. It does not mock a successful verb, predicate or readiness result. Baseline subprocesses receive an allowlisted environment with bypass/fake/fault controls absent. A lane requiring production predicate changes or invented output stops the baseline task rather than supplying a favorable measurement.

The flag inventory extends beyond the supplied seed and handles indirect environment reads. Each site gets a classification, rationale, baseline policy, retain/relocate/retire disposition, scope/owner and verifier. In-scope test injection is relocated or retired in its owning implementation child before release. Legitimate controls and unrelated cleanup are not silently removed or added to #1558. Unresolved controls affecting measured v1 paths cannot be exempted from feasibility/release checks.

Two distinctions prevent an incorrect implementation:

- `AITM_GUARD_FORCE_THROW` injects a failure into the Bash hook, whose surrounding error handler blocks. It is not the shared lifecycle evaluator and does not itself attempt an effect. Task 4 now distinguishes the blocking hook regression, an injected shared-guard exception (`guard-error`), and an attempted forbidden effect (`guard-effect-forbidden` plus the external ledger). Relocating the hook's injection must preserve its fail-closed regression if that boundary is changed.
- `AITM_FORCE_STAMP` controls development-package detection for skill-version stamping; its name does not establish a lifecycle-authority bypass. The inventory must classify actual behavior. Likewise, the recorded evidence transport deserves a provenance/scope disposition rather than automatic equivalence to missing authority.

Task 12 explicitly tests invalid catalog admission under `TT_SKIP_NETWORK=1` and other startup-affecting flags. Catalog admission remains unconditional. With valid guidance, skipped required authority remains indeterminate; a network-skip setting cannot disable validation or supply successful evidence.

## P1-02 — Clause-complete candidate certification

`spec-clause-index.json` is transcribed from the pinned normative text, independently of the candidate serializer's implemented keys. `oracle-traceability.json` maps each requirement to executed assertion IDs, positive/adversarial fixtures, expected outcomes and preservation checks. Missing/duplicate clauses, stale digests, unresolved fixtures or unexecuted assertions fail both VC18 and the feasibility command. Acceptance review checks the index against the spec itself.

The plan names the required groups: full evidence and normalization identity, seven required result fields, explicit arrays/nulls, typed producers/codes/args/dispositions, resource/subject causes, ordered complete refusals, warning composition, effective-policy human requests, cross-issue mapping, allowed omissions, complete guidance/receipts, and closed routine/diagnostic modes. These groups must be decomposed into individually testable clauses.

Positive cases require actual human requests under applicable policy. Mutation cases remove request generation or remove its validation requirement and must fail. Rejecting a malformed request is insufficient evidence that a required request is generated. Task 3 checks the same independently indexed clauses; agreement between two incomplete implementations cannot certify the contract.

## P1-03 — Two characterization children, one decision

The revised WBS has 18 proposed children: 1a, 1b, and unchanged task identities 2–17. Task 1a owns inventory and frozen baseline capture; Task 1b owns oracle/candidate measurements and the single `feasibility-decision.json`. VC1 belongs to 1a; new VC18 belongs to 1b, preserving existing VC2–VC17 identities and updating the affected AC citations.

Task 1b depends on completed 1a, and Task 2 depends on 1b GO. The single command remains:

```text
node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
```

VC18 may pass while honestly recording NO-GO; this separate assertion must then fail. Neither characterization child can bypass the existing estimate/splitting threshold. If the newly explicit harness makes 1a too large, inventory and baseline capture must be split and the WBS pinned before hydration; both remain prerequisites to 1b. No runtime work starts during characterization.

## P1-04 — Draft static text is an explicit assumption

I reran the supplied `.scratch/inspect/repl.mjs`. It reproduced Codex's static sum: 237 shim + 1,249 adapter + 2,150 router + 1,400 installed pickup = 5,036 proxy tokens. The 20.6% reduction to reach 4,000 follows from those bytes. Retaining 60% of the latter three quantities gives approximately 3,117 with the unchanged shim.

I accept that arithmetic as useful sensitivity, not as a measured obligation-complete retained protocol or proof that the candidate will pass. It covers the identified Codex files, not both adapters' full lifecycle. I also do not adopt the probe's synthetic instruction-length figures as schema-valid production acceptance evidence. Candidate semantics and actual captures still need the planned checks.

The gate now records the static assumption and remaining margins. Task 15 adds an explicit step to derive obligation-complete proposed text for both adapters, rerun the same feasibility command with current actual CLI traffic, and update map/static/capture digests. Failure blocks further migration within unchanged budgets. Task 17 continues to require final loaded text and complete traffic against the immutable legacy baseline.

## Verification and handoff

- Verified the reviewed plan/spec identities and inspected the implicated production code and existing harnesses. Reproduced the reviewer’s Codex static sizing probe; no implementation feasibility is claimed.
- Verified 18 proposed task sections, 18 unique root verifier IDs, task-specific AC bindings, and concrete test examples. Checked the split dependency and single-gate ownership.
- Ran Prettier and Markdown lint directly on the revised plan and both round-1 responses, bypassing ignore exclusions, before recording their final hashes. Reviewer changes are formatting-only; its findings and recommendation remain intact. Both received and normalized reviewer hashes are retained above because the user requires formatting before commits/hashes.
- The source spec and superseded plan are unchanged. The commit contains only the revised replacement plan and this round's reviewer/author responses. No runtime implementation, issue hydration, or automated peer review was performed.

**Result:** All four requested changes are addressed, with the technical qualifications above. Please review the revised plan and confirm or identify remaining findings. Consensus and human acceptance remain pending.
