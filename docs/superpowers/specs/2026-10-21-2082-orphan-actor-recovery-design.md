<!-- cspell:ignore BCLA AHOABCEY Xillzh Cdyz Suxp -->

### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** recover a verified orphan actor without reconstructing its endpoint
- **Need:** the failed #2055 handoff left a genuine start with no verified departure, blocking ordinary review
- **Value or failure prevented:** preserve historical uncertainty and evidence while allowing governed validation to resume

### Source and scope

The canonical #2055 timing comment is IC_kwDOSU6LgM8AAAABdrBCLA (database ID 6286230060). Actor v1:e9361861aa5dfcb8f1597712f0524b6f6732246461222762796690e45fd35bcd starts at 2026-10-21 09:40:43 -05:00 and has no verified endpoint. Administrative occupancy release is not a pause. Retention code is already pushed at 9af7350e3e7450abba1e6073c40bcd0fee4aeee4; independent review, full exact-head CI 39630049259 and native Test passed. Review correctly refuses the incomplete actor. Leave the retention implementation and ordinary validators intact.

The installed actor-evidence recovery admits a closed AIVC profile only. Preserve its owner authentication, issue lock, write-once original/candidate/manifest archive, fresh source comparison and exact canonical read-back. Its historical profile and fixture remain byte-compatible. A current SessionStart cannot authenticate as a different historical actor. Do not forge a pause, override session identity, edit timing directly or reuse an unrelated profile.

### Bounded recovery design

Add a separate reviewed profile for the exact repository, issue, comment, orphan actor and immutable historical prefix. Append an Unknown recovery record at the real recording time. Its timestamp records recovery, not the historical endpoint. Keep every original row and unknown aggregate contribution; refuse conflicting historical actor evidence and validate the complete candidate with ordinary timing validation. Recognize an already canonical repair explicitly without duplicating it.

When eventually applied, require the owning #2055 binding and worktree, fresh expected whole-source identities, existing native lock, write-once evidence archive and one write with exact read-back even after an ambiguous response. Timing repair grants no Review, approval, delivery or Done authority. Implement this standalone prerequisite from current origin/trunk on a separate branch in the same app-bound 7f44 worktree, retaining codex/2039-draft and ignored WIP. Native delivery precedes integration into the aggregate branch and live #2055 repair.

### Verification

Use RED/GREEN tests for exact target success, preserved rows and Unknown, wrong repository/issue/comment/actor, altered prefix, source drift, conflicting appended evidence, owner/session/worktree mismatch, duplicate recovery, write failure and ambiguous exact read-back. Retain existing AIVC tests. Place new real filesystem/archive fixtures in scripts/tests/integration/task-tracker/heal-actor-evidence-recovery.test.mjs. Run existing timing-validator regressions, independent review, committed dispositions, full exact-head CI and native Test. Assert that no finite original duration or historical departure is created.

### Local estimate and semantic review

Agent estimate 3h, size S, priority P0 and standalone rank 1: 1.5h implementation, 0.75h targeted verification, 0.75h independent review and repair. Basis is inspected local recovery, timing algebra and CLI source, with rubric zero. No historical task, comparable, corpus, backlog history or adaptive calibration was read for estimation. All seven story-quality questions pass: a real maintainer receives a distinct safeguard grounded in a live validator refusal, preventing invented timing rather than merely advancing an issue.

### Bootstrap audit

The first Refine attempt refused authority-conflict before estimate effects because creation without initial field flags omitted the embedded field record. Native reconcile established actual Backlog state; native promote moved one rung to Refine. Scoped native heal-backlog dry-run and apply installed the missing #2082 field record. Read-back confirmed size and estimate remained null before a new Refine intent. Both healer runs kept schema checks and reported an extra legacy Blocked By field with exit 3; retain that finding without claiming a green schema check. The repair did not touch #2055 timing or another issue. A paused-shell branch switch was refused; CUA Codex control is unavailable. No branch or app metadata was changed. Commit this design and all eventual review artifacts only after admitted standalone branch setup.

### Pending publication checkpoint

The post-repair Refine transaction refused `decomposition:semantic-drift`. Retained publication 78f56b42-9163-446e-a968-b10a28b1b190 (writer refine, desired 3h / S) remains pending. Writer-before-values and authority-context effects are confirmed; estimate, size and body-fields effects remain pending with null observed digests. Embedded size and estimate remain null. Preserve this transaction and original intent; no blind replay or replacement publication was performed. Fresh Explain refuses Refine exit/current snapshot and Plan entry body/board fields, with no automatic remediation and human-operator investigation requests. This design is uncommitted WIP. No recovery implementation, test execution, branch change, live #2055 repair or delivery occurred. The aggregate branch still points to the published checkpoint.

### Governed reconciliation result

