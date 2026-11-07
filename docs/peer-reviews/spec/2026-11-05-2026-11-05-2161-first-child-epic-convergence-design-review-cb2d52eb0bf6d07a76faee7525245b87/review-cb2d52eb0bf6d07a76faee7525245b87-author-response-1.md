<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cb2d52eb0bf6d07a76faee7525245b87"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2161-first-child-epic-convergence-design.md"
artifact_commit: "a462ad41ed3e472528d58af0e6d51155026909d2"
artifact_blob: "c689ac95335af4a935c0748f9753d7eaae6087f6"
artifact_digest: "sha256:3fd342824c2b2db5e59a9d3dfa7b6cbf4a967f460e426587a26a18fb762ac380"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
  identity_source: "runtime"
started_at: "2026-11-05T15:38:43.722Z"
submitted_at: "2026-11-05T15:48:37.103Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the specification after verifying the cited guard, creator and wave-parent code. The bounded repair now includes prospective parent admission before child creation/linking, a consistently plan-optional canonical metadata contract, and an explicit separately returned observed child inventory. The distinct synthetic unbound wave-parent caller is excluded and tracked as #2162 rather than receiving this privilege. No product code has been written.

## Finding dispositions

The response sealed no finding IDs (`finding_ids: []`); dispositions follow the numbered findings.

1. Addressed. Verified that canonical initial/fresh-base/pre-visible checks default to requirePlan true while kind's precheck explicitly uses false. The spec now requires requirePlan:false at every canonical conversion/recovery check, including final and post-body observations. Absent plan is legitimate for Backlog/Refine; linked unreadable/conflicting/malformed plans still refuse. Public and automatic no-plan positive fixtures must include the check after body publication. No new plan authority, stage pass or implementation permission is created by metadata convergence.
2. Addressed. Source confirms addSubIssue precedes reconciliation. Prospective non-Epic parent authority now runs before ghCreate in the normal tethered creator path, and independently before any project/link write in project-tether. Foreign or unbound parent must cause zero GitHub writes/issues/links. These are independent fresh reads across subprocesses, not a serialized capability. A legitimate authority drift after actual child creation is a truthful retained partial outcome: preserve the exact created ID, stop before link/metadata and never create another child on recovery. Dry-run stays effect-free; an untethered creation cannot borrow parent-link permission.
3. Explicitly excluded and tracked as #2162, created once through the sanctioned defect wrapper after a narrow duplicate search. Read-only source inspection confirms ensure-wave-parent creates an unassigned synthetic parent without an Epic marker and links children before canonical reconciliation. That parent is not the bound issue and cannot legitimately use this fix's bound-parent source exception. Its dedicated intake is explicitly source-inferred, with no claimed live wave reproduction. #2161's normal automatic path is limited to bound-parent sanctioned creator/project-tether; it does not claim to repair all first-child callers. #2162 remains unassigned Backlog and is not falsely reported delivered.
4. Addressed. The exceptional collector must execute full child traversal and existing per-child configured-membership/fields/labels/dependencies pagination/identity checks. Return an explicit childInventory alongside the ordinary assessment, with observed child-node/issue/project-item identities. Canonical per-effect/final continuity uses that inventory, not current.input.epicReadiness.children, which correctly remains empty/not-applicable for the actual non-Epic body. No classification substitution is introduced. Missing/ambiguous configured membership still refuses; a valid unsized Backlog child does not need planning/Test evidence to make parent metadata truthful.
5. Adopted. Public kind prints the returned already-converged/reconciled status honestly. Both successes exit0; refusal or incomplete/uncertain outcome retains failure status. Tests must distinguish a no-op retry from a new metadata write.

Optional resource suggestion adopted: retain the existing5s remote/6s total collector budgets, never reuse a previous observation as fresh. A complete single-child/no-continuation observation normally has base, full-child and final-fence dispatches; test exact bounded traffic and slow-but-valid input. Budget expiry before effect refuses, after a possible write remains incomplete/uncertain. The inference/direct-reproduction distinction is already explicit in Verified problem and remains unchanged.

## Changes made

Changed only the active specification and this response. The plan will be aligned with accepted source after specification finalization, before phase advance; its current committed version is not claimed to include these changes. Root native records remain genuine and pending review/approval. #2162 is a separate tracked source-inferred caller defect, not a new permission to mutate that path under #2161.

## Declined changes and rationale

Chose the review's explicit separate-tracking option for ensure-wave-parent. Its unassigned/unbound synthetic parent needs a different legitimate creation authority, so admitting it here would widen the security and scope model. No other required change declined. Do not construct an Epic marker in a live parent or assign it merely to satisfy this exception.

## Verification

Read project-tether.mjs::linkSubIssue, create-issue.mjs parent-state and creation sequence, ensure-wave-parent.mjs::createParentIssue and link/convergence call, decomposition-plan-exit-guard.mjs plan requirements and decomposition-authority.mjs::readiness non-Epic child elision. Ordinary general refusal tests remain required. #2162 dry-run and one real sanctioned creation completed with retained URL/project item; no live wave was run. Documentation formatting/diff checks run before author submission. No product implementation or passing test is claimed.
