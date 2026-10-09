<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9dbf43993985764e7ded232a9bf19806"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
artifact_commit: "8ffdaf6230da03d32314046208defbf158e58930"
artifact_blob: "4d0d14286c7f267dc222509c63ae6e6c55291f61"
artifact_digest: "sha256:8754a6090c21203e5017ea7613599ef9a54d6c3a7894d80d69bfec483d96d38c"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:1a4fe1f21e37e5881eff155ce38a8c05d802b181a8f03f985a7037d73d350a21"
  identity_source: "declared"
started_at: "2026-10-09T18:03:59.907Z"
submitted_at: "2026-10-09T18:05:59.209Z"
finding_ids: ["R1-F001","R1-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed the complete plan, its accepted specification contract and selected current production seams. The plan covers the major accepted requirements: role/legacy parity, protected markers and budgets, real standalone integration, truthful manual evidence, ordered publication, separately authorized backheal, reference fixtures and retained deep-dive prose. One required dependency/completion-boundary correction remains before hydration can produce independently executable children.

Input raw SHA-256 verified locally: `8754a6090c21203e5017ea7613599ef9a54d6c3a7894d80d69bfec483d96d38c`. Specification raw SHA-256 verified locally: `d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc`, matching the plan's declared accepted source. Artifact commit/blob are the package-pinned identities in protected frontmatter, not a separate reviewer Git observation.

This is the joined normal-mode plan SPR. The package records reviewer identity_source declared and authority_assurance unavailable; requested reviewer is gpt-6-astra with medium effort. Those values do not prove per-turn observed selection or stronger native authority. The earlier failed hook-based join produced no submission; this turn followed the successful installed-entrypoint join without copying identity environment variables.

Read-only source inspection included the canonical issue lock, issue-body mutation boundary, runtime/execution-context references and existence of named existing regression suites. The canonical lock currently permits age-based reclamation of a live holder; Task 7 correctly identifies the needed repair. No implementation tests were run, and future suites are not treated as existing pass claims. No Git commands or changes outside this exact reviewer response were made.

## Findings

### R1-F001 — Required: reconcile the task dependency graph with authority completion

Severity: P1. Locations: File ownership/dependency table (lines 80–92), Task 2 steps/interfaces (lines 150–152), Task 4 enrollment step (line 203), Task 6 dependencies, and Task 8 composition.

Task 2 promises exact-subject acceptance validation delegated to Tasks 5/6, but Task 6 depends on Task 2. Thus Task 2 cannot fully complete that promised production behavior before Task 6 exists. Task 2 also reads production enrollment through Task 7 while the graph lists only Task 1; its fixture seam correctly grants no live authority, but the plan never assigns the later completion/wiring and regression ownership. Task 4 explicitly registers durable enrollment through Task 7 but lists only Task 3 as a prerequisite. Waves are not dependency edges and cannot ensure Task 7 has completed.

Concrete failure: a worker follows the declared DAG and completes Tasks 2/3/4 while Task 7 is delayed and Task 6 is still waiting for Task 2. To claim the listed deliverables, the worker must either import nonexistent production providers, leave a refusal-only or fixture-backed resolver in place, or invent a later integration handoff. The plan requires each child to verify before dependent work and Task 3 migrates approval/Story Intent, so this is a functional admission gap rather than a cosmetic table issue. Fail-closed behavior prevents false acceptance but still breaks legitimate accepted-plan consumers until an unassigned integration is done.

Required resolution: separate dependency-free identity/legacy resolution from authentic acceptance/enrollment integration, explicitly assign the latter to a later bounded task, and name the exported injected interface and production assembly point. Alternatively restructure the tasks to remove the cycle. Add Task 7 prerequisites wherever actual enrollment work completes. Make clear which early tasks can finish as non-enabled components and which task proves the canonical approval/Story Intent path uses the real verifier and durable enrollment reader before migrated behavior is enabled. Update dependency table, per-task dependencies, waves, ownership, completion tests and critical-path calculation together. Include a production-assembly test, not only a fake dependency seam.

## Required changes

Resolve R1-F001 by providing an acyclic, complete dependency/assembly contract. Preserve the accepted security policy: no fixture provider, missing verifier, or private enrollment store may confer live authority. No specification algorithm redesign is requested.

## Optional suggestions

### R1-F002 — Optional: distinguish dependency critical path from one-worker effort

Severity: P3. Plan Metadata line 66 calls the 100-hour path a sequential critical path at one-worker capacity. A single worker must perform all 124 child hours, plus the separate 3-hour parent allowance; 100 is the current DAG's longest dependency path before capacity constraints. The later estimate section is clearer. Remove the one-worker attribution, and recalculate the path after R1-F001. This is an estimate-label clarification, not a demand for measured timing or a different estimate.

Task 12 also says to run final evidence after all children reach Review even though Task 12 is itself a child performing that work. Clarify that prerequisite children reach Review and Task 12 completes final validation before its own Review, or assign that last gate to the parent. This can be handled as part of the completion-boundary cleanup without adding scope.

## Decision

revisions-requested
