---
review_type: single-agent-review
filepath: docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md
commit_sha: f632e3fc819977da402ab8a636c9213ba9d984d8
reviewed_file_sha256: d03b72d225745219b385a07908a6807715d90c089e0b470a5315b14acc6396aa
revised_file_sha256: 53d2613bf312b897456bad0323176edcacf7c5aad4e75d48baf03f3bdf02e355
uncommitted_changes: false
turn_ordinal: plan SAR r1
finding_count: 6
---

# Plan #1725 SAR — round 1

**Reviewer:** Codex, single-agent self-review. No independent reviewer was used.

**Scope:** Hydration identity, delivery order, package/runtime boundaries, test layout, host bootstrap and architecture authority. Read the complete governing specification and plan, current package manifest, test-lane implementation and relevant existing paths. The specification blob matches its pinned commit 267b91b9218b59342a0d70e0859a0e38523a3923.

**Disposition:** Six findings accepted and addressed. Further review required.

## Findings and fixes

1. **P2 — Child artifact identity contradicts hydration.** Task 1 hard-coded the parent #1725 in child filenames despite the global child-ID rule. Changed these to explicit post-allocation naming rules; no child ID is invented.
2. **P1 — Production prerequisites arrive after activation.** Tasks 8–10 consume a public adapter contract and verified runtime, but Task 16 first defined the SDK/loader and Task 14 first supplied installation admission. Moved initial ABI/conformance ownership to Task 4 and production verified loading/generation checks to Task 7; staged Task 9 until Task 10 certification. Task 16 now extends/publishes those contracts. Evidence: spec Adapter ABI, Installation staleness, and Phase 1; original Tasks 4, 7–10, 14, 16.
3. **P1 — Published consumers cannot load the proposed implementation.** Current package.json has an explicit files allowlist without src/, and the plan lacked an MCP bin. Added package closure/exports preservation, an aitm-mcp bin, and actual packed-consumer CLI/SDK/MCP/conformance checks. A dry-run listing alone cannot exercise module resolution. Evidence: package.json files/bin, existing package-boundary test, spec Cloud and clone contract.
4. **P1 — Conformance paths violate the test runner contract.** Tasks 8–9 used scripts/tests/conformance/, outside all accepted lanes. Moved them into integration/conformance and documented lane/story-tag requirements. Evidence: scripts/task-tracker/lib/test-lanes.mjs and scripts/tests/tools/audit-test-layout.mjs.
5. **P1 — Lightweight skill cutover precedes host startup integration.** Task 13 replaced skills before Task 15 created registration; parity alone did not prove discover-first agent use. Task 13 now owns minimal registration, startup checks and supervised smoke evidence; Task 15 extends portability. Evidence: spec Phase 3 exit and Existing-project migration requirement to replace skills only after startup/parity.
6. **P1 — Non-GitHub activation omits the required ADR.** No task owned the replacement required by the spec Relation to ADR 0002. Task 16 now gates non-GitHub authority activation on that accepted decision, without guessing its number. Evidence: docs/decisions/0002-github-native-authority-records.md and the governing spec.

## Evidence and limits

The input was the clean committed plan. The revised plan is an uncommitted documentation change. [Exact revision](round-1-plan.patch) preserves this round's before/after delta; hashes identify both byte streams. The worktree environment verifier passed with Node 26.8.1 and the self-link verified. Prettier formatted the revised plan. Planned future executable tests were not run or claimed to exist. This umbrella document remains a hydration authority, with detailed code/test instructions required in separately approved child plans.
