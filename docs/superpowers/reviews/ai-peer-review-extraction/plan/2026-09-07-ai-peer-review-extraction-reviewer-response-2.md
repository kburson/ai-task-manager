# Reviewer Response 2 — AI Peer Review Extraction Implementation Plan

- **Artifact:** `docs/superpowers/plans/2026-09-07-ai-peer-review-extraction.md`
- **Artifact commit:** `f7183cdf8c6e897d05b54fe878dd5d7be9b14e8a`
- **Prior artifact commit:** `078d751f5b6a5f387e70979de5391a98c09c1ee2`
- **Author response:** `…-author-response-1.md`
- **Ratified spec:** `…-design.md` at `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Reviewer turn:** 2
- **Decision:** `revisions-requested`

## Summary

All twenty round-1 findings are genuinely closed, and several are closed better
than I asked for. R1-F001's `filtered_history_tip` boundary correctly avoids the
commit-SHA self-reference I did not think through; R1-F004 now separates revision
advancement from lifecycle-state change as two independent schema properties and
adds `RESTORE_INTERRUPTED_ROLE` plus the idempotent-retry negative case; R1-F005's
`COMMAND_FLAGS` is more complete than the spec's own CLI contract; R1-F008's
`createReviewWorkspace` builds through real validated events rather than
hand-written projections, which is the right constraint. R1-F006's Task 15 now
binds a real governed issue and refuses to invent an ID — I verified
`verify-develop.mjs --mode iteration` and `--mode final --issue <N>` are real
flags on the actual script, so that step is executable as written.

I am requesting one more round for four items, two of which are the same class of
defect as R1-F001: a verifier invoked at a point where its own preconditions
cannot hold yet. Both are in Task 1 and both will stop execution the first time
someone runs the plan. The third is a factual assumption carried forward from the
narrow contributor audit into the widened one. The fourth is an AITM
workflow-verb slip in Tasks 15 and 18.

None of these touch the plan's structure, and none reopen a round-1 finding.

## Findings

### R2-F001 — Task 1 Step 7 runs the extraction verifier before HEAD can satisfy it

Step 7 says to install the Apache licensing files, "remove `LICENSE-COMMERCIAL`
from publishable `HEAD`", record the declaration digest, and then run:

```bash
node scripts/verify-extraction.mjs
```

At that moment `HEAD` is still `refs/heads/extraction-source` at
`filtered_history_tip` — the Step 8 commit has not happened. So
`assertStandaloneLayout(currentPaths, manifest.standalone_path_rules)` reads a
tree that still contains the committed `LICENSE-COMMERCIAL`. That path is absent
from `standalone_path_rules.exact` and matches no prefix, so the assertion fails.
The licensing files are only *working-tree* edits at that point; `ls-tree -r HEAD`
does not see them.

This is the round-1 defect in a new location: the verifier's contract describes
the post-bootstrap repository, but it is invoked one step before the bootstrap
commit exists. Step 6 already handles this correctly for the relicensing digest
by explicitly deferring — "The full extraction verifier is intentionally deferred
until Step 7 supplies the mandatory relicensing digest" — the same reasoning
needs to carry one step further.

Move `node scripts/verify-extraction.mjs` into Step 8 after `git commit`, and
give Step 8 an Expected block. Step 7 can still run
`node --test test/unit/verify-extraction.test.mjs` and `git diff --check` as its
gate. If you want a pre-commit check, have `assertStandaloneLayout` read the
index (`git ls-files --cached`) rather than `HEAD`, but the post-commit
invocation is simpler and matches what the verifier actually asserts.

### R2-F002 — The standalone allowlist omits the tool config files Task 2 requires

`standalone_path_rules` (Task 1 Step 5) enumerates ten directory prefixes and
seven exact root files. Task 2 Step 1 then mandates:

```json
"lint": "eslint . && markdownlint-cli2 \"**/*.md\" && cspell --no-progress \"**/*.{md,mjs,js,json}\""
```

with `eslint@9.39.4`. ESLint 9 requires a flat config — `eslint.config.mjs` — at
the repository root, and `cspell` and `markdownlint-cli2` each need their own root
config unless every rule is inlined. `prettier@3.8.3` typically brings
`.prettierignore` at minimum, since `prettier --check .` would otherwise walk
`node_modules` and `.scratch`.

None of `eslint.config.mjs`, `cspell.json`, `.markdownlint-cli2.jsonc`,
`.prettierrc`, `.prettierignore`, `.gitignore`, or `.npmrc` appears in
`standalone_path_rules.exact`. `assertStandaloneLayout` is a closed allowlist, so
each one that gets committed is a foreign path. Task 14 Step 5 runs
`node scripts/verify-extraction.mjs` as part of the Phase 1 gate, and
`verify-release.mjs` requires "the extraction verifier is clean", so this blocks
release the same way R1-F001 did.

Add the tool-config files to `standalone_path_rules.exact` and name them in Task
2's Files list so they have an owner. `.gitignore` in particular deserves an
explicit decision: the package's own tests create `.scratch/peer-review/`
workspaces, and the plan currently never says whether the standalone repository
ignores `.scratch/` at the root or relies solely on per-fixture temp repositories.

### R2-F003 — The widened contributor audit kept the narrow audit's expected result

Per R1-F003 the audit command now covers `scripts/review`, `scripts/providers`,
the three `*co-review*` globs, and `LICENSE`, `NOTICE`, `LICENSE-COMMERCIAL`. But
`contributor_audit.normalized_result` still hardcodes exactly two identities:

```json
"normalized_result": [
  "kendrick burson <kpburson@pm.me>",
  "Kendrick Burson <spam.kpb@gmail.com>"
]
```

and `verifyExtraction` asserts `deepEqual(..., EXPECTED_HOLDER_IDENTITIES)`.

Those two identities are what the spec reports for the **`scripts/review`-only**
audit. The spec is explicit that the scope matters:

> the audit identifies only Kendrick Burson under two historical email
> identities. A repository-wide audit identifies the same copyright holder under
> three email identities.

Root `LICENSE`, `NOTICE`, and `LICENSE-COMMERCIAL` are touched across far more of
AITM's history than `scripts/review` is, so the widened audit is materially more
likely to surface the third identity than the narrow one. Step 2's Expected still
says "the contributor file contains only Kendrick Burson's two historical email
identities. Any additional contributor stops this task for license review."

There are two bad outcomes and no good one. Either Step 6 fails and an executor
"fixes" it by editing `EXPECTED_HOLDER_IDENTITIES` to whatever the command
printed — which converts a fail-closed licensing gate into a rubber stamp — or
the third identity is silently treated as a new contributor and halts the task
for a license review that is not actually needed.

Pre-compute the widened audit's actual normalized result and put *that* in the
manifest and in Step 2's Expected, and state that all three are the same
copyright holder so a third identity is a pass, not a stop. Keep the stop
condition for any identity outside that recorded holder set. Worth adding a
sentence to Step 2 making it explicit that `EXPECTED_HOLDER_IDENTITIES` is a
source constant deliberately not readable from the manifest, so an executor
knows editing it is a licensing decision rather than a test fix.

### R2-F004 — Tasks 15 and 18 promote through the bare action verb

Both AITM tasks end their verification block with:

```bash
npx aitm test "$APR_AITM_ISSUE"
```

`test` is the action verb. AITM's documented flow is to promote — `promote` runs
the cheap exit-gate preflights first, so a stale commit trail or an unticked AC
surfaces before a full isolated-worktree suite run rather than after one. Calling
the action verb directly skips that preflight and burns the suite to discover it.

Use `npx aitm promote "$APR_AITM_ISSUE"` in Task 15 Step 7 and Task 18 Step 5, and
say the promote drives the Test-stage run — Step 7's own Expected already says
"Do not substitute direct state mutation or a duplicate ad hoc full-suite run",
which is the same intent.

Two smaller items in the same steps, worth folding in rather than filing
separately:

- Step 1 of both tasks runs `npx aitm start <N>`. AITM's binding verb is
  `/task #N` / `aitm bind`; `start` is the timer verb. Confirm which is intended —
  if the goal is "bind this session to the issue and confirm Develop", the bind
  is the operation, and `start` alone will not establish the binding these steps
  assume.
