---
review_type: single-agent-review
filepath: docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md
commit_sha: f632e3fc819977da402ab8a636c9213ba9d984d8
reviewed_file_sha256: 53d2613bf312b897456bad0323176edcacf7c5aad4e75d48baf03f3bdf02e355
revised_file_sha256: 200098fad33387c7793160ee799f06146596628b751c10eee25d28689a589829
uncommitted_changes: true
turn_ordinal: plan SAR r2
finding_count: 6
---

# Plan #1725 SAR — round 2

**Reviewer:** Codex, single-agent self-review; same context as round 1.

**Scope:** Rechecked round 1 changes, then mapped the governing specification's safety contracts, verification subsections and all acceptance criteria to delivery owners. Inspected the repository package-boundary test to confirm packaging assertions have an existing owner.

**Disposition:** Six additional findings accepted and addressed. Further review required.

## Findings and fixes

1. **P1 — First-container bootstrap lacks an implementation owner.** Earlier tasks mentioned testing/bootstrap but no kernel service owned the exception, stable key, genesis, duplicate roots, or unsupported provisioning behavior. Task 7 now owns the service and named adversarial suite; Tasks 9–10 require certification before activation. Source: spec First authority bootstrap and criterion 16.
2. **P1 — Retention is a generic test label rather than an admission contract.** No explicit work covered missing payloads/tombstones, archive completeness or permanently lost history. Task 5 now owns the retention contract and suite, Task 9 the storage certification. Source: spec Retention and retrieval contract, criterion 9 and conformance cases.
3. **P1 — Measurements do not implement quota safety.** No production task owned shared-principal backpressure, bounded delayed observation or endpoint-specific rejection classification. Task 9 now owns production behavior, quota tests and opt-in live certification; Task 1 sets budgets before Task 3 measures them. Source: spec Quota, backpressure, and evidence volume and Live provider certification.
4. **P1 — Configuration activation lacks pending-action continuity; recovery refusal is too broad.** Task 14 omitted settling or preserving recovery before switching generations, and Task 7 could be read as refusing all recovery involving a retired generation. Added a serialized activation service/suite and clarified current-authority recovery of historical targets, with no dispatch under a retired generation. Added exact stale-mode parity and compatible-core upgrade obligations. Source: spec Recovery across configuration changes, Installation staleness and criteria 8a–8d/19.
5. **P1 — CLI migration leaves identity and approval corner cases implicit.** Added the missing unattended key refusal/display/lookup behavior, project-wide cross-target key reservation, entropy requirement, dispatch-time approval checks, legacy unknown provenance, multi-effect recovery, and existing Full-Auto guard continuity. Source: spec Request identity and retry, Approval authority and provenance, and Phase 1 exit.
6. **P2 — Verification traceability lacks executable owners and cross-cutting cases.** The prior table named only tasks. It now names suites for every criterion, splits 8a–8d, and adds quota coverage. Added explicit learning privacy/advisory-policy separation and composed-port evidence/recovery tests so standalone adapter passes cannot substitute for composition. Source: spec Acceptance-to-verification traceability, Learning-plane tests and Adapter conformance kit.

## Evidence and limits

Input is the exact round 1 revised hash. [Exact revision](round-2-plan.patch) retains this round's corrections. Prettier formatted the revised plan. New suite and module names are future child deliverables, not implemented behavior. No source, live provider state, issue state or approval authority changed. This review does not replace independent review or authorize hydration/implementation.
