# Worker Context Contract

How parallel sub-agents are briefed, what they keep private, and what they report back. The companion spec to [`parallel-agents.md`](parallel-agents.md) — that doc covers orchestration rules (worktrees, gates, state machine); this doc covers the prompt-construction and reporting contract.

The contract exists so parallel fan-out improves throughput without multiplying context bloat: the orchestrator's session stays small, every worker's session stays focused, and integration decisions read from structured reports instead of free-form narrative.

---

## 1. Three context packs

Every worker session is briefed from three named packs. The orchestrator assembles them; the worker consumes them. Nothing else flows by default.

### Orchestrator pack

Owned by the orchestrator session. Never pasted into a worker prompt.

| Field                     | Content                                                       |
| ------------------------- | ------------------------------------------------------------- |
| Issue goal                | The epic / parent goal that motivates this wave.              |
| Dependency graph          | Which sub-issues block which; which can run in parallel.      |
| Ownership map             | Sub-issue → owning agent ID → worktree path.                  |
| Worktree map              | Branch names per worker; expected merge target.               |
| Integration rules         | Disjoint-write rules, shared-file policy, merge order.        |
| Verification expectations | What "done" looks like at the wave boundary (not per worker). |

### Worker boot pack

Owned by each worker. Minimal — only the non-negotiable repo rules needed for safe execution.

The boot pack does **not** inline rule text. It names files to reload from source:

