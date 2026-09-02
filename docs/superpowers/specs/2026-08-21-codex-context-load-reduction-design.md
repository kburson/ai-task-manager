# Codex Context Load Reduction

## Goal

Reduce the amount of AITM-specific context that a fresh Codex session loads
before useful work begins, while preserving the hard workflow protections that
make task execution governed and auditable.

The design should make context load measurable, budgeted, and reviewable:

- fresh-session resident directives stay small;
- `/task` activation loads only the Tier-1 task workflow;
- verb-specific task rules remain just-in-time;
- local memory remains searchable without placing the full operational history
  into every fresh session.

## Current Behavior

Fresh Codex sessions in the AITM repository receive several layers of context
before any task-specific code analysis starts.

The repository `AGENTS.md` contains an AITM-managed Codex Superpowers bootstrap.
It currently includes both hard workflow prohibitions and a resident lifecycle
verb map. It also instructs Codex to load `using-superpowers` at the start of a
new conversation when available.

The local Codex memory summary also contributes a large resident payload. The
summary is useful, but AITM dominates it: many entries describe historical AITM
decisions, worktree handling, issue workflow rules, and prior recovery
checkpoints. The larger searchable memory registry remains on disk and should
not be confused with the startup summary.

When `/task` is invoked, `.agents/skills/task/SKILL.md` loads the AITM Codex
adapter and shared router. That path is already mostly layered: the router points
to Tier-2 rule files, and those rules are intended to load only when their verb
or situation applies.

A read-only measurement pass found the approximate shape of the cost:

- fresh AITM workspace directive: about 600 tokens;
- local memory summary: about 4,600 tokens total, most of it AITM-related;
- forced `using-superpowers` first load: about 1,100 tokens;
- `/task` activation before issue pickup: about 3,800 tokens;
- issue pickup/bind adds several thousand more tokens;
- the full AITM rule corpus is much larger, but is not intended to be resident.

The problem is not a single large file. The problem is that fresh-session
resident context mixes safety-critical instructions, convenience reminders,
workflow reference material, and historical memory routing hints.

## Design

### Measure Context as a Product Surface

Extend `scripts/task-tracker/measure-context.mjs` so it can measure Codex
startup scenarios in addition to the existing task-skill scenarios.

Add startup scenarios for:

- repository `AGENTS.md` only;
- repository `AGENTS.md` plus `using-superpowers` and its Codex reference, when
  present;
- optional memory summary path;
- combined fresh-session estimate.

The measurement command should continue using the repository's existing
`chars / 4` proxy token method. It should emit per-file rows, total tokens,
budget, headroom, and machine-readable JSON.

Missing optional external files, such as a user-local memory summary, should be
reported as missing rows rather than fatal errors. This keeps CI and fresh clones
usable without relying on a particular maintainer's home directory.

### Shrink the Resident Codex Bootstrap

Replace the current Codex Superpowers block produced by
`scripts/task-tracker/codex-superpowers.mjs` with a smaller resident block.

The block must keep the hard prohibitions:

- never create GitHub issues with raw `gh issue create`;
- never close GitHub issues with raw `gh issue close`;
- never jump lifecycle state with direct arbitrary `move-state.mjs` calls.

The block should not embed the full lifecycle verb map. It should point readers
and agents to `.agents/skills/task/SKILL.md` for `/task` workflow details and to
the shared router for verb-specific routing.

The block should not require `using-superpowers` to load before every response in
this repository. Instead, it should say that matching skills should be used when
the task requires planning, debugging, testing, implementation, worktree use,
review handling, or branch finishing.

This keeps the fresh-session floor focused on irreversible workflow hazards
rather than general process guidance.

### Preserve the JIT Task Router Model

Keep the AITM task router as the primary resident task workflow document after
`/task` activation. The router should remain a Tier-1 stub:

- cross-cutting hard rules;
- CLI invocation rules;
- verb-to-rule routing table;
- brief pointers to authoritative guard behavior.

Detailed contracts should stay in Tier-2 rule files under
`skill/shared/rules/`. New prose should move into a rule file unless it is needed
for every `/task` invocation.

