# Independent review after #2012 fix round 2

## Verdicts

- **R2-1: ADDRESSED.** Previous comma-list withdrawals now block, with numeric lists and independent scope preserved.
- **R2-2: ADDRESSED.** Previous shared-preference withdrawals now block. A new independent-clause false withdrawal is reported separately below.
- **R2-3: ADDRESSED.** Both target orders retain completion context and subsequent immediate stops block.
- **Specification: PASS.** The requirements remain appropriate.
- **Code: ChangesRequested.** One new P2 regression remains in this fix diff.
- **Exact bounded local-tarball adoption: Refused.** Provenance passes, but the package reproduces the regression.

All 45 prior review inputs pass on source and package. Of 27 additional probes, 23 pass and four expose the same new defect. Total: 68 of 72 expected outcomes match; all 72 source/package outcomes agree.

## Reviewed identities and scope

Source: `f0851afe0c5c9467ab728f3b8d11f413bcba8533`.
Fix base: `efc7fae4750a9204b85d26c82a555991a45379bf`.
Publication head before review: `5d86420d5d357b5b51fb93bee649db69db91e7f3`.
Prior review commit: `ceef59212dce6bc210761e1123affe3283cd1987`.
PR: <https://github.com/kburson/ai-task-manager/pull/2013>.

The same standalone Astra 6/high reviewer chat `01a138f7-8083-7d31-9344-a35863d2499e` executed the review directly, separate from Sol author chat `01a138e5-7d07-7671-883d-e4ef5d43f917`. No subagents, native identity/environment overrides, guard changes, primary checkout edits or production fixes were used. This is an independent report, not a sealed SPR/XPR receipt.

Boot, adapter, Tier-1, preferences and live issue were reloaded. Author active file and central #2012 occupancy were absent before Start. Registered Start resumed the reviewer with generation `599abb4e-f635-4ece-8810-540ef1a66bf7`, correct worktree/branch and active Develop timer. Explain returned ready with `test-develop-finalization-pending`; no lifecycle transition was performed. Registered Stop and discharge checks follow publication.

Scope was the three prior findings and new breakage in changed grammar. Only the source grammar and its regression test changed under scripts. Inherited modules were checked for unchanged bytes, without reopening unrelated features.

## R3-1 — P2: An independent clause prefix becomes a negated admission target

Location: `scripts/task-tracker/lib/epic-rank-wave-source.mjs:361-364`, new comma splitting in `coordinatedObjects`, interacting with command slicing at line 471 and classification at lines 489-500.

Given the existing exact rank-4 authorization, this later message must preserve authority:

> When wave 4 is complete pause. I do not want to run tests, please start deployment.

Actual source and tarball: `blocked` / `rank-wave-source-contradiction`. Expected: `verified`. Both commands concern neutral operations and neither withdraws admission. The fix base returns `verified`, establishing a new regression.

Three more variants fail identically:

- `When wave 4 is complete pause. I do not want to run tests, I will start deployment.`
- `When wave 4 is complete pause. I do not want to run tests, please execute epic #2 rank 4.`
- `When wave 4 is complete pause. I do not want to run tests, I will execute epic #2 rank 4.`

The last two are independent positive continuations, not withdrawal. They supply no new authority; they must simply not contradict the existing exact grant. All four verify at the fix base and block on corrected source/package. The deployment-only control without the completion sentence still verifies.

While processing negated `run`, command slicing leaves `tests, please ` or `tests, I will ` as the full object because `start`/`execute` is the next command. New comma splitting creates a second object containing only `please` or `I will`. This fragment is treated as admission, inherits rank-4 relevance from the completion context, and is evaluated under the preceding negative preference. Contradiction is returned before reaching the independent operation, so the later preference-reset logic cannot recover. New-subject clause splitting handles conjunctions but misses these comma boundaries.

Impact: ordinary testing/deployment chatter after the future pause blocks native refresh again. This violates an explicit specification and fix-round control, rather than requesting a broader language feature.

Required correction: separate independent positive command/subject boundaries before classifying shared targets, so their prefixes cannot become standalone admission objects. Preserve genuine comma-coordinated negative preferences and matching withdrawals. Add both polite-command and new-subject regressions with neutral and positive admission targets; retain all 45 prior inputs. Do not globally neutralize unknown prefixes or objects.

## Independent verification

- Fresh focused source and deferred-pause regression tests: **108 passed**, zero failures. Output: `focused.log`.
- **72 synthetic native loader/verifier probes** ran against source, clean fix-base archive and exact extracted tarball. Exact inputs, expectations and outcomes: `comparison.json`. All 45 previous inputs pass; four new variants fail. Source and package agree in every case.
- Passing controls cover comma/conjunction/ampersand lists, numeric member/rank lists, unrelated epic/wave isolation, neutral reason tails, shared negative operations, independent subjects after conjunctions, immediate withdrawal, both deferred target orders and neutral operations after completion context.
- The exact original owner wording passes. Focused tests retain no standalone/later-wave authorization, identity/hash/chronology/cutoff and complete later-human scanning. Those authority mechanisms are unchanged in the fix diff.
- All **10 author verification entries** had raw and committed log hashes verified and captured summaries inspected. Author evidence records 180 affected tests, 19 adjacent tests, 961 fast files, full lint and format passing. Those broad runs were not duplicated or claimed as fresh independent runs. Details: `author-evidence-check.json`.
- Only the new review/evidence folder changed. Full upstream slow/canonical Test/Review/Done remain pending. No consumer/global installation, merge/closure or live native readiness is claimed.

## Package provenance and reproduction

The independent package-check.json records the exact source commit, tarball size, SHA256, SHA512 SRI, module hashes and inventory checksums. All 917 regular packed files match a clean source archive. Every inventory path, size, hash and Git blob identity matches. The committed wrapper equals the immutable raw file inventory. Eight inherited modules and entrypoints match the accepted source base. Both earlier rejected tarballs and reports remain unchanged and uninstalled.

The inline loader fixture in the first review reproduces this result when its later-message text is replaced with the deployment-only example above. Run it from this worktree to load the actual source. It uses an explicitly synthetic transcript. The full 72-case input/output set is committed alongside this report.

Return this single bounded regression to the author, then obtain fresh exact-source/package review. The future pause remains the stop boundary and never supplies new authority. Provenance passes, but adoption is refused for this candidate.