After the owner explicitly resumed work, a fresh read-only native authority collection found complete availability, unchanged scope digest cea3784890d20cabdc14e0db6b8536e371d8864b7b426e5198d2e543cfb4613a and current authority-context digest 3d3d119fba24ca95982cf8851f0862e240ab24a4ec639450fc7beb6385526202 matching the retained confirmed context exactly. Board size and estimate were still at the null baseline. The native writer's matching-intent resumption validates the before record, sealed manifest and permitted resource digests. That supported reconciliation completed the SAME publication 78f56b42-9163-446e-a968-b10a28b1b190 at 2026-10-21T17:02:35.722Z. All five effects are confirmed, including estimate 3h, size S and body fields. No source-code repair, replacement publication, evidence deletion or blind replay was used. The original semantic-drift diagnostic also covers unusable intermediate authority snapshots; its historical trigger was not proven.

The Refine exit then refused only a missing board Start Time. An explicit-config native field read verified P0/S/3h/rank1 on both issue and board; issue startTime is 2026-10-21 11:37 -05:00, but board startTime is absent. Verified project PVT_kwHOABCEY84BXill, item PVTI_lAHOABCEY84BXillzhCdyzM, startTime TEXT field PVTF_lAHOABCEY84BXillzhSuxp4. An exact-ID gh project item-edit copying that recorded value was rejected by the repository PreToolUse hook BEFORE dispatch. No board backfill occurred. Do not switch to an alternate raw API to bypass the hook. The registered start-time-field migration enumerates and writes the entire project without a target scope, so it was inspected but not run. The ordinary event updater skips set-once fields already present in the embedded record. Refine demotion is unsupported and was not attempted.

Source inspection found runPromote's default clock returns an ISO string while stampStartTime's formatter calls Date methods. This is consistent with the swallowed best-effort Refine-entry stamp failure; no runtime test or code-fix claim is made. The next gate needs a supported targeted board backfill or an actual operator setting only the missing board Start Time from the verified native record. Preserve all remaining gates and historical actor uncertainty.

### Operator backfill and Plan admission

The operator confirmed the Start Time field was set. A fresh read through the native configured project field reader verified board P0, S, 3h, rank 1 and startTime 2026-10-21 11:37 -05:00, matching the embedded record. Native promote then completed Refine to Ready for Planning with its marker, timing rows, board and sentinel verified. Native plan completed Ready for Planning to Plan with all eight best-effort tail steps reported successful. The earlier missing-field blocker is resolved; no gate was waived. Original sizing publication remains complete. The recovery product code is still unimplemented and no live #2055 repair has run.

### Develop admission and implementation checkpoint

Native Plan approval was recorded at 2026-10-21T17:27:51Z. The Plan Metadata parser requires hyphenated field names; correcting four descriptive keys through native issue-body version 34 made fresh Explain ready. Native promote completed Plan to Develop, with all eight tail steps verified. The same app-bound 7f44 worktree switched normally to codex/2082-draft from origin/trunk at 48cebac5d7960cbcd8925f21fa0fccb138feb3c8. Native start renewed the same-path branch binding using registered confirm-relocation and audited allow-foreign-worktree. The aggregate branch remains preserved at 9af7350e3e7450abba1e6073c40bcd0fee4aeee4, matching origin. The untracked design survived the switch.

The retained canonical source fixture is 8812 UTF-8 bytes. Its immutable prefix ends exactly at the original orphan start row (no following newline): 3075 bytes, SHA-256 45dc750a5be6f0044aeef28b4ad3bdec660714d15dfa158cb9a2c0b71d625499. These are content sizes, not measured wire traffic. New recovery rows use actual recording time in UTC to second precision and never supply an engagement endpoint or finite original duration. All original bytes remain; fresh appended rows from other actors are validated. Any later target actor evidence conflicts, except one exact canonical recovery. Original Unknown totals remain null.

The first pure tests failed against the existing closed profile as expected. After implementation, 51 tests passed, including all 35 retained AIVC cases. The registered CLI test independently observed RED because its closed profile whitelist refused the new mode before acquiring the lock; adding only the reviewed profile made the combined 65 tests pass. The extended timing-validator regression run passed 145 tests. Archive, native persisted ownership, drift, ambiguous write/read-back, refusal and idempotence cases use real filesystem fixtures in the integration lane. No live timing recovery, native Test, delivery or Close has occurred at this checkpoint.

### Live repair procedure after prerequisite delivery

Return through the governed #2055 binding and integrate the delivered prerequisite into the aggregate branch without rewriting history. Native start/resume creates a genuine current-operator opener. Before the fresh recovery dry-run, run native update to seal that operator's observed interval while retaining the active binding; verify the actual timing source. Do not pause the owner or waive incomplete-actor validation. The reviewed profile must still refuse any actor left incomplete, including the operator. Collect new whole-source SHA and comment ID from the dry-run, then apply once with those exact identities without another intervening timing mutation. The recovery timestamp is the actual apply observation time. Inspect native exact read-back and archives before resuming ordinary Review. A failed or ambiguous write requires reconciliation, not replay.
