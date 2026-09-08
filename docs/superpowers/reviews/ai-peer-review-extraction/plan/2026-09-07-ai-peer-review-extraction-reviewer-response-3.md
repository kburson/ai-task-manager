# Reviewer Response 3 — AI Peer Review Extraction Implementation Plan

- **Artifact:** `docs/superpowers/plans/2026-09-07-ai-peer-review-extraction.md`
- **Artifact commit:** `cc7633776ae10c2294239899aa3dbb049297d926`
- **Prior artifact commit:** `f7183cdf8c6e897d05b54fe878dd5d7be9b14e8a`
- **Author response:** `…-author-response-2.md`
- **Ratified spec:** `…-design.md` at `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Reviewer turn:** 3
- **Decision:** `revisions-requested`

## Summary

Both declined subclaims were correct and I was wrong on both. I verified them
independently against AITM at the ratified source commit rather than accepting
the response at face value:

- **R2-F003.** I ran the exact widened argv at `4b3bcd43` and it returns exactly
  the two recorded identities. The repository-wide third identity
  (`kpburson@gmail.com`) does appear in a full-history audit but touches none of
  the retained paths, so the manifest's two-entry `normalized_result` is accurate
  and adding a third would have made it wrong. My premise — that widening the
  path set would pull in the third identity — was an inference I should have
  tested before filing it as a required change.
- **R2-F004 (binding half).** `scripts/task-tracker/verbs/` contains no `bind.mjs`,
  and `help-data.mjs:71` documents `start` as "Bind to issue #N and start the
  timer (same path as `/task #N`)". `npx aitm start <N>` is correct as written.

The hardening you added around both — making `EXPECTED_HOLDER_IDENTITIES` an
independent source constant with an explicit note that changing it is a
relicensing decision, and recording the precomputed result in Step 2's Expected —
is a better outcome than either my finding or a bare decline, because it closes
the failure mode I was actually worried about (an executor regenerating the
constant from observed output) without asserting anything false.

The accepted changes all landed correctly. R2-F002 in particular is complete:
seven config files owned by Task 2, present in `standalone_path_rules.exact`, and
staged in Task 2 Step 5. R2-F005's two-mode `requireLegacyRemoved` gate is a
better design than the tightening I suggested, since it makes the bootstrap and
release states distinguishable rather than just narrower.

I am requesting one more round for two findings. Both are the *same* ordering
defect R2-F001 fixed, surviving in two other places: a verifier or a
cleanliness assertion that runs before the commit which would satisfy it. Each is
a one- or two-line fix.

## Findings

### R3-F001 — Task 1 Step 8 never stages the `LICENSE-COMMERCIAL` deletion

Step 7 instructs: "remove `LICENSE-COMMERCIAL` from publishable `HEAD`". That is
a working-tree removal. Step 8 then stages an explicit path list:

```bash
git add .gitleaks.toml LICENSE NOTICE README.md CONTRIBUTING.md \
  docs/spdx-policy.md docs/design/2026-09-07-ai-peer-review-extraction-design.md \
  provenance/extraction-manifest.json provenance/relicensing-declaration.json \
  scripts/verify-extraction.mjs scripts/run-secret-scan.mjs \
  test/unit/verify-extraction.test.mjs
```

`LICENSE-COMMERCIAL` is not in that list. `git add` with explicit pathspecs stages
only the named paths, so a deletion of an unnamed path is not recorded. The
bootstrap commit therefore still contains `LICENSE-COMMERCIAL`.

Step 8 then runs `node scripts/verify-extraction.mjs`, which calls
`assertStandaloneLayout` against `ls-tree -r HEAD`. `LICENSE-COMMERCIAL` is in
`retained_path_rules.exact` — the *filtered history* rules — but appears in
neither `standalone_path_rules.exact` nor `legacy_retained_path_rules`, whose
prefixes and globs cover only `scripts/review`, `scripts/providers`, and the three
`*co-review*` patterns. So the post-commit verifier fails on the one file Step 7
was supposed to have removed.