- A single pointer line: `Reload [.ai-task-manager/session-boot.md](../../.ai-task-manager/session-boot.md) and follow its Tier-1 list.` (See cross-reference to #190 in §6.)
- The worker's binding instruction: `Your first action is \`/task #<N>\` to bind this session.`

Nothing else. No copied skill bodies, no paraphrased rules, no orchestrator history.

### Worker task pack

Owned by each worker. Task-specific. Built per-worker.

| Field                 | Content                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bound issue           | `#<N>` — the worker's single source of truth. The worker reads the live issue body; the orchestrator does not paraphrase it. |
| Owned files / modules | Explicit may-edit list.                                                                                                      |
| Forbidden paths       | Explicit may-not-edit list (sister agents' territory, shared files).                                                         |
| Verification target   | Exact command(s) that must pass for the worker to report `done`.                                                             |
| STOP conditions       | When to stop and report instead of pressing on (see §3).                                                                     |
| Verb chain            | Exact ordered verbs to run, with `--answer yes` flags for any human gates pre-disabled for the batch.                        |

---

## 2. Chatter policy

Workers are silent by default.

**A worker MAY post back to the orchestrator only when:**

- It hits a STOP condition (§3).
- It needs an orchestration decision it cannot make alone.
- It is producing its final report (§4).

**A worker MUST NOT post:**

- Progress narration ("now editing X", "ran tests, all green, moving on").
- Intermediate tool output, transcripts, or per-file diffs.
- Restatement of orchestrator-supplied context.

The worker's private session can be as verbose as it needs. The wire between worker and orchestrator stays narrow.

---

## 3. STOP conditions

A worker stops and reports — does not press on — when any of these occur:

- A verb (`/task` or otherwise) fails twice in a row on the same step.
- An `activity-guard` or `bash-guard` refusal persists after one corrective attempt.
- The task pack's may-edit list is insufficient (scope creep needed).
- An ambiguity in the bound issue body cannot be resolved by re-reading it.
- A sister-agent's owned path appears in the worker's required edit set (shared-file collision).

On STOP, the worker emits a `blocked` report (§4) and exits. The orchestrator decides whether to widen scope, reassign, or serialize.

---

## 4. Worker report schema

The worker's final message to the orchestrator is a single compact report. The orchestrator parses it with grep, not by reading prose. Use the template at [`templates/worker-report.md`](../../templates/worker-report.md).

Required fields, in order:

| Field               | Type                                   | Required when                        |
| ------------------- | -------------------------------------- | ------------------------------------ |
| `status`            | `done` \| `partial` \| `blocked`       | always                               |
| `bound_issue`       | `#<N>`                                 | always                               |
| `files_changed`     | newline-bulleted relative paths        | always (empty list ok for `blocked`) |
| `root_cause`        | one paragraph                          | `done` if bug fix; `blocked` always  |
| `changes_made`      | bulleted summary                       | `done` and `partial`                 |
| `verification_run`  | command + exit code + one-line outcome | `done` and `partial`                 |
| `integration_notes` | one paragraph or `none`                | always                               |
| `decisions_needed`  | bulleted questions or `none`           | always                               |

`done` means: verification command passed, every may-edit assertion holds, no human gates remain in the worker's chain. `partial` means: work landed but verification did not fully pass and no STOP triggered. `blocked` means: a STOP condition fired.

The schema is intentionally flat — no nested objects, no per-file diffs, no tool-output dumps. The orchestrator opens the worktree to inspect details when it needs to.

---

## 5. No inherited transcript

The orchestrator never pastes its own running conversation into a worker prompt. Each worker prompt is purpose-built from the three packs.

This is the contract that keeps fan-out cheap: N workers do not each carry N copies of the orchestrator's history. If a worker needs background, it reads the bound issue and the boot pack's named source files — both of which exist on disk, are versioned, and survive any compaction.

---

## 6. Cross-reference to the session boot index (#190)

The worker boot pack does not inline foundational rules. It points at [`.ai-task-manager/session-boot.md`](../../.ai-task-manager/session-boot.md), which is the source-of-truth boot index from #190.

Concretely: when a worker session starts cold (the default — fresh worktree, no prior context), its first action is to read `session-boot.md` and reload every Tier-1 file the index names. The orchestrator does **not** paraphrase rules into the worker prompt. Paraphrases drift; source files do not.

This is the same contract that protects post-Compact and post-Clear orchestrator sessions; workers reuse it for cold boot.

---

## 7. Disjoint write scopes

The orchestrator assigns disjoint write scopes when planning a wave. Two workers MUST NOT share an owned path.

- The task pack's may-edit list is exclusive. Any overlap is a planning bug, not a runtime check.
- Shared files (configuration, root docs, lock files) are either assigned to a single owner for the wave or serialized into a follow-up worker.
- Each worker reports `files_changed` so the orchestrator can verify the assignment held.

If runtime drift produces an unplanned collision (e.g. a worker discovers it needs to touch a forbidden path), it hits the STOP condition in §3 and reports `blocked` — it does not edit the forbidden path.

---

## 8. Example worker prompt

A complete worker prompt fits in well under a page. The example below briefs a worker bound to a hypothetical `#312` ("Refactor activity-guard policy loader").

> **You are a parallel worker bound to issue `#312`.**
>
> **Boot:** Reload [`.ai-task-manager/session-boot.md`](../../.ai-task-manager/session-boot.md) and follow its Tier-1 list. Your first action is `/task #312` to bind this session.
>
> **Task:** Extract the policy-loading code from `scripts/task-tracker/activity-guard.mjs` into a new `scripts/task-tracker/lib/activity-policy-loader.mjs`. Preserve all public behaviour; the existing tests must continue to pass.
>
> **You may edit:**
>
> - `scripts/task-tracker/activity-guard.mjs`
> - `scripts/task-tracker/lib/activity-policy-loader.mjs` (new file)
> - `scripts/task-tracker/tests/activity-policy-loader.test.mjs` (new file)
>
> **You may NOT edit:**
>
> - Any other file under `scripts/`.
> - `.ai-task-manager/activity-policy.json`.
> - Sister agent `#313`'s owned territory: `scripts/task-tracker/lib/bash-guard.mjs`.
>
> **Verification target:** `npm test -- --grep activity` passes.
>
> **STOP conditions:** see [`docs/guides/worker-context-contract.md`](worker-context-contract.md) §3.
>
> **Verb chain:**
>
> 1. `/task #312`
> 2. Implement.
> 3. `/task promote --answer yes` (develop → test, gates pre-disabled for this batch).
> 4. `/task promote --answer yes` (test → review).
> 5. Emit final report per [`templates/worker-report.md`](../../templates/worker-report.md).

That prompt is ~30 lines. The worker reads the bound issue body for full ACs; the orchestrator does not paste them.

---

## 9. Example worker final report

```
## Worker Report

- **status:** done
- **bound_issue:** #312

### files_changed

- scripts/task-tracker/activity-guard.mjs
- scripts/task-tracker/lib/activity-policy-loader.mjs
- scripts/task-tracker/tests/activity-policy-loader.test.mjs

### root_cause

n/a — refactor, not a bug fix.

### changes_made

- Extracted `loadPolicy` and `resolvePolicyPath` from activity-guard.mjs into a new loader module.
- activity-guard.mjs now imports from the loader; no behaviour change at the public boundary.
- New tests cover the loader's path-resolution and cache-invalidation paths.

### verification_run

- Command: `npm test -- --grep activity`
- Exit: 0
- Outcome: 24 tests pass, 0 failures, 0 skips.

### integration_notes

No shared-file edits. Loader module is new; activity-guard.mjs diff is minimal (imports + delegation). Safe to merge ahead of sister `#313`.

### decisions_needed

none
```

That is the full report. Three sentences of prose at most per field. The orchestrator decides whether to merge from this alone, or open the worktree for closer inspection.

---

## 10. Practical thresholds

- **Worker prompt length:** target under 50 lines. If it grows past 100, the task pack is doing too much — split the work.
- **Worker report length:** target under 50 lines. If it grows past 100, the worker is narrating; tighten.
- **Inherited context:** zero. Workers never receive orchestrator transcript text.
- **Foundational rule duplication:** zero. Workers point at `session-boot.md`; they do not receive paraphrased rules.

If any threshold is breached, the contract is being violated — fix the prompt construction, not the threshold.
