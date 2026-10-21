# Continuation recovery and story-wording review

This is an author self-review and native-operation recovery record, not a new SAR acceptance or implementation evidence.

## #2071 timeout and recovery

The first native Refine exit failed while stamping a marker after a GitHub GraphQL TCP connection timeout. The next Explain reported conflicting state. The native `reconcile accept-live 2071` command aligned recorded ready-for-plan with actual board Refine; it did not invent completed transition evidence. A new Explain returned ready, then native `promote 2071` completed Refine to Ready for Planning and verified the board, entry stamp/row, exit row and final sentinel. Actual command outputs are retained in `native-continued/2071.json`.

Two attempted optional read-only projections through the usage launcher were refused by the activity classifier as WRITE_CODE in Refine. Neither reached GitHub. The workflow continued through native reconciliation and Explain; no guard, configuration or source was changed. These were activity-guard refusals, not approval-review rejections. The raw failed command results were unavailable to the launcher ledger because the tool threw before dispatch; this note records that limitation explicitly.

## #2051 wording and state investigation

The current issue Scope and AC select Task 34 in the pinned refined-wave plan. The former broad title and story were replaced through the native user-story transaction and a measured title-only edit. No acceptance criteria or proof checkbox was ticked.

Seven-question review: (1) delivery maintainer is an operational beneficiary; (2) safe adoption of legacy writers is an observable capability; (3) unsafe immediate-write behavior in repair/cleanup entrypoints is the need; (4) pending-data preservation is the avoided failure; (5) every claim comes from exact Task 34 intent and bounded scope; (6) operator runbooks and consumer validation have separate sibling capabilities; (7) the rendered story names its behavior and consequence without requiring the plan. All seven pass for this bounded wording.

The first Explain was indeterminate with unknown state. The attempted native reconciliation refused because both recorded and board states were already Backlog. A fresh Explain then returned ready. No fabricated marker or manual state change was used. Actual responses remain in `native-continued/2051.json`.

## Documentation commit refused

The prepared 28-file commit contains only refinement collateral, including21 JSON evidence files. The actual attempt `AITM_GRAPHQL_USAGE=1 git commit -m '[#2039] Complete child refinement and retain post-2073 traffic evidence'` was refused before execution: `activity refused: COMMIT_CODE ... is not permitted in state plan`. This is the native activity guard, not an automatic approval-review rejection.

Read-only diagnosis found `isEligibleDocumentPath` in `scripts/task-tracker/lib/mutation-context.mjs` accepts only Markdown under docs or .claude/plans. `classifyStagedRecords` therefore classifies this JSON-containing index as COMMIT_CODE even though every path is review collateral. No commit occurred. Files remain staged for an owner commit through Git controls. No guard edit, state promotion, extension renaming, alternate-host commit or policy bypass was attempted.

## Parent checkpoint comment refused

The native command `npx aitm comment 2039 --key refinement.post-2073-v1 --body-file .scratch/gh/2039-post-2073-refinement.md` ran2026-10-20T21:40:15.709Z–21:40:30.370Z and exited1 with `decomposition-authority-unavailable: ... remote-deadline`. The parent checkpoint comment was not confirmed or claimed published. Its consolidated input remains local in the scratch bucket. Existing child-body, dependency and R4P updates are already published and verified. This closeout refusal does not erase their completed transitions.
