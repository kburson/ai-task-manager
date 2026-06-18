# Spike #455 — Premature progress narration: state-change messages appear before operations complete

**Status:** complete (2026-06-18)
**Type:** investigation spike
**Trigger:** During an AFK session driving #453, a progress message "Now promoting to Develop, then doing the deep dive and implementation" appeared at 00:23:18, but at 00:24:15 the user found #453 still in Plan with no deep-dive section. The deep-dive section finally appeared at 00:27:38 — a 4m 40s gap.
**Follow-up:** Findings only; no production fix in this spike.

## Summary

Premature narration is a structural consequence of how Claude streaming works. Text content and tool_use blocks are emitted in the same response turn; text appears before any tool results arrive. When Claude writes "Now doing X" in the same turn as the tool calls that implement X, the sentence reads as a completion statement but is actually an intent statement. Operations with multiple network round-trips (like the plan→develop transition, which involves `appendPlannedEstimate`, `ensureDeepDive`, and `promote`) can take 4-5 minutes — making the false impression window significant.

---

## AC1 — Timeline reconstruction

**Source:** Issue #453 timing log (retrieved via `gh issue view 453 --comments`) + user-reported wall-clock messages.

| Wall-clock time | Event | Evidence |
|---|---|---|
| 2026-06-18 00:23:09 | `plan:start` marker stamped in timing log | #453 timing log row `plan:start` |
| 2026-06-18 00:23:18 | Claude emits: "Now promoting to Develop, then doing the deep dive and implementation" | User-reported; appeared 9s after `plan:start` |
| 2026-06-18 00:24:15 | User checks #453 — still in Plan, no deep-dive section visible | User-reported (57s after narration) |
| 2026-06-18 00:27:38 | User observes deep-dive section present in issue body | User-reported (~4m 20s after narration) |
| 2026-06-18 00:27:58 | `plan:done` marker stamped; issue moves to Develop | #453 timing log row `plan:done` |

**Total false-impression window:** 4m 40s (narration at 00:23:18 → `plan:done` at 00:27:58).

The plan stage consumed 4m 49s of active time (00:23:09 → 00:27:58), nearly all of it executing the plan verb chain: `appendPlannedEstimate` (fetch refine-estimate comment + write planned-estimate appendix), `ensureDeepDive` (fetch issue body + write deep-dive section + stamp `aitm-deep-dive-posted`), and the final `promote` to Develop.

---

## AC2 — Source classification

Each premature message site, labeled by category:

**(a) Claude free-text reasoning** — model outputs intent in the same streaming response as tool calls. Text appears in the stream before any tool executes.

| Site | Category | Description |
|---|---|---|
| "Now promoting to Develop, then doing the deep dive and implementation" | **(a)** | Written as intent statement at plan:start, before any tool call runs |
| General "I'll now..." / "Next, I'll..." / "Now doing..." sentences | **(a)** | Standard LLM behavior: describe the plan, then execute it. Text streams before tools. |

**(b) SKILL.md narration directives** — skill instructions that explicitly request Claude to announce transitions.

Searching `node_modules/ai-task-manager/skill/adapters/claude/SKILL.md` and `shared/SKILL.md` for phrases "narrat", "announce", "Now doing", "progress message", "Now promoting" found **no explicit narration directives**. The premature narration in the #453 session was **not skill-instructed** — it was organic model behavior (the model explains what it's about to do as part of its visible reasoning).

**(c) Verb stdout emitted before operation completes** — scan of verb files:

- `verbs/plan.mjs`: emits nothing until `ensureDeepDive` and `appendPlannedEstimate` resolve. No premature stdout.
- `verbs/promote.mjs`: emits `✓ Issue #N moved to: <state>` only after the GitHub API write succeeds.
- `scripts/gh/move-state.mjs`: confirmation line printed only after state is committed.
- `lib/deep-dive.mjs` (`ensureDeepDive`): emits nothing directly; result returned to caller.

**Conclusion:** All verb stdout is post-hoc (printed after the operation completes). The only premature site is **(a): Claude's own free-text reasoning** emitted in the streaming response before tool calls execute.

---

## AC3 — Proposed fixes

### Option A: Post-hoc confirmation line rule (recommended — low blast radius)

Add a rule to SKILL.md or pickup-directive.md:

> "Do not announce state transitions in the same response turn as the tool calls that execute them. If describing what you are about to do, limit it to one sentence that explicitly signals intent (e.g. 'Starting plan stage…'). Write completion confirmations only after receiving tool results."

This moves narration from intent → confirmation without silencing the model completely.

- **Blast radius:** SKILL.md text change only. No code changes.
- **Limitation:** Behavioral discipline, not enforcement. Model may still produce intent narration; no gate exists to block it.

### Option B: Suppress inter-operation narration (medium blast radius)

Stronger rule: "Do not write any explanatory text between tool calls in the same multi-step operation. Execute silently; then summarize once after all tools have confirmed."

- **Blast radius:** SKILL.md change only, but changes Claude's communication style significantly.
- **Downside:** AFK sessions have no intermediate progress visible, making it harder to diagnose failures mid-chain.
- **Upside:** Eliminates the false-impression window entirely.

### Option C: Verb-exit echo (already in place — no code changes needed)

All verbs already emit post-hoc stdout (`✓ Issue #N promoted: plan → develop`). Add a SKILL.md guidance: "Use the verb's stdout confirmation as the basis for any completion narrative rather than writing your own."

- **Blast radius:** Zero code changes. SKILL.md guidance only.
- **Limitation:** Verb stdout appears in tool result blocks, which are often collapsed in the UI. Doesn't help with the user's visible chat experience unless Claude quotes the output.

### Recommended approach

**A + C combined**: update SKILL.md / pickup-directive.md with two rules:
1. "Do not write 'I will now do X' when X involves tool calls in the same turn."
2. "After a multi-step operation completes, quote the verb's stdout confirmation rather than rephrasing it."

Estimated implementation: ~2 SKILL.md text additions, no code changes. A follow-up issue can be filed to enforce this at the skill layer if behavioral discipline proves insufficient.

---

## Additional observations

- The plan stage is the worst offender because it chains 3+ network-bound operations. Total latency regularly exceeds 3 minutes.
- The AFK context amplifies the impact: with no human watching, a 4-minute false-impression window can compound (e.g. if a subsequent step fails silently, the narration makes it seem the prior step succeeded).
- Short operations (refine: 45s, test: 64s) produce much smaller windows. The fix matters most for plan and develop stages.
- The `aitm-*` marker timestamps provide a reliable audit trail to distinguish narration time from completion time — this spike's timeline reconstruction used them directly.
