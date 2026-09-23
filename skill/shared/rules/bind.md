<!-- aitm-skill-version: 1.0.0 -->

# Bind — compatibility pointer

Emit `aitm-skill-loaded:rules/bind:1.0.0` on first load. `npx aitm start #N --role agent|orchestrator` and its typed result own binding, timer, board read-back, and receipt. Detailed human reference: `../references/bind-detail.md`; current command help and Explain govern.
Governed creation shapes include epic, stub, sub-issue, solo, and defect; use `rules/create-issue.md`.

- **Timer must not already be running on a different issue.** Pause before switching. Verify the requested issue, active binding, worktree, branch, and command argument agree.
- **Workspace check.** For parallel scope in MAIN, create a worktree first. **Drift check.** Reconcile recorded and live state through the sanctioned verb before continuing.
- On eligible Plan-or-later bind, load `.ai-task-manager/templates/pickup-directive.md`. If `PICKUP DIRECTIVE DEFERRED` appears for Backlog/Refine, do NOT load or follow it; follow the returned state action.
- A `{discuss}` / 💬 DISCUSSION REQUESTED bind means brainstorm **before** any deep-dive or refine. On resolution call `finalizeDiscussion` and show the ✅ end delimiter; do not treat chat text as the marker write.
- Historical `{discuss}` brainstorming trigger (#405, #486) applies here; the current discussion result governs.
- Use `aitm-verified vc-list="vc:N"` for demonstrable AC citations. The create-issue rule owns authoring details.

## `{discuss}` brainstorming trigger (#405, #486)

Preserve the discussion gate above.

## Session recovery

- **Session recovery:** if the local binding is absent, re-run `/task #N` to re-register. Legacy `.claude/` state is fallback only. After a context reset, discard prior guidance receipts and follow `templates/session-boot.md` before lifecycle mutation.
