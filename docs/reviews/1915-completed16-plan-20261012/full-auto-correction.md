# #1915 Full-Auto authority and avoidable-wait correction

The user corrected the preparation handoff: “if the SAR and XPR have approved and accepted the plan, why are you waiting for me to approve it -- you are under full-auto authority”. The user then requested the time lost and its correction, and said AFK. Continue authorized preparation autonomously; no repeat human plan approval is required.

## Recorded avoidable wait

| Event                                          | Native recorded timestamp |
| ---------------------------------------------- | ------------------------- |
| Incorrect approval-wait final response emitted | 2026-10-12T14:26:36.016Z  |
| Previous turn completed                        | 2026-10-12T14:26:36.163Z  |
| User Full-Auto correction received             | 2026-10-12T14:43:48.486Z  |
| User asked for waste accounting                | 2026-10-12T14:44:14.387Z  |
| User said AFK                                  | 2026-10-12T14:44:28.129Z  |

The stopped-turn-to-correction interval is1032.323 seconds:17 minutes12.323 seconds, reported as17 minutes12 seconds. Measured from final-response emission it is1032.470 seconds; the147ms distinction is retained rather than inventing precision. These timestamps were read from this exact owning native transcript, not reconstructed from UI impressions.

The prior timer was paused before the final handoff, and normal1915 start resumed it after the correction. Record the gap as avoidable manual-approval waiting, not productive work, reviewer compute or prospective estimate. Preserve authentic SessionTime including gaps as requested; do not erase17 minutes from historical elapsed evidence, fabricate Active/Idle values or double-count the resumed correction effort. AITM still reports active/idle unavailable.

## Root cause and corrective action

The invoking author carried generic human-plan-approval/handoff wording into this preparation without applying the actual default Full-Auto rule. The workspace task rule already says “Full-Auto is the built-in default for new AITM sessions.” Accepted reviews do not require another human decision under that mode. The inappropriate pause was an agent workflow error, not a new product defect or a failed SAR/SPR/XPR.

Applied `aitm auto both` through the normal session command. Verified effective analysisToDevelopment, pullRequestReview and reviewToDone gates are all false. The saved update is2026-10-12T14:44:57.135Z. No hook was enabled, review waived or human approval fabricated. AGENTS.md now requires resolving effective Full-Auto policy before requesting routine approval and distinguishes actual technical refusals from approval waits.

Current mutable summary/process/deep-dive records, the issue audit and PR summary are corrected to remove “waiting for human plan approval”. This sidecar records the user's latest authority and supersedes the accepted plan's generic human-only handoff wording for this session; the plan's technical contract is unchanged. Both accepted exact-digest reviewer receipts and historical human-authority-unavailable manifests remain unmodified. Formal Full-Auto plan approval must be emitted by the sanctioned command after its real prerequisites pass; this note is not a fabricated aitm-plan-approved marker.

## Remaining actual preparation gates

Current1915 remains Ready for Planning. Fresh AITM navigation refuses Plan entry with blocked-by-not-done (native1920 is OPEN) and refine-exit-wip-budget. Direct read-only inspection of the unchanged WIP guard identifies #1919 as the occupied sibling slot. These are technical lifecycle refusals, independent of the disabled manual plan gate. The sanctioned exact-body transaction corrected the approval-mode text at body version47. A second sanctioned transaction repaired vc:1 at version48: replace the nonexistent transition-recovery filename with genuine known-prefix-entry, recovery-from-comment and complete-saga files, retaining full suites, original recovery intent and every unchecked AC/DoD. No verifier was claimed executed. Both operations are preserved alongside this correction.

The current whole-story14h forecast is still stale relative to the12h completed16 slice and unfinished1–15; grounded re-estimation and≥24h decomposition remain due. The source-preparation scheduling under1918 still permits bounded preparation but does not manufacture child Plan/Develop or CI receipts.

Continue all permitted preparation and use Full-Auto for ordinary approval when the normal prerequisites are met. No new story/defect, native dependency deletion, state jump, blanket review/verification exception, fictional approval or artifact-byte rewrite is part of this correction.