Add token budget tests for the Codex adapter and shared router so resident
workflow files cannot quietly regain mass.

### Compact Startup Memory Without Deleting Memory

The startup memory summary should become a compact routing index rather than an
expansive historical digest.

The full memory corpus and searchable registry should remain intact. The compact
startup summary should keep:

- global user preferences that apply across work;
- a small number of current or high-priority AITM memory topics;
- routing hints that tell the agent when to search the memory registry;
- a clear pointer that older AITM topics are searchable on disk.

The compact summary should not eagerly include every older AITM topic. Older
topics should remain available through the normal quick memory pass.

If this compacting behavior is implemented in AITM's memory hook or resync
renderer, it should be configurable enough to avoid breaking non-AITM memory
topics such as Claire's math tutor protocol or unrelated project handoffs.

### Budget Policy

Use soft budgets at first for startup memory, because memory is partly
user-local and can vary by machine. Use hard budgets for repository-owned
resident files.

Initial target budgets:

- repo `AGENTS.md` managed block: no more than 450 proxy tokens;
- Codex adapter: no more than 1,400 proxy tokens;
- shared task router: no more than 2,500 proxy tokens;
- fresh repo plus optional Superpowers bootstrap, excluding memory: no more than
  1,700 proxy tokens;
- memory summary warning threshold: 2,500 proxy tokens.

The measurement command should make over-budget output obvious and should fail
only for repository-owned hard budgets.

## Implementation Plan

1. Extend `scripts/task-tracker/measure-context.mjs` with startup scenarios,
   optional memory-summary input, JSON output, and per-file reporting.
2. Add tests for startup measurement using fixture files rather than a real
   maintainer home directory.
3. Shrink `codexBootstrapBlock()` in
   `scripts/task-tracker/codex-superpowers.mjs`.
4. Update installer tests that currently expect the resident lifecycle verb map.
5. Add token budget regression tests for the Codex adapter and shared router.
6. Find the current memory summary rendering path and add compact startup
   rendering without deleting or rewriting the searchable memory registry.
7. Document the difference between resident startup context, first-response
   skill load, `/task` activation load, JIT rule load, and searchable memory.

## Testing

Add or update unit coverage for:

- `measure-context.mjs --startup --adapter codex`;
- `measure-context.mjs --startup --adapter codex --json`;
- optional memory-summary files present and missing;
- `measure-context.mjs --all --adapter codex` remains compatible;
- `measure-context.mjs --all --adapter claude` remains compatible;
- Codex Superpowers install writes the smaller managed `AGENTS.md` block;
- install remains idempotent;
- hard prohibitions remain present in generated `AGENTS.md`;
- generated `AGENTS.md` no longer embeds the full lifecycle verb map;
- generated `AGENTS.md` no longer forces `using-superpowers` before every
  response;
- Codex adapter and shared router stay under their resident token budgets;
- compact memory startup output keeps current routing hints while preserving the
  full searchable registry.

Run at minimum:

```bash
node --test scripts/tests/unit/task-tracker/core/adapter-token-floor.test.mjs
node --test scripts/tests/unit/task-tracker/core/context-startup-budget.test.mjs
node scripts/task-tracker/measure-context.mjs --startup --adapter codex
node scripts/task-tracker/measure-context.mjs --all --adapter codex
npm run lint
npm run format:check
```

## Documentation

Update the relevant Codex/AITM setup or support documentation to explain:

- what is loaded at fresh session startup;
- what is loaded only after `/task` activation;
- why Tier-2 rule files must stay just-in-time;
- how to measure context cost locally;
- how to interpret memory summary cost versus the full memory registry.

The documentation should make clear that reducing startup context does not
remove workflow safety. Hard prohibitions stay resident, and detailed workflow
contracts remain authoritative through the task skill and router.

## Out of Scope

This change does not remove AITM task governance, timing, review gates, issue
body protections, lifecycle restrictions, or memory search. It does not change
the task state model. It does not alter MCP tool schemas or platform-provided
developer instructions, which are outside the repository's direct control.

This change also does not delete local memory entries. It only changes what is
eagerly summarized into fresh-session context.
