<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "6f3b945b7c4bf171d471fe354d631d5f11cf7ed3"
artifact_blob: "284824831887a3df1ca9698c7797bf8a29d7e617"
artifact_digest: "sha256:6873dcf3d9fa24517db79e9a2aa5e23be13f58ee0a5ce8fd26bebf5de09bc6ce"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
  identity_source: "runtime"
started_at: "2026-11-06T12:07:15.992Z"
submitted_at: "2026-11-06T12:38:19.414Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004","R2-F005","R2-F006"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Corrected the native issuance design to use an active worktree-local production path, specified reference-based retention and v2 handoff, added actual human direction for conflict reconciliation, and removed the unintended blanket evidence-staleness policy. The mandatory decomposition and native title/WBS route remain unresolved pre-implementation authority, not implementation TODOs. No product or lifecycle mutation occurred.

## Finding dispositions

- R2-F001 — Addressed. Use paths.mjs tmpAitmDir(actual projectRoot)/native-operation-evidence, with the existing story-store private-file/path semantics. No assertRuntimeReadable/control.json/migration initialization. Evidence is explicitly worktree-local; actual native issuance initializes only its private directory. Fixture may create only production-supported state. Added paths, inventory/classifier and cleanup ownership rows. Future migration inventories the local family, but live relocation to an inactive destination reader must explicitly block rather than break lookup.
- R2-F002 — Addressed. Receipt liveness follows transitive references from retained generations, pending operations/batches/conflicts, publication evidence and transfers. Only native collector under current claim/lock can delete proven-unreferenced receipts after exact recheck. Age, SHA change and Closed are insufficient. Pending references block pruning. Handoff v2 binds and acknowledges exact independently validated receipt bytes, preserving issuer; v1 refuses receipt-bearing transfers. Tests cover normal production initialization, pending-GC protection, orphan collection, transfer retention and corrupt/aliased source refusal.
- R2-F003 — Addressed with an actual human-direction boundary rather than a boolean on the input file. Native issue-body conflict resolution displays the exact diff and requires actual interactive terminal confirmation of issue and digest; headless/Full-Auto cannot issue it or fall back to human mode. Retain exact native confirmation issuance and recheck package/resolution/current snapshot. No blanket marker-loss grant. Full-Auto attempts to remove a UI human tick or discard external changes refuse with zero effects. This is the spec's discuss-before-merge requirement, not a new gate on ordinary approval/stamping.
- R2-F004 — Addressed. Read K code-complete-gate.mjs:320–350: AC checked/declaration rules do not impose evidence SHA equality there. Read normalization.mjs:40–45 for exact SHA/time of its DoD normalization. Removed blanket stale-after-any-commit semantics. Rebind invokes each actual native consumer; the integration case asserts parity with that consumer and requests one durable restamp only when it actually requires one. Original execution source/time are never rewritten.
- R2-F005 — Addressed. Added Task 1–9 to C1–C11/C9a–c mapping so the separate decomposition plan carries each exact verifier to its owner.
- R2-F006 — Addressed. Pre-split C9 into body/story/metadata readers, remaining lifecycle/proof/result adapters, and admin/creation/non-timing repairs. Timing/repair remains C10. Thirteen provisional 3–4h units total 39–52h. Per-path ownership/sizing still needs the bounded reviewed decomposition; no actual child or estimate field was created.

Additional directly received coordinator source findings:
- Verified actual kind and first normal child-tether routes both force Epic title convergence; read verbKind, epic-metadata visible write, project-tether linkSubIssue and epic-retitle in K. Outer WBS compares literal child title. The revision replaces the prior helper-only conditional with this actual source contract.
- No source-supported route has been found that both converts/creates children, retains J's BUG Task30 title/full bytes and preserves all 31 closed-child claims. J-rooted and D-rooted carrier variants alone do not solve title equality. Distinct-path outer copy still fails exact-path equality. No manual title restoration, parent overwrite or closed sibling rebinding is proposed.
- Implementation, kind/child creation and carrier construction remain held pending a separately reviewed native route. A design XPR cannot grant those authorities.

## Changes made

Updated the existing plan only: active storage, immutable evidence lifecycle, local v2 handoff, runtime inventory-only registration with relocation refusal, native human conflict direction, actual K evidence-consumer parity, decomposition mapping/ranges and verified title/WBS blocker. Historical source reuse rows now say ADAPT where evidence retention/handoff changes them.

## Declined changes and rationale

No finding declined. Runtime-storage activation was not selected: it is unrelated scope and inactive in K. The stricter blanket AC/VC staleness rule was removed rather than silently changing native behavior. Actual interactive human direction is used for conflicts instead of treating a Full-Auto agent's self-authored resolution as human approval.

## Verification

Read K paths.mjs, runtime-migration-plan.mjs, cleanup-base-aware.mjs, code-complete-gate.mjs, normalization.mjs, handoff schema and actual title-convergence call paths. Read pinned O retention semantics. Documentation Prettier and git diff --check pass before submission. No product tests, native decomposition classifier, dry-run split, kind/estimate/graph mutation, carrier creation, runtime activation, source import, or lifecycle move was executed. Same normal-mode XPR and genuine author/reviewer sessions; no cancellation or duplicate review.
