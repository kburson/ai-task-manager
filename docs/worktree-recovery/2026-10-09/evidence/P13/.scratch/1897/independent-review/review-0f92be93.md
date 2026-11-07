# Independent #1897 review — 0f92be933dcdd867d6fd12469db86744053f6784

Base: 15faa18e18b31a5965a15d0482750c6c0b9d125d.
Head: 0f92be933dcdd867d6fd12469db86744053f6784.
PR: https://github.com/kburson/ai-task-manager/pull/1898.
Read-only independent review; source/index/branch/HEAD and issue authority not mutated.

## Coverage and strengths

Read the complete three-file diff and all of current ac-evidence.mjs against live #1897 Scope, ACs and approved implementation plan. Residual unreviewed changed files: none.

- docs/superpowers/plans/2026-10-05-1897-canonical-ac-heading.md: all 95 lines; narrow shared-locator design, host affected-only boundary, no circular reviewed-scope import.
- scripts/task-tracker/lib/ac-evidence.mjs: complete module and both changed locations (24 and 152); unchanged marker/citation/provenance dependencies and five public consumers.
- scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs: all 175 lines; actual canonical/legacy lookup, stamping idempotence, refusal and byte-preservation assertions.

The ordinary downstream-shaped H3/H4 precedence defect is corrected through one locator without changing verifier citation grammar or public signatures. Tests distinguish fixture grammar data from native verification. Author's authentic corrected RED is 13 pass/10 fail; new-file GREEN 23/23 and affected VC1 GREEN 60/60. The initial obsolete ordinal-fixture mistake is preserved and corrected rather than weakening grammar. Root's commit-trace and three actual native ac-stamp/ensureChecked receipts bind 0f92be93 and the exact affected VC1 command; these are observed facts, not a substitute for this independent assessment.

## Important finding: P2 — literal H2 changes previously supported legacy selection

File: scripts/task-tracker/lib/ac-evidence.mjs:152 (canonical pattern at 24).

The new global canonical match accepts H2 text inside a fenced literal example. When a real legacy H1 AC appears first and a later Scope contains a backtick or tilde fenced example beginning `## Acceptance Criteria`, there is no live canonical H2 section. Base selects `Actual legacy AC`; head selects `Literal example AC` from the code block. Consequently findAcSectionCheckbox(realLabel) returns null, stampAcEvidenceMarker(realLabel) throws "no evidence-bearing AC line", and gateEvidenceTick(realLabel) returns pass because the real AC is absent from lookup. This both blocks valid legacy stamping and removes its evidence gate. No native checkbox operation was performed.

Exact public-seam fixture and base/head results: legacy-literal-heading-probes.json. Both well-formed backtick and tilde variants reproduce. A multiline comment diagnostic also reproduces; its nested marker syntax is not needed to establish the finding. The original regression uses valid fenced Markdown and unchanged real legacy literal-command declarations.

Expected: prefer a live canonical H2 section; if none exists, preserve the earlier supported legacy AC selection. Add focused regressions for a real legacy section followed by a fenced H2 example and for a literal H2 before a real canonical section. Keep changes bounded to eligible canonical-heading selection; do not replace general Markdown parsing, alter VC/DoD scanning, or change citation/evidence grammar.

Existing comparison seam: scripts/task-tracker/lib/reviewed-scope/targets.mjs:24–60 exports liveLines, recognizing backtick/tilde fences and multiline comments while preserving original line indices. It imports stripMarkers from ac-evidence at line2, so importing it back into ac-evidence introduces the circular dependency explicitly prohibited by the approved plan. Its narrow state/offset approach is useful for comparison or a carefully reviewed independent shared primitive, not permission to import the whole Scope policy or invent new refusal/dialect rules.

## Verification and actual CI

Independent command: node --test scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs.
Actual result: 23/23 pass, no failures or skips; targeted-tests.json preserves exact command/timestamps/output.
Pure base/head module probes only rebound unchanged relative dependency URLs in memory, with no live checkout/source edits. They establish the P2 at exact reviewed HEAD; no full host suites or native Test/Review/Close ran.

Read-only exact-head hosted snapshot in ci-compact.json (21:57:21Z):
- CI run37378791546 attempt1 in_progress; unit1/1, integration1/3 and3/3, both npm compatibility and guidance budget successful; integration2/3 still running.
- CodeQL dynamic run37378788733 attempt1 success.
- Guidance publication and slow jobs skipped in the observed PR checks.
- No failed check observed; this is not full hosted completion or genuine slow-lane receipt coverage. No rerun/cancel/CI mutation.

## Declined to judge

- General Markdown dialect expansion, old fallback parsing of literal headings, duplicate canonical-section policy and section-termination behavior: pre-existing, expressly outside this change; the newly introduced legacy regression above is judged and not waived.
- Unrelated VC/DoD scanners and mutation wrappers: unchanged and separate work; reviewed only where needed to verify the selected locator reaches public gate/stamp consumers.
- Existing evidence-marker permissiveness beyond this delta: unchanged; no new evidence or provenance acceptance policy is proposed.
- Full hosted suite/slow-lane completeness, native Test/Review/delivery/Close, and downstream #144 package adoption: root-owned pending actions; local23/23 and existing native stamps do not establish those outcomes.
- Generalized reuse/refactor of liveLines or new ambiguity/refusal policy: comparison only; requires bounded author design and regression evidence, not implicit reviewer authorization.

## Assessment

With fixes. One actionable P2; no additional actionable findings in the complete three-file review. Correct the newly introduced literal-H2 override while preserving the scoped canonical precedence and legacy/citation/evidence requirements. Existing passing tests and genuine AC stamps do not cover this trigger. Root owns remediation and lifecycle.
