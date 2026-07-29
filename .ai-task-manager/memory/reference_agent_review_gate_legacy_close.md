---
name: reference-agent-review-gate-legacy-close
description: Closing a pre-existing issue through the live Agent Review Gate — two legacy-body remediations needed before approve/close
metadata:
  node_type: memory
  type: reference
  originSessionId: 7a44b808-d351-47d4-807b-2c2346630488
  modified: 2026-07-20T16:11:12.148Z
---

Driving an older issue through the now-live Agent Review Gate (`/task review #N`, shipped by [[project_epic_905_guardrail]]'s sibling epic #808) surfaces two legacy-body objections that must be healed in place (Review permits WRITE_ISSUE) before `approve`/`close`:

1. **Retired timing vocabulary** — `timing-log-sequence` (V3) rejects pre-v2 `active-work`/`idle` rows. Heal with the sanctioned #827 tool: `node scripts/task-tracker/heal-timing-log.mjs <N> --apply` (dry-run is the default; it migrates real rows to v2 departure/return grammar, non-destructive).

2. **Legacy single-checkbox DoD** — bodies authored before #809 carry `- [ ] Passed final human review` (alias of `passed-final-review`) but lack the `- [ ] Agent Review Passed` prerequisite box. The gate passes 0 objections yet `stampAgentReviewPassed` keys STRICTLY on an `Agent Review Passed` label, so it writes NO `gate="agent-review" result="pass"` evidence marker, and `approve` then refuses with "no passing Agent Review evidence" (reason `not-run`). Fix: via `mutateIssueBody`, replace the legacy line with the two canonical boxes (`- [ ] Agent Review Passed\n- [ ] Final Review Passed`), then RE-RUN `/task review #N` so a real gate run stamps the evidence onto the now-present box. Only then does `approve` → `close` proceed.

Also: `required-comments` (V2) wants a `Full-Auto Plan-Approval Audit` comment (matched `/Full-Auto Plan-Approval Audit/i`); `Commits`/`New Automated Tests` rows are `codeKindOnly` and skipped for epic/no-commit kinds. VC commands run WITHOUT a shell (`splitCmd`→argv), so `node --test <dir>/` (bare directory) errors on Node v25 and globs don't expand — heal drifted VCs to explicit space-separated file lists. See [[reference_epic_no_commit_close_lane]].
