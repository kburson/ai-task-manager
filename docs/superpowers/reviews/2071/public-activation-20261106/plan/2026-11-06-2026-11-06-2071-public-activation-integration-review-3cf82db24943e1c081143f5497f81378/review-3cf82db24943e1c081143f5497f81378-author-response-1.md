<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "ccc4d7582f5fcb58084ceabadae547ce12239d36"
artifact_blob: "4f9b48c225f0bddc9035857c5a58e0bfa3e2f758"
artifact_digest: "sha256:4a2b08cb75d344a77888429ca39645814683e45c1fe419316241944dca80d6f7"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
  identity_source: "runtime"
started_at: "2026-11-06T12:07:15.992Z"
submitted_at: "2026-11-06T12:27:03.279Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the design in response to all ten R1 findings and the coordinator's direct sizing/test/provenance review. The first draft did not support ordinary proof and human-approval flows across CLI processes. This revision specifies independent native issuance evidence, working contract chains, explicit conflict reconciliation and nonvacuous verification. It also makes mandatory decomposition and dual-lineage provenance an explicit pre-implementation gate. This is docs-only, not implementation or native gate acceptance.

## Finding dispositions

- R1-F001 — Addressed in Durable native issuance and Task 2. NEW native-operation-evidence records every actual stamped verifier, including node --test, independently of suite-cache eligibility/pruning. Original timestamps/source are retained. A source-changing commit correctly makes old proof stale; one genuine restamp at the new source persists across the next process. Integration covers both same-source success and that commit/restamp path. Old proof never attests an unexecuted new HEAD.
- R1-F002 — Addressed through approval-issued native evidence in the same fixed producer/persistence mechanism. Preserve K's actual human/Full-Auto admission semantics; record actual issuance rather than claiming cryptographic human consent. Same genuine issuer/session rebinds exact approved scope in another process without reapproval. Missing/foreign/stale issuance refuses, and a genuine renewal now produces durable evidence instead of looping. Both ordinary human command sequences have physical integration tests.
- R1-F003 — Addressed in Contract B: current head, predecessor, records, projection and replay derive from the working view including staged capsules. Admission requires complete bounded capsule ancestry; no 1970-since fallback. Added demote's directory-written consumer explicitly and staged-to-staged replay/chain coverage.
- R1-F004 — Addressed in Conflict and explicit three-way reconciliation. The existing O transition-journal contains the package at the exact cited hunks. New reviewed reconciliation recomputes neutral deltas and native privileged authority, preserves old generations, refuses unresolved attempted effects and commits accepted baseline/operations atomically. Added explicit issue-body conflict-resolution purpose and remote UI edit test.
- R1-F005 — Addressed: seed uses separate --evidence-file and x.json tokens, matching K parser.
- R1-F006 — Addressed: ledger counts provider attempts only, retains process IDs and asserts zero staging traffic on the actual staging process. Local storage operations are not counted as cloud calls.
- R1-F007 — Addressed and elevated by coordinator review: this exceeds native mandatory decomposition. Revised scope including missing native issuance/conflict work is 33–44h, provisionally allocated to eleven 3–4h causal units. These are proposed units, not created issues or final child approvals. Any oversized unit must be further bounded, not disguised as 4h.
- R1-F008 — Addressed: optional ctx.storyCache seam is explicitly O behavior; K lacks it.
- R1-F009 — Addressed by the per-unit estimate/dependency table and required reviewed decomposition. The nine design packages are not nine executable issue assignments or authorization under the stale S/4h assessment.
- R1-F010 — Addressed: O-specific references carry O; historical object expressions remain pinned. Reviewer did not independently inspect O/H, and this response makes no claim that it did.

Additional coordinator findings incorporated through this ordinary author revision (not an out-of-band supplement):
- Physical subprocess/native host/evidence-runner/Git/handoff tests are integration-only. Unit helpers are pure/in-memory; genuine proof cannot be simulated by permission objects.
- Export/import checks are smoke only. Prerequisite red oracles assert working-generation preservation, foreign-claim refusal and published-view authority.
- Native Task headings now use the parsed Task 1 grammar; ccc's no-space headings were not an executed native nine-task count. Separate child plan must have Story Intent blocks and actual executable verifiers before any split-plan action.
- Dual lineage is explicit: decomposition path shares Source-plan-commit, and outer WBS compares full source bytes. Proposed separately authorized carrier based on J preserves the exact outer plan and adds the new inner plan under one commit. It is not yet created/admitted. Exact selection/WBS/native authority qualification remains a Phase6 blocker, not an implementation TODO.
- A distinct-path outer-plan copy is not accepted by the current exact-path WBS rule. The proposed J carrier is additionally conditional on actual native title conversion/convergence: helper behavior alone is not an executed command effect; a forced BUG-to-Epic rename would also need sanctioned outer-WBS reconciliation preserving closed-child bindings. No manual title restore or closed rebinding is proposed.
- Parent current-scope Plan approval is not promised: live children make that lane unsupported. A converted epic can remain Develop under native recovery; every new leaf needs real Plan/approval. No metadata, kind, estimate, source ref or graph has changed.

## Changes made

Added durable native issuance and reconciliation contracts, source ownership rows and truthful persistence/authority limits. Updated working-chain and replay semantics, test boundaries, seeds and estimator arguments. Added mandatory sizing/decomposition and source-compatible carrier analysis, with explicit actual-authority blockers before Phase6. The original Task30 atomic public delivery, parent route, original provenance and #2145 edge remain requirements.

## Declined changes and rationale

No finding was declined. R1-F001's intervening-commit case does not accept an old run as proof of a changed source: it retains that history, refuses stale authority and requires one genuine new-source stamp. This preserves the existing exact-source contract. No new human prompt, cryptographic consent assertion or automatic approval replay was added.

## Verification

Read actual K native producer, verifier-cache, runtime-storage, decomposition selection, parser and WBS comparison sources; read the exact O journal conflict hunks through ordinary pinned Git object reads. Prettier checks and git diff --check are run on the documentation revision before protocol submission. No product tests, native classification, split-plan dry run, metadata write, source import, implementation, Test/Review lifecycle or graph mutation was performed. XPR remains the existing normal-mode six-round review. Historical O/H source assertions remain author-qualified inputs, not reviewer-confirmed source acceptance.
