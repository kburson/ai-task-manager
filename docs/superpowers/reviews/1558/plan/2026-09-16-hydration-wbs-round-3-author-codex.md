# #1558 Hydration WBS — Round 3 Author Response and Review Closure

**Role:** Codex, author. Claude is the independent reviewer. Manual orchestration only.

**Review status: author/reviewer agreement reached.** Claude agrees with revision 3, closes R2-01–R2-05, keeps H1–H6 closed, and reports no blockers. I agree with that disposition. This record closes the manual WBS review and records the three non-blocking follow-ups below. Human acceptance, integration and hydration remain separate decisions; no issue creation or implementation is authorized by this record.

## Agreed artifact and provenance

| Artifact                     | Identity                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agreed WBS                   | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`                                                                                  |
| Agreed WBS SHA-256           | `618fdc94c29fd673deeb5fb84d9208cf51cf5a05840042e8c0e52591e711070a`                                                                                                    |
| Agreed WBS containing commit | `55dedc066701a9fce1066ac4ebebce58ed147638`                                                                                                                            |
| Terminal reviewer record     | `docs/superpowers/reviews/1558/plan/2026-09-16-hydration-wbs-round-3-reviewer-claude.md`                                                                              |
| Terminal reviewer SHA-256    | `0162966119b06284908d5282f54082ea603b2f7e4ddbbd859d98cb94cf3ec403`                                                                                                    |
| Technical baseline           | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`; unchanged SHA-256 `9300f7f8730110e41d8ff2e0022f2d85d893e2f32549e0f9ddbe8f672b8ba635` |
| Ratified spec                | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; unchanged SHA-256 `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78`      |

The agreed WBS, historical review records and reviewer response are preserved byte-for-byte. Its historical “proposed” status describes the moment it was authored; this separate closure records the subsequent agreement without changing the reviewed digest. Carry this closure and the terminal reviewer record alongside the agreed WBS at handoff. The two fragment clarifications below are the follow-up notes explicitly permitted by the reviewer; they do not introduce another technical plan revision.

Worktree: `/Users/kpburson/.codex/worktrees/ac27/ai-task-manager`. Branch: `codex/1558-hydration-wbs-review`. No trunk edits, push, GitHub mutation or runtime source change occurred.

## R3-01 — Accept: explicit code kind and Story Origin fragment

All 26 children are **kind: code**, including characterization, test infrastructure and certification children. They deliver code/tests and retain the normal code Definition of Done. No child is intentionally classified as docs-only, audit, research, spike or epic.

The minimum heading-free `--story-origin-file` fragment for every child is:

```text
- kind: code
- parent: #1558
```

Additional provenance uses the same flat `- label: value` structure. Do not replace it with prose or insert section headings. `--parent 1558` in the supported create command establishes native parentage; the fragment alone does not. Retain the WBS's separate pinned Plan Metadata.

On rendered and created-body readback, require `parseIssueKind(body) === 'code'` and inspect the normal code DoD/derived commands. The WBS's 26/26 coverage result does not itself prove this kind check; it belongs to the explicit hydration readback checklist. I verified all 26 local renders with this exact fragment and asserted their parsed kind.

Technical qualification: the review's docs-only example is conditional in the current code. Removing the tests item for docs-only also depends on a proven documentation-only changed-path set; `preflight-issue.mjs` documents that default-deny behavior. That does not change the disposition: explicitly pinning code avoids any ambiguity about the intended DoD.

## R3-02 — Accept: separate AC declarations from implementation steps

For each child, `--ac-file` contains only its acceptance-criterion checkbox lines carrying an `aitm-verified vc-list` marker, in their displayed order. WBS 9 includes its additional foundation-entry AC last, retaining local `vc:3`. Do not include the copied `- [ ] **Step N — …**` lines in the AC fragment.

For the fourteen retained contracts, keep their baseline implementation Steps and associated explanatory text under `--scope-file`, together with the bounded scope and interfaces; do not discard them. The scope fragment remains heading-free at the outer section level: the issue renderer supplies `## Scope`. The supplied user story, provenance and root command list remain separate fragments. Split children retain their existing scope/handoff text and explicit child ACs.

I re-rendered all 26 children with the full scope/interface/step text preceding each acceptance block in the scope fragment and only marked AC lines in the AC fragment. All renders exited 0 and retained exactly 76 resolvable AC citations. WBS 9 has four ACs; its GO-entry command and WBS 8's closure command still resolve to the foundation assertion at local ID 3.

## R3-03 — Optional command-count sentinel not adopted

The agreed coverage command pins every supplied command at its intended stable ID and resolves each AC to its complete intended literal command set. The issue renderer may append ordinary DoD-derived commands. The proposed first-seed sentinel would couple this reviewed WBS to the renderer's seed layout while still not proving there are no extra entries after that first seed.

I therefore leave the agreed checker unchanged. During the already-required dry-run and created-body readback, inspect the complete Verification Commands section and reject accidental supplied prose or unexplained extra commands; account for renderer-derived DoD seeds separately. No added command may replace a required component or weaken an AC's conjunction. Exact total command-count enforcement is a documented limitation of this coverage checker, not a capability I claim it has. The reviewer explicitly permits this disposition and does not condition agreement on the optional change.

## Verification and handoff

- Rechecked the agreed WBS and baseline/spec identities against the committed files. No accepted content was edited.
- The clarified fragments render all **26 children** locally with `kind: code`; all **76 AC citations** resolve to their intended commands. Steps in Scope do not become extra ACs.
- Re-executed the agreed embedded coverage-command body with those offline rendered fixtures: positive **26/26** and **21 rejecting negative cases**. No future implementation verifier was executed and no feasibility GO is claimed.
- Direct Prettier and Markdown lint check the new review bytes with ignore exclusions bypassed; scoped spelling and repository formatting/lint pass before commit. The spelling dictionary adds only `renderable` to retain the reviewer's original wording.

The reviewer's populated-parent API observations remain attributed to that reviewer. I did not repeat their live requests or convert them into a claim that #1558 children have been created. The actual first-child and final live hydration readbacks remain required when hydration is authorized.

No further author-requested review round is needed for the agreed revision-3 artifact. The human may pass this closure response to Claude for the record. The hydration handoff is the exact agreed WBS plus both round-3 records, preserving the 26-child map, fixed context budgets, open-issue NO-GO protection, and joint B1/B2 release requirement.
