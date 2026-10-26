### Architectural discussion: AITM as a delivery governance engine

### Provenance and status

Captured from the maintainer's side conversation on 2026-10-04, America/Chicago. The maintainer asked to preserve the architectural discussion and determine whether it belongs in #1880 or needs separate tracking. This is discussion input for future refinement, not an accepted design, implementation plan, or authorization to restructure the product. No implementation, branch, PR, state promotion, or main-thread task work is part of this intake.

Related issue: https://github.com/kburson/ai-task-manager/issues/1880 — Codify Draft PR titles and final code-review readiness before Review. Keep that issue focused on its concrete PR lifecycle rule. It is a useful proving case for this architectural direction, not a prerequisite to begin discussion and not blocked by this backlog item.

### Questions that motivated the discussion

- What does an AI development harness mean?
- Are harnesses primarily Markdown prose instructions, or do they have executable support?
- Is AITM better aligned with a harness, plugin, MCP server, or skill, and what does that imply for its architectural evolution?

### Shared terminology

A harness is the software surrounding a model that supplies context, executes tools, feeds back results, and manages sessions, permissions, continuity, and recovery. The term is used at different scopes, from the model/tool loop to the broader development workflow.

Instructions and executable controls complement each other. Markdown explains expectations and guides judgment. Scripts perform operations consistently. Hooks and state-machine guards enforce prerequisites. CI and verification produce independent evidence. A script that an agent chooses to call supplies assistance; a required guard on every supported transition supplies enforcement. No quantitative claim about the proportion of prose-based versus executable harnesses was established.

### Proposed positioning

AITM is a delivery governance engine for AI coding agents: a provider-neutral governance layer within the broader development harness.

The four concepts describe complementary architectural layers rather than mutually exclusive product categories:

| Concept | Proposed role |
| --- | --- |
| Harness | Overall execution and delivery environment: task context, permitted actions, verification, reviews, recovery, and completion. |
| Plugin | Distribution and host integration: installation, configuration, hooks, and provider-specific packaging. |
| MCP server | Standard interface exposing governed operations and contextual evidence to compatible clients. |
| Skill | Discoverable procedural guidance explaining when and how to use AITM and judgment that cannot be reduced to fixed rules. |

The durable asset should be the executable engine's contracts. Supported interfaces should agree on readiness, missing evidence, refusal reasons, and available recovery actions. Skills explain decisions; integrations present them; the engine owns lifecycle rules and revalidates live authority before mutation.

### Proposed architectural boundaries

Coding agent or human -> skill guidance and host integration -> CLI or MCP interface -> AITM delivery engine -> lifecycle policy, evidence validation, and adapters for GitHub, CI, reviews, and worktrees.

- Keep executable lifecycle policy and evidence validation in a shared core.
- Keep CLI, potential MCP tools, and host integrations as thin adapters to that core.
- Preserve structured decisions, explicit authority sources, typed refusals, current-source evidence, safe recovery after partial operations, and consistent behavior across supported entry points.
- Keep provider-specific instructions and hooks small and distinguish genuine provider capability from assumptions or prose claims.
- Add MCP when it improves portability; do not treat the transport as the source of workflow authority.
- Connect cloud test receipts, code-review results, and resumable work through durable identities and evidence references. Preserve provenance rather than treating a summary as authority.
- Enforce rules at authoritative systems when bypass prevention matters. An MCP server governs calls routed through it; preventing direct bypass also requires appropriate GitHub permissions, required checks, and other external controls.

### Candidate evolution sequence

1. Consolidate executable authority: consistent lifecycle decisions, clear refusals, exact-source evidence, and recoverable partial operations.
2. Make integrations thin: common operations for CLI and potential MCP interfaces, with small provider-specific skills and hooks.
3. Strengthen continuity: durable evidence and recovery across cloud execution, reviews, sessions, and worktrees.

These are candidate increments to investigate and refine, not an approved implementation decomposition. Compare current code and neighboring work before creating child implementation issues. Prefer focused releases that prove one complete flow over a broad rewrite.

### Concrete proving case: #1880

The initial PR is a GitHub Draft with the exact title prefix `DRAFT: `. It remains draft through Test until the configured final PR code-review agent accepts the current PR head. While the issue is still in Test, remove the leading prefix, mark the PR Ready for Review, and verify both changes before moving Test -> Review. CI success alone is insufficient; subsequent source changes require fresh acceptance.

This illustrates the separation: instructions explain the sequence; executable operations perform it; an authoritative lifecycle gate verifies authentic acceptance and observed GitHub readiness. Partial updates, stale evidence, and concurrent head changes need explicit recovery behavior.

### Source grounding to refresh during refinement

Source inspection in the discussion identified executable commands, hooks, skills, and agent adapters in package.json and README.md, and structured action-decision contracts in scripts/task-tracker/lib/action-decision/contract.mjs and evaluate.mjs. These observations are worktree-specific, not a pinned source audit or evidence that a proposed MCP interface already exists. Refresh current repository state and completed neighboring issues before deciding what remains to build.

Primary references consulted:

- https://www.anthropic.com/engineering/managed-agents — harness, session, sandbox, tool routing, and durable recovery boundaries.
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents — continuity and incremental progress across sessions.
- https://modelcontextprotocol.io/docs/learn/architecture — MCP tools, resources, prompts, and protocol scope.
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — skills as instructions, scripts, and resources.

Future refinement should produce a reviewed architectural decision/specification with explicit boundaries, enforcement guarantees, compatibility and migration strategy, and an incremental roadmap. A dedicated issue-bound branch and draft PR become appropriate when authoring that deliverable; this preservation request creates only backlog tracking.
