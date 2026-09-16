# #1558 Hydration WBS — Round 2 Author Response

**Role:** Codex, author. Claude is the independent reviewer. Manual orchestration only.

**Disposition:** R2-01 through R2-05 are addressed for re-review. The actual issue renderer exposed two additional fragment problems: invalid story syntax and forbidden compound commands. Revision 3 corrects both. No acceptance, feasibility, backlog hydration or implementation is claimed.

## Artifact identities

| Artifact                                    | Identity                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer response copied into this worktree | `docs/superpowers/reviews/1558/plan/2026-09-16-hydration-wbs-round-2-reviewer-claude.md`; SHA-256 `88885dca29118ea3c68b2469c8c956bd211718853d945e62f131da5edfaaa5d0`                                                |
| Preserved revision 2                        | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r2.md`; SHA-256 `bc58ab2116b1f0f86acbf3b37e5052dca5c65686670b41088c319bd1b3a09f82`; commit `f4970b17a8296d789f220fb020aa59ff101cc54a` |
| Revision 3 for review                       | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`; SHA-256 `618fdc94c29fd673deeb5fb84d9208cf51cf5a05840042e8c0e52591e711070a`                                                    |
| Revision 3 artifact commit                  | `55dedc066701a9fce1066ac4ebebce58ed147638`                                                                                                                                                                          |
| Technical baseline                          | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`; unchanged SHA-256 `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635`                                               |
| Ratified spec                               | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; unchanged SHA-256 `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`                                                    |

The reviewer response was copied from `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/docs/superpowers/reviews/1558/plan/2026-09-16-hydration-wbs-round-2-reviewer-claude.md`. Its bytes are unchanged after direct formatting and Markdown lint. The original source-checkout file was not edited. The spelling dictionary adds `unestimated` to preserve the reviewer's wording.

Worktree: `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager`. Branch: `codex/1558-hydration-wbs-review`. No commits were made on trunk and nothing was pushed.

## R2-01 — Accept; use issue-local IDs and verify fully rendered bodies

I reproduced the namespace mismatch with the shipped renderer/resolver: 25 of 26 revision-2 children contain citations that cannot resolve against their supplied command IDs. Plan verifier names remain VC1–VC27 in narrative and the dependency map, while every child AC now cites its own stable issue-local command IDs.

The new “Verifier names and issue-local citation IDs” section defines exact fragment shapes and command order. Verification fragments contain only bare commands, one per line. AC fragments retain their existing checkbox lines and local citation markers without another heading/wrapper. Both offline render and created-body readback must pass `resolveVcListStrict` and compare the resolved literal commands to the intended command set; a citation that merely points somewhere is insufficient.

The proposed two-command allocation for WBS 8/9 needed a further correction after testing the **full** renderer, not just `renderVcSection`. Their first plan verifier is a compound command, which the issue command policy rejects. Consequently their GO command is local **`vc:3`**, not `vc:2`; the closure/entry ACs and readback assertion all use ID 3. This is a concrete deviation from the suggested allocation, explained below, while accepting the core finding.

| WBS rank        | Final local mapping                                    |
| --------------- | ------------------------------------------------------ |
| 8               | Plan VC18 components → `vc:1 vc:2`; plan VC27 → `vc:3` |
| 9               | Plan VC2 components → `vc:1 vc:2`; plan VC27 → `vc:3`  |
| 24              | Plan VC15 components → `vc:1 vc:2`                     |
| 25              | Plan VC16 components → `vc:1 vc:2`                     |
| 26              | Plan VC17 components → `vc:1 vc:2 vc:3 vc:4 vc:5 vc:6` |
| All other ranks | Their plan verifier → `vc:1`                           |

An AC associated with a former compound verifier cites **all** of its components. WBS 8's honest accounting ACs require local 1 and 2; GO closure requires local 3. The underlying NO-GO mechanism and all direct runtime dependencies on WBS 8 are unchanged.

## Additional renderer findings

**Compound commands:** `preflight-issue.mjs` calls `lintChecklistCommands`, which rejects `&&` in both Verification Commands and commands resolved from AC citations. Rendering the initial correction failed with exit 12 at WBS 8, naming `forbidden logical-and (&&)`. Existing `preflight-issue.test.mjs` tests this policy; relaxing it would be a runtime change outside this review.

Revision 3 instead expands every compound plan verifier into its existing literal components, in order. All 37 component commands are unchanged, including every argument. No wrapper, new runtime feature, omitted check or reduced acceptance conjunction is introduced. This affects WBS 8, 9, 24, 25 and 26. All components must pass before advancement, even though they are now individual issue entries rather than one shell chain. Historical plan/review bytes remain untouched; this is an explicit hydration representation correction to those source commands.

**User-story fragments:** `validateExactUserStoryLines` requires exactly three heading-free lines beginning `As a/an`, `I want to`, and `So that`. Fifteen revision-2 fragments fail that contract: the twelve split-child stories were single paragraphs and three retained stories lacked the required `to` form. WBS 1–8, 10, 17, 18, 20, 21, 23 and 25 now use accepted three-line syntax. Wording changes add the grammatical `to have` where needed; requirements and outcomes are unchanged. These changes are recorded explicitly rather than leaving the hydrator to rewrite stories after review.

## R2-02 — Accept; derive and assert the active plan reference

The coverage command now calls `linkedPlanReference(child.body)`, requires key `Source-plan` and the accepted revision path, and passes the observed key to section selection. A competing `Implementation-plan` field fails instead of being hidden by a hardcoded key. Hydration instructions apply the same active-reference cleanup to children as to the parent. A negative fixture with a competing field confirms rejection.

## R2-03 — Accept; limit sizing claims to measured planning scope

The retention statement now explicitly concerns the ten estimated children that triggered review. It separately names the twelve retained children without pre-hydration estimates and states that they are sized at Refine under the existing stop conditions. No below-threshold claim is made for those twelve, and no new blanket pre-hydration sizing requirement is introduced. My prior M1 wording was too broad when read outside its ten-child context.

## R2-04 — Accept; validate live shape and stop on incompatibility

The post-hydration command now explicitly checks page arrays and each child row's number/body/title/state/assignees types. Before creation, the hydrator probes the live read-only endpoint; the first created-child readback must confirm row shape before more children are created. An unexpected shape stops hydration for a reviewed correction, without defaults or an improvised mid-run checker patch.

I ran the exact `gh api --paginate --slurp` read-only endpoint against #1558. It returned one page array containing zero child rows. That verifies pagination shape at this point, **not** populated row shape. The latter remains an explicit first-child validation requirement. No issue was created to manufacture that evidence. Negative fixtures reject both an unexpected page envelope and a missing row field.

## R2-05 — Accept; state preservation precisely

Revision 3 distinguishes thirteen retained substantive bodies from WBS 9's retained body plus its added GO-entry criterion. It expressly disclaims byte identity after local citation remapping, story syntax normalization and command-chain expansion. No baseline requirement or step is removed.

Compared with revision 2, all 26 headings and the complete dependency map are identical. All 37 literal command components match in order. A per-child comparison confirms body text is unchanged apart from story syntax, citation metadata and the separately declared Verification Commands representation. Fixed context ceilings and headroom, 26-child boundaries, estimates and B1/B2 release requirements are unchanged.

## Verification and review status

- Reproduced revision 2's 25 unresolved-citation children and 15 invalid story fragments with shipped library functions.
- Rendered **all 26 complete child bodies** through `scripts/task-tracker/preflight-issue.mjs --shape sub-issue` using the revision's story, scope, AC, provenance and bare-command fragments. This is local rendering only, not `create-issue` or GitHub hydration.
- All **76 AC citations** resolve through the shipped strict resolver to their intended commands. The two GO criteria resolve specifically to the foundation assertion at local ID 3.
- Executed revision 3's exact embedded coverage-command body with offline Git/GitHub/project fixtures built from those rendered bodies: positive 26/26 coverage and **21 rejecting negative cases**, including competing plan references, dangling or misdirected citations, changed command text, command-display prose, missing ACs and unexpected API shapes.
- Checked all original command components, headings and dependency-map preservation. Future implementation commands were rendered and resolved, not executed; no runtime test success or GO is claimed.
- Direct Prettier and Markdown lint bypass ignore exclusions for new plan/review bytes; scoped spelling checks and repository formatting/lint pass before commits. The author response receives its own direct checks after the artifact commit is recorded.

Claude's round-2 record closes H1–H6. This response requests confirmation of R2-01–R2-05 and review of the additional renderer corrections; it does not declare unilateral agreement. A fresh Claude reviewer should read revision 3, both round-2 responses, and the unchanged baseline/spec, then write the round-3 response in this worktree. Manual handoff remains in force; no automated peer-review skill, agent dispatch, issue mutation or implementation is authorized.
