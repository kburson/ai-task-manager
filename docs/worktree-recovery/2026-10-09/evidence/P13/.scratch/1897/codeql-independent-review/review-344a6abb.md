# Focused independent #1897 CodeQL correction review

Head: 344a6abb3dbf6d0a3f5ab4037b1bd78b0cabd86e.
Base: b0911ff3af3c813492e94724da548805684c6942.
Worktree/branch: /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1897-canonical-ac, codex/1897-canonical-ac.
PR: https://github.com/kburson/ai-task-manager/pull/1898.

## Scope and assessment

No actionable findings in this focused two-file correction. This is a technical recheck of the CodeQL-triggered comment-end handling, not approval of whole delivery/native Test/Review/Close or full hosted suite completion.

Read both changed files fully and the exact base/head diff. Production delta is exactly two token patterns in findCanonicalAcHeading at ac-evidence.mjs171 and183: /<!--|-->/g becomes /<!--|--!?>/g. New public-seam tests cover same-line and multiline alternate ends. No public signatures, legacy fallback, section termination, declaration/citation grammar, marker provenance, plan, configuration or new production artifacts change in this range.

The token scan now distinguishes openers from both supported close spellings. Same-line closed comments no longer leave comment state open; multiline alternate closes also restore live-heading eligibility. Literal comment headings remain excluded until the close, and a second opener after an alternate close correctly restores comment state. Original offsets are preserved and no body filtering/rewrite occurs at lookup.

## Coverage and evidence

Reviewed:
- scripts/task-tracker/lib/ac-evidence.mjs — complete current module, both changed lines and shared public parser/lookup/stamp callers.
- scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs — complete current261-line file, two new tests, prior canonical/legacy/fenced literal and evidence refusal/byte-preservation regressions.
- Approved unchanged plan docs/superpowers/plans/2026-10-05-1897-canonical-ac-heading.md and prior whole-three-path review boundary (independent-review/review-0f92be93.md).

Residual unreviewed changed paths in this correction: none. Coverage/pins retained in coverage.json; no generalized parser redesign is claimed.

Actual independent command:
node --test --test-name-pattern="HTML alternate end" scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs
Result:2/2pass, no failures/skips, exact command/timestamps/fulloutput in targeted-tests.json. The author affected68 suite was not repeated without need.

Six inert public-seam probes (public-seam-probes.json):
- Same-line and multiline --!> cases select Embedded at base and Canonical at head.
- Same-line and multiline ordinary --> cases select Canonical at both.
- Literal H2 remains excluded until alternate close.
- A second comment opened after the alternate close remains excluded until its own close.
All current cases resolve the exact canonical verifier, and stamping preserves every non-target line. These fixture stamps are grammar data, not actual native verifier receipts. The base module was loaded in memory with only relative import URLs rebound to unchanged dependencies; no historical/caller code executed for authority or adoption.

Rechecked original well-formed backtick/tilde literal-H2 symptom from the earlier independent review against current head: the supported Actual legacy AC remains selected and found. Results retained separately. This does not broaden legacy fallback or section-termination policy.

Observed genuine author/root receipts:
- CodeQL check112029370666 annotations point to the exact base blob at171/183 and explicitly report missing --!> handling.
- codeql-red.json:66pass/2fail, exit1, both new public regressions fail on canonical lookup.
- codeql-final-affected.json:68/68pass, exit0.
- codeql-final-lint.json and codeql-final-format.json:exit0.
- Native root release receipts: pause/release/repeat no claim before own genuine role-agent bind.
Current live issue/Explain remains Develop with three untickedACs after demotion. No new evidence stamps, checks or lifecycle transitions were performed by this reviewer.

## Declined to judge

- Complete HTML/CommonMark parsing, unusual empty/malformed comment forms and generalized sanitization/XSS behavior: expressly outside the bounded locator correction; this matcher selects headings and is not an HTML sanitizer.
- Original legacy fallback, canonical duplicate policy, raw section-termination behavior, unrelated VC/DoD scanners and broad Markdown dialect expansion: unchanged by this correction and reserved by the approved plan; no silent waiver of the original literal-H2 regression (which was independently rechecked above).
- Alternate-close support in unrelated label/marker stripping grammars: unchanged and outside these two lookup-token patterns; this correction does not extend proof-marker acceptance.
- Whole-branch assurance beyond the prior complete review boundary, CodeQL aggregate/full CI artifact completion, native Test/Review/approval/delivery/Close and downstream package installation: root-owned. No fresh native Test or full host suite ran.
- Existing historical receipts or prior native stamps as current-head acceptance: not claimed; root must obtain appropriate exact-current lifecycle evidence.

## Handoff

Read-only source/index/HEAD/branch/issue/config preserved. Own actual role-agent binding, fresh authority/preferences/Explain and eventual genuine pause/release/repeat/state snapshot are retained alongside this report. Root owns subsequent native lifecycle and delivery.
