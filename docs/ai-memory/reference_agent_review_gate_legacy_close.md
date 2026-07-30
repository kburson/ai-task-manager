---
name: reference-agent-review-gate-legacy-close
description: 'Updated legacy-body repair: heal structure, then rebuild current epoch/SHA-bound Review authority before close'
metadata:
  node_type: memory
  type: reference
  originSessionId: 7a44b808-d351-47d4-807b-2c2346630488
  modified: 2026-07-20T16:11:12.148Z
---

> **Updated for review-epoch authority (#1050).** The legacy-body objections
> below remain historical repair context. Their old "approve then close"
> conclusion is superseded.

Driving an older issue through the Agent Review Gate (`/task review #N`,
shipped by [[project_epic_905_guardrail]]'s sibling epic #808) can surface two
legacy-body objections that must be healed in place before current authority
can be established:

1. **Retired timing vocabulary** — `timing-log-sequence` (V3) rejects pre-v2 `active-work`/`idle` rows. Heal with the sanctioned #827 tool: `node scripts/task-tracker/heal-timing-log.mjs <N> --apply` (dry-run is the default; it migrates real rows to v2 departure/return grammar, non-destructive).

2. **Legacy single-checkbox DoD** — bodies authored before #809 carry
   `- [ ] Passed final human review` (alias of `passed-final-review`) but lack
   the `- [ ] Agent Review Passed` prerequisite box. Heal through the sanctioned
   lifecycle/body mutation path to the canonical two review boxes:
   `Agent Review Passed` and `Final Review Passed`.

After healing, rebuild current authority: re-run Test to persist the verified
SHA, re-run Review so the latest epoch has a passing Agent Review proof for
that SHA, then record matching truthful approval. For approval given in chat,
use `/task approve #N --human`. Full-Auto writes provenance and signals on the
consolidated `aitm-review-approved` marker; the standalone
`aitm-full-auto-approved` marker is historical only. Demotion,
demotion-shaped reconciliation, or Agent Review failure invalidates the
authority and requires the sequence again.

Also: `required-comments` (V2) wants a `Full-Auto Plan-Approval Audit` comment
(matched `/Full-Auto Plan-Approval Audit/i`); `Commits`/`New Automated Tests`
rows are `codeKindOnly` and skipped for epic/no-commit kinds. VC commands run
without a shell (`splitCmd` → argv), so `node --test <dir>/` (bare directory)
errors on Node v25 and globs do not expand. Heal drifted VCs to explicit
space-separated file lists. See [[reference_epic_no_commit_close_lane]].