- Task 15's `git add -A -- scripts/review` (correctly path-limited per R1-F016)
  runs unconditionally in Step 7, but Step 6 says the deletion happens "if and
  only if no active legacy review exists and parity passes". If Step 6's guard
  declines, Step 7 stages nothing for that path and the commit is still fine —
  but the plan should say the guard's outcome is what Step 7 stages, so an
  executor does not read Step 7 as an unconditional deletion.

## Required changes

1. **R2-F001** — Move `node scripts/verify-extraction.mjs` to Task 1 Step 8 after
   the bootstrap commit (or have `assertStandaloneLayout` read the index), and
   give Step 8 an Expected block.
2. **R2-F002** — Add `eslint.config.mjs`, the cspell/markdownlint/prettier
   configs, `.gitignore`, and `.npmrc` to `standalone_path_rules.exact` and to
   Task 2's Files list; state the standalone repository's `.scratch/` ignore
   policy.
3. **R2-F003** — Replace `normalized_result` and Step 2's Expected with the
   widened audit's actual result; treat all recorded holder identities as a pass
   and note that `EXPECTED_HOLDER_IDENTITIES` is a licensing constant, not a test
   fixture.
4. **R2-F004** — Use `promote` rather than the bare `test` verb in Tasks 15 and
   18; confirm the binding verb in Step 1 of both; clarify that Step 7's
   `scripts/review` staging reflects Step 6's guard outcome.

