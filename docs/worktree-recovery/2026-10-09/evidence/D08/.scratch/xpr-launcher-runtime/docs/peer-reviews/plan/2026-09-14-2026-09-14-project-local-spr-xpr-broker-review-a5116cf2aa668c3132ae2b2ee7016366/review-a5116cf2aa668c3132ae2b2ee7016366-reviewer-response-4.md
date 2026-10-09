<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a5116cf2aa668c3132ae2b2ee7016366"
role: "reviewer"
turn: 4
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-project-local-spr-xpr-broker.md"
artifact_commit: "310893d79ba78b581acc0ed6997cbb65f30a61b8"
artifact_blob: "9665885d49b01ee03488a254871556a8338815c1"
artifact_digest: "sha256:aae69e115b29295aef67b4f72bbebf34ccc6eaed354d0a63c89de77147f66603"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
  identity_source: "runtime"
started_at: "2026-09-14T04:06:20.451Z"
submitted_at: null
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed revision `310893d` of `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`
against the linked design and current repository source, verified the R3-F001 disposition
and both optional-suggestion adoptions independently, and re-ran my own completeness sweep
over every version-bearing and package-shape-asserting surface in the repository.

**R3-F001 is resolved, and the fix is structurally better than the one I asked for.**
Task 12's `Files:` list (plan line 437) now includes `templates/author-startup.md`,
`README.md`, `src/mcp/server.mjs`, `test/mcp/server.test.mjs`, and
`test/unit/errors.test.mjs`. Plan line 454 names all three surfaces I reported, with
accurate locations (`templates/author-startup.md:37`, `README.md:372-375`,
`src/mcp/server.mjs:55`), states that Task 12 reconciles the pins after Task 11 has
established the prose, and keeps the exact pins deliberately — which is the first of the
two resolutions I offered, chosen for reproducibility and stated as such. Line 471's
commit step was widened to cover the listed source, template, and documentation paths.

More importantly, plan line 455 does not stop at enumeration. It replaces the permissive
`(?:status|join)` alternation in `test/golden/templates.test.mjs` with separate exact
expectations per template, adds a `test/mcp/server.test.mjs` case that omits the `version`
argument and compares the captured `createServer` identity against `package.json`, and
extends `test/packaging/package.test.mjs` to check every active README pin — with the
explicit requirement that these "must fail when any one active pin or default is stale,
even if another rendered command is current." That converts the failure mode I reported
from silent to loud. I verified all three are feasible against source:
`createHandoffMcpServer` takes an injectable `createServer` alongside the defaulted
`version` (`src/mcp/server.mjs:52-58`), and the packaging test already reads README
(`test/packaging/package.test.mjs:110`). Line 454 also adds a general classification
sweep over active source, templates, README, and tests, which generalises the fix rather
than patching three instances.

**The author found a real defect I had missed, and its severity is higher than the one I
reported.** Author response 3 records that `test/unit/errors.test.mjs` hardcodes the
package version. Reading that file confirms something broader: it is a *unit* test — part
of `npm test` — that asserts `packageJson.version` (`:13`), `packageJson.dependencies`
(`:18-21`), `packageJson.scripts` (`:29-41`), and `packageJson.files` (`:42-55`) with
exact `deepEqual` comparisons. Task 4 adds `node-gyp` to dependencies,
`build:broker-security` to scripts, and five native paths to files, so it breaks three of
those assertions in the repository's default suite — the exact gate the plan's preamble
requires green at every task commit. I flagged the packaging allowlist in round 1 and
missed this one. Task 4 now owns the file (plan line 197), line 216 requires updating the
dependency, script, and files assertions in the same task and states why, and line 236
runs it alongside `npm test`. Finding and closing this unprompted is the kind of check
that makes the rest of the plan's evidence credible.

**Both optional suggestions were adopted accurately.** Plan line 215 now begins "Before
committing the production dependency change, resolve and install the candidate in an
isolated scratch copy with lifecycle scripts disabled," then gathers closure evidence from
that install and confirms it against the final committed lockfile — which resolves the
chicken-and-egg I raised while preserving both properties (evidence precedes approval;
recorded evidence matches what ships). The size evidence is now named concretely:
"installed bytes and package count for production installs before and after the change,
including each delta against the baseline."

**My own completeness sweep now closes.** Every active occurrence of the current version
is owned by a task: `package.json` and `package-lock.json`, `src/cli/help-data.mjs:883`,
`src/cli/run.mjs:595`, `src/mcp/server.mjs:55`, `README.md:372-375`,
`templates/author-startup.md:37`, `test/unit/errors.test.mjs:13`,
`test/golden/templates.test.mjs:22` and `:80`. The only remaining matches are
`test/unit/npm-pack-report.test.mjs` and `test/fixtures/npm-pack-report/*.json`, which are
static npm-pack parser inputs describing a historical tarball filename rather than the
current package identity, plus provenance and extraction/release evidence pinned to 0.2.0.
The plan correctly instructs that all of those stay unchanged. I also confirmed that no
other test asserts package.json shape: of the twelve test files referencing `package.json`,
only `test/unit/errors.test.mjs`, `test/packaging/package.test.mjs`, and
`test/unit/node-compatibility-policy.test.mjs` make assertions about it, and the first two
are now owned by the tasks that change it.

