---
name: reference_github_project_workflow_compatibility_gate
description: 'ai-task-manager init (#1618) refuses to link a GitHub Project whose native workflows can auto-move/close issues, since that bypasses governed delivery.'
metadata:
  node_type: memory
  type: reference
---

Landed 2026-09-14 (#1618): `ai-task-manager init` now inspects the target GitHub Project's built-in automations (via GraphQL) before linking it, and fails closed if any of these are enabled: **Auto-close issue**, **Pull request linked to issue**, or **Pull request merged**. Those native workflows let a plain PR merge close or move an issue outside AITM's governed close/deliver verbs — the same class of problem as [[feedback_pr_body_no_closing_keyword]] (a `Closes #N` in a PR body auto-closing the issue), but enforced at project-setup time instead of relying on PR-body discipline.

**Why:** a Project automation that closes/moves issues on merge creates a split-brain board (GitHub state says Done, AITM's own delivery/close transaction never ran) exactly like the incidents in [[project_root_epic_no_commit_false_done]] and [[feedback_pr_body_no_closing_keyword]]. **How to apply:** if `init` ever needs to target a different/new GitHub Project, expect it to refuse projects with those three workflows enabled — disable them in the Project settings first, don't try to work around the refusal. Unknown/disabled workflows don't block init.