## Optional suggestions

### R2-F005 — `assertStandaloneLayout` is too coarse to do the job it is named for

Its stated purpose is that "new package commits are not misclassified as filtered
AITM history". But its prefix list includes `docs`, `scripts`, `src`, and `test`,
which means the entire filtered AITM tree — `scripts/review/**`,
`scripts/providers/**`, `docs/superpowers/**` — passes it unchanged. The check
can only ever catch a root-level stray file.

Once R2-F002 is fixed you could tighten it usefully: assert `HEAD` against the
plan's own file map (`bin/`, `src/`, `schemas/`, `templates/`, `skills/`,
`scripts/{verify-extraction,run-secret-scan,verify-release}.mjs`, `provenance/`,
`test/`, `.github/`, `docs/`) rather than bare `scripts`. That would also give
Task 14 Step 3's legacy deletion an automatic proof, instead of relying on the
parity ledger alone.

### R2-F006 — `--claim-ttl` has no declared unit

Task 2 says "`--issue`, turn counts, and TTL are positive integers". Task 5 says
"`claimRole` records expiry as `claimedAt + claimTtlMs`" and the default is eight
hours. Whether the flag takes hours, seconds, or milliseconds is never stated, so
the parser test and the claim test can disagree without either being wrong. Name
the unit in `COMMAND_FLAGS`' accompanying prose, and consider `--claim-ttl-hours`
so the CLI surface is self-documenting.

### R2-F007 — Deleting `refs/remotes/origin/HEAD` through `update-ref --stdin`

Task 1 Step 1 pipes every ref under `refs/heads refs/remotes refs/tags` into
`git update-ref --stdin` as `delete`. `git clone` creates
`refs/remotes/origin/HEAD` as a *symbolic* ref, and `update-ref --stdin`'s
`delete` on a symbolic ref does not behave like the others — depending on the Git
version it either deletes the symref or errors rather than following it. Since
the very next assertion requires the ref inventory to be exactly one line, a
survivor here fails the step for a reason that has nothing to do with the
extraction.

`git remote remove origin` before the loop removes `refs/remotes/*` including the
symref cleanly, and is one line shorter. `--no-tags` on the clone already makes
the `refs/tags` half of the loop redundant.

## Decision

`revisions-requested`

The round-1 dispositions are all real and I verified each one in the revised
plan — this is not a re-litigation. The four required changes are narrow and
mechanical; two of them are execution-stopping in Task 1 and one converts a
licensing gate into something an executor is likely to edit rather than honor.
I expect the next round to be an accept.