**Decision.** I am accepting. The plan is internally consistent, every task owns the files
its own changes break, the acceptance table still covers all fourteen design criteria, and
the design's constraints — broker-required new XPR including manual transport, unchanged
legacy recovery, fail-closed ownership, no duplicate wake, exact participant identity,
author-only finalization — are carried through the task decomposition without dilution.
Across four turns the required-change count went 8 → 1 → 1 → 0, each round's remaining
item was created by the previous round's fix, and each fix has been verified against
source rather than accepted on assertion.

Three residual observations are recorded as optional suggestions rather than findings.
All three concern one unowned file, `test/unit/node-compatibility-policy.test.mjs`, and
all three would fail loudly and immediately under the `npm test` gate the plan already
requires, with an obvious correction — unlike R3-F001, where the defect was silent and
would have shipped. That distinction is why they do not block acceptance. They are worth
folding into a future revision or handling during implementation.

Verification performed this turn. Read: plan lines 196-240 and 437-476 at this revision,
author response 3, `test/unit/errors.test.mjs` in full,
`test/unit/node-compatibility-policy.test.mjs` in full, `src/mcp/server.mjs:52-58`,
`test/smoke/transport.test.mjs` package.json usage, `test/packaging/package.test.mjs`,
`test/golden/templates.test.mjs:18-27` and `:74-81`, `README.md:371-376`,
`templates/author-startup.md:35-37`. Grep: all twelve test files referencing
`package.json` and what each asserts; every `0.2.2` occurrence across
`**/*.{mjs,md,json}`, classified into active code, active tests, historical fixtures, and
sealed collateral; version assertions in `test/unit/verify-extraction.test.mjs` and
`test/smoke/cli.test.mjs`. I ran no tests and no Git commands. The `node-gyp@12.4.0`
registry metadata remains unverifiable offline; plan line 215 makes recording it a Task 4
deliverable with a stop condition if it fails audit, which is the correct handling and is
not a basis for withholding acceptance of the plan.

## Findings

None.

R3-F001 is verified resolved at plan lines 437, 454, 455, and 471. R2-F001 remains
resolved at lines 197 and 215. All eight required changes from reviewer response 1 remain
resolved; I re-checked the two most structural of them at this revision — the fifteen
direct `startReview` callers named in Task 8 and the per-task ownership of
`test/golden/help/all.sha256.txt` — and both are intact.

## Required changes

None.

## Optional suggestions

All three concern one file that no task owns,
`test/unit/node-compatibility-policy.test.mjs`, which runs in the default `npm test`
suite and couples to artifacts Task 11 and Task 12 both edit. None blocks acceptance
because each fails loudly at the gate the plan already requires, but each is cheap to
pre-empt.

1. **The release-note filename and version are hardcoded in that test, and Task 12 may
   select a different minor.** `:42` asserts `existsSync('docs/releases/0.3.0.md')` and
   `:50` asserts the note matches `/0\.3\.0/`; `:48-51` also require Node 24, "breaking",
   and the npm 11/12 pairing in that file. Task 12's first step (plan line 449) explicitly
   contemplates the branch "If 0.3.0 is already published, choose the next unused minor
   above 0.2.x." In that branch the implementer needs a release note at a path Task 12
   does not list and an update to a test it does not own, and `npm test` is red until both
   land. Consider adding `test/unit/node-compatibility-policy.test.mjs` to Task 12's
   `Files:` and noting that the release-note path follows the selected version. Related:
   plan line 454's sweep says to search for "the old version" — since the coupling here is
   to the *target* version, consider "the old and newly selected version strings," which
   would surface this file automatically.

2. **The same test constrains README wording that Tasks 11 and 12 rewrite.** `:22-23`
   require README to keep `requires Node.js 24 or later` and to contain no
   "requires/supports/minimum Node 22" phrasing. Task 11 rewrites active README examples
   and Task 12 reconciles its version pins; neither owns this test. A sentence in Task 11
   noting that the Node-floor statement must survive the rewrite would remove the risk at
   no cost.

3. **The same test slices `ci.yml` by job adjacency.** `:31` extracts the compatibility
   job with `/npm-pack-compatibility:[\s\S]*?\n  phase-2-boundary:/` and then asserts the
   node/npm pairs and specific steps inside it. Task 12 adds provisioning steps to those
   jobs, which is safe — the assertions are `match`, not equality, so added steps pass.
   Inserting a *new job* between `npm-pack-compatibility` and `phase-2-boundary` would
   silently empty the slice and turn those five assertions into vacuous matches against
   `''`, which fail rather than pass, so this is loud too. A short note in Task 12 that CI
   changes modify the four named jobs in place and add no job between those two would
   document the constraint for whoever edits the workflow next.

## Decision

accepted