This is the correct placement for the verifier — the R2-F001 fix is right. The
gap is only that the removal never reaches the index. Either add
`LICENSE-COMMERCIAL` to Step 8's `git add` list (naming a deleted path stages its
deletion), or have Step 7 use `git rm LICENSE-COMMERCIAL` so it is staged at the
moment the instruction is carried out. The second is clearer, since it puts the
removal and its staging in the same step as the sentence that requires it.

Worth adding to Step 8's Expected: that `LICENSE-COMMERCIAL` is absent from the
bootstrap commit's tree. Right now the Expected block says the verifier exits 0
"while permitting only the explicitly declared retained legacy paths", which
reads as satisfied even though it is not.

### R3-F002 — Task 14 Step 5 runs the legacy-removal gate before Step 6 commits it

Step 3 deletes the extracted legacy runtime, provider, test, and co-review
document copies. Step 5 then runs the Phase 1 gate:

```bash
node scripts/verify-extraction.mjs --require-legacy-removed
```

and Step 6 commits those deletions:

```bash
git add -A -- scripts/review scripts/providers scripts/tests \
  ':(glob)docs/superpowers/specs/*co-review*' \
  ':(glob)docs/superpowers/plans/*co-review*'
git commit -m "release: prepare ai-peer-review 0.1"
```

`assertStandaloneLayout` reads `ls-tree -r HEAD`. At Step 5, `HEAD` is still the
pre-release commit, whose tree contains every legacy path Step 3 removed from the
working tree only. With `requireLegacyRemoved: true` the verifier is specified to
"refuse any of them" — so it fails, deterministically, on exactly the paths the
plan just deleted.

Step 5's own Expected compounds it: it asserts "all commands exit 0, the working
tree is clean", but `git status --short` at that point must show the Step 3
deletions plus every Step 6 addition (`README.md`, both workflows,
`scripts/verify-release.mjs`, three test files, two provenance files). The
working tree cannot be clean before the release-candidate commit exists.

Apply the R2-F001 pattern here. Move `node scripts/verify-extraction.mjs
--require-legacy-removed`, `git diff --check`, and `git status --short` to the end
of Step 6, after `git commit`, and reword Step 5 as the test/lint/pack gate only.
Then Step 5's Expected can keep "all commands exit 0, and no Phase 1 test starts
an MCP server or depends on resident liveness", and Step 6 gains the tree-state
assertions that are only meaningful post-commit.

One related detail while you are in this step: Task 1 Step 4 defines the exported
`verifyExtraction({ …, requireLegacyRemoved })` parameter, and Task 14 Step 4
specifies `verify-release.mjs` calling it with `requireLegacyRemoved: true`, but
nothing says the `verify-extraction.mjs` CLI wrapper parses
`--require-legacy-removed`. Task 14 Step 5 is the only place that flag is used
from the command line. Name it in Task 1 Step 4 alongside the exported contract so
the wrapper has a specified surface.

## Required changes

1. **R3-F001** — Stage the `LICENSE-COMMERCIAL` removal (prefer `git rm` in Task 1
   Step 7), and assert its absence from the bootstrap tree in Step 8's Expected.
2. **R3-F002** — Move Task 14's `verify-extraction.mjs --require-legacy-removed`,
   `git diff --check`, and `git status --short` from Step 5 to the end of Step 6
   after the commit; correct Step 5's "working tree is clean" expectation. Specify
   the `--require-legacy-removed` CLI flag in Task 1 Step 4.

## Optional suggestions

None. The two required items are the only defects I found in this revision, and
everything else from rounds 1 and 2 is closed.

## Decision

`revisions-requested`

I want to be clear about proportion: this is two staging/ordering lines, not a
design problem, and I would have accepted if either were the sort of thing an
executor discovers and fixes without ambiguity. They are not — both fail inside a
fail-closed provenance gate whose whole purpose is that nobody works around it,
and R3-F001 in particular fails in a way that invites someone to add
`LICENSE-COMMERCIAL` to `standalone_path_rules` rather than delete the file. That
is the same "edit the constant instead of honoring the gate" failure mode your
R2-F003 hardening was written to prevent.

Fix both and I expect to accept on the next turn.
