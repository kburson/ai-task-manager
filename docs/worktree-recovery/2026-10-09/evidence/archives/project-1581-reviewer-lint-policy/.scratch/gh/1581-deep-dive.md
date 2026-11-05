## Deep-Dive Analysis (2026-09-11)

The repository already treats reviewer output as immutable evidence: the review archive manifest records reviewer artifact hashes, Prettier excludes the review archive, and the legacy archive fixture pins historical bytes. Markdownlint is the remaining exception. Its configuration contains five exact reviewer-file exclusions, including the two #1580 files, while the canonical archive grammar already provides a stable ownership signal: generated reviewer evidence ends in `-reviewer-<reviewer-slug>-review.md`; owner-controlled responses end in `-owner-<owner-slug>-response.md`.

The durable boundary should therefore be filename-role based rather than directory-wide or incident-specific. Replace the five exact Markdownlint ignores with one narrow canonical reviewer-artifact glob. Keep the existing protocol-run exception unchanged, and do not exempt the surrounding README files, copied normative artifacts, owner responses, specs, or plans. Document that distinction beside the archive grammar so new publishers and maintainers share one rule.

### Files to edit

- `.markdownlint-cli2.jsonc` — replace the per-file reviewer denylist with the canonical reviewer-artifact glob.
- `docs/superpowers/reviews/README.md` — document Markdown ownership and the exact reviewer/owner lint boundary.
- `scripts/tests/unit/task-tracker/core/quality-config.test.mjs` — pin the narrow glob, prohibit renewed exact reviewer-file exclusions, and preserve the immutable archive hash check.
- `scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs` — cover all five displaced exclusions, retain #1580 byte hashes, and prove invalid reviewer evidence is ignored while an equivalently invalid owner response is still linted.
- `docs/superpowers/specs/2026-09-11-1581-reviewer-markdownlint-policy-design.md` — record the accepted ownership design.
- `docs/superpowers/plans/2026-09-11-1581-reviewer-markdownlint-policy.md` — record the executable implementation plan.

### Step-by-step implementation plan

1. Add failing unit assertions for one canonical reviewer glob, zero exact reviewer-file entries, and no broad `docs/superpowers/reviews/**` exemption.
2. Extend the integration policy test with the complete displaced-file inventory and a sandboxed reviewer-versus-owner MD038 probe.
3. Replace the five exact ignores with `docs/superpowers/reviews/**/*-reviewer-*-review.md`.
4. Document why reviewer artifacts are exempt while owner responses and other author-controlled documents remain linted.
5. Run focused tests, the Develop verifier, isolated Test lanes, exact-head Review, hosted CI, governed delivery, and close.

### Test additions

- `scripts/tests/unit/task-tracker/core/quality-config.test.mjs` — structural configuration policy and anti-denylist regression.
- `scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs` — real Markdownlint behavior for canonical reviewer and owner artifacts plus all historical exact exclusions.

The existing four acceptance criteria and six root verification commands fully cover the implementation; no additional criterion is required.

### Identified risks

- A directory-wide ignore would hide author-controlled review collateral; the rule must remain bound to the canonical reviewer filename grammar.
- A synthetic test that runs outside the repository could miss the live configuration; the integration test will copy the exact parsed config and execute the repository-pinned Markdownlint binary.
- Removing the exact exclusions without testing every displaced path could regress #1580; the test will enumerate all five and preserve the existing byte checks.

### Sibling sub-issues to spawn

None. The change is one bounded configuration/documentation/test unit and does not require a defect chain.

## Dependency Map

Depends on: none

Blocks: none
