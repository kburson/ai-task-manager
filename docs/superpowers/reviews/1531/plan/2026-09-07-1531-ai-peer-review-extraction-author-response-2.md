# Author Response 2 — AI Peer Review Extraction Implementation Plan

- **Reviewer response:**
  `docs/superpowers/reviews/1531/plan/2026-09-07-1531-ai-peer-review-extraction-reviewer-response-2.md`
- **Prior plan commit:** `f7183cdf8c6e897d05b54fe878dd5d7be9b14e8a`
- **Revised plan commit:** `cc7633776ae10c2294239899aa3dbb049297d926`
- **Disposition:** all execution defects resolved; two factual subclaims declined

## Summary

The plan now runs full extraction verification only after the bootstrap commit,
owns all required tool configuration, uses a narrow two-mode standalone/legacy
layout gate, declares the claim-TTL unit, removes remote refs safely, and drives
AITM Develop-to-Test through `promote`.

Repository evidence did not support two reviewer subclaims: the exact widened
retained-path audit still yields two identities, not three, and `aitm start` is
the documented bind-and-start verb while `aitm bind` does not exist.

## Finding dispositions

### R2-F001 — Accepted

Moved full `verify-extraction.mjs` execution to Task 1 Step 8 after the bootstrap
commit. Step 7 now runs unit verification and `git diff --check`; Step 8 has an
explicit post-commit Expected block.

### R2-F002 — Accepted

Added Task 2 ownership and allowlist entries for `eslint.config.mjs`,
`cspell.json`, `.markdownlint-cli2.jsonc`, `.prettierrc.json`,
`.prettierignore`, `.gitignore`, and `.npmrc`. The standalone repository ignores
`.scratch/peer-review/` in its tracked `.gitignore`; installed hosts still use
the Git-reported `info/exclude` path.

### R2-F003 — Premise declined; hardening accepted

The exact widened command was run at source commit `4b3bcd43`, including all
three root licensing files. Its normalized result is still exactly:

```text
kendrick burson <kpburson@pm.me>
Kendrick Burson <spam.kpb@gmail.com>
```

The repository-wide third identity does not touch the retained path set, so the
manifest was not changed to an inaccurate three-identity result. The plan now
states this evidence explicitly and makes `EXPECTED_HOLDER_IDENTITIES` an
independent source constant that cannot be regenerated from observed manifest
output. Any identity outside the recorded two-entry set remains a human
relicensing blocker.

### R2-F004 — Main change accepted; binding subclaim declined

Replaced both direct `npx aitm test` calls with `npx aitm promote`, and clarified
that promotion runs Develop-to-Test preflights before hosted Test verification.
Also clarified that Task 15's path-limited legacy staging records only deletion
authorized by the preceding guard.

The plan retains `npx aitm start <issue>` because live command help defines it as
“Bind to issue #N and start the timer”; `npx aitm bind help` returns unknown
command. No separate bind step exists in the current command surface.

### R2-F005 — Accepted

Replaced coarse root-directory prefixes with a narrow standalone layout. A
separate exact legacy-retained rule set is permitted during bootstrap, while
Task 14 and release verification require `requireLegacyRemoved: true`. Task 14
now deletes the extracted runtime, tests, and co-review document working-tree
copies while preserving their filtered history.

### R2-F006 — Unit accepted; rename declined

Declared `--claim-ttl` as positive whole hours, default `8`, with one conversion
to internal milliseconds and explicit invalid-value tests. The suggested rename
was not adopted because the ratified specification names `--claim-ttl`; adding
an alias would expand the approved CLI contract.

### R2-F007 — Accepted

Task 1 now runs `git remote remove origin` before deleting remaining local refs,
avoiding symbolic remote-HEAD behavior. The clone already uses `--no-tags`, so
the redundant tag-ref deletion was removed.

## Changes made

- Deferred HEAD-based extraction verification until the bootstrap commit exists.
- Added explicit tool/config ownership and standalone scratch-ignore policy.
- Added narrow standalone and transitional legacy layout checks.
- Recorded the precomputed retained contributor set and protected its source
  constant.
- Declared the claim-TTL unit without changing the ratified flag name.
- Corrected both AITM transitions to use governed `promote`.
- Made ref cleanup robust to `origin/HEAD` symbolic refs.

## Declined changes and rationale

- Did not add a third retained contributor identity: the exact widened audit
  returns two.
- Did not replace `aitm start` with `aitm bind`: `start` performs binding and
  timer startup; `bind` is not a command.
- Did not rename `--claim-ttl`: the ratified CLI name is preserved.

## Further discussion

None required. The declined points are resolved by current repository evidence
and the ratified specification rather than author preference.

## Verification

- Prettier: pass.
- cspell: pass, 0 issues.
- markdownlint: pass, 0 issues.
- Documentation-anchor lint: pass, 38 anchors clean.
- Placeholder scan: pass, no matches.
- Spec coverage: pass; all 21 Phase 1 and 6 Phase 2 acceptance criteria were
  recounted, all six core invariants remain present, and the new post-bootstrap,
  legacy-removal, TTL-unit, and governed-promotion checks passed.
- Interface/type consistency: pass; 124 create owners were unique and all 54
  declared/called interface symbols were present.
- `git diff --check`: pass.
- Ratified specification and reviewer collateral: unchanged.
- Widened contributor audit: pass, exactly two recorded identities.
- AITM command validation: `start help` confirms bind-and-start; `promote help`
  confirms the one-step gated transition; `bind` is absent.
- Staging audit before commit: exactly one staged path, the implementation plan;
  no reviewer response or unrelated path was staged.
- Commit audit: revised commit has parent
  `f7183cdf8c6e897d05b54fe878dd5d7be9b14e8a` and changes only the implementation
  plan.
