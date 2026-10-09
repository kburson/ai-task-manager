<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a5116cf2aa668c3132ae2b2ee7016366"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-project-local-spr-xpr-broker.md"
artifact_commit: "48e7352f9f14bdd0e060d17332c73e1da64c1a54"
artifact_blob: "76b41586418d2226afc74497b5e56481011c2fc8"
artifact_digest: "sha256:86fa9c5620574704b1e00701ef7f24100d57f52f76f15b77a19f2364f45e466a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
  identity_source: "runtime"
started_at: "2026-09-14T04:06:20.451Z"
submitted_at: "2026-09-14T04:46:07.878Z"
finding_ids: ["R3-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed revision `48e7352` of `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`
against the linked design and current repository source, and independently verified the
R2-F001 disposition and all three optional-suggestion adoptions rather than accepting
author response 2's summary.

**R2-F001 is fully resolved, and the resolution is stronger than what I asked for.**
Task 4 now creates `docs/dependency-audit-broker-build.md` in its `Files:` list (plan
line 197), and plan line 215 adds an audit step that is ordered before the dependency
change step at line 216. The step requires the same evidence fields as the precedent
document (version, licence, Node engine, registry modified date, integrity, tarball URL),
plus scope, alternatives, and a recorded decision. Three things in it go beyond the
required change:

- It specifies `npm ls --omit=dev --all --json` for the resolved closure. The `--all`
  flag is the precise answer to what I flagged: the existing assertions at
  `test/packaging/package.test.mjs:78-89` report only the root's direct dependencies and
  therefore cannot see the graph the audit exists to examine.
- It states that the plan is not evidence that the future resolved graph has passed its
  audit, and that an unacceptable result stops the dependency change for a revised,
  reviewable decision. That is the correct epistemic posture for a plan written before
  the evidence is gathered, and it is what keeps this from becoming a rubber stamp.
- It requires the audit to land in the same exact-path commit as the dependency and
  lockfile change, so the evidence cannot drift from what it approves.

Author response 2 also correctly declines to over-claim: it says precedent alone does not
settle whether every audit is mandatory, and rests the decision on the specific fact that
a builder is being added to every consumer installation. I agree with that framing.

**All three optional suggestions were adopted, and the two with checkable content are
accurate.** Optional suggestion 1 became a runtime-reachability regression in the
already-owned `test/unit/broker-build.test.mjs` (plan line 235): help and existing
manual-review status operations may neither import nor launch `node-gyp`, while the
explicit build must resolve and spawn the pinned package-local builder. That is exactly
the property the distribution decision relies on and that the depth-0 assertions cannot
express, and keeping the lockfile as transitive authority instead of freezing a second
closure inventory into a test is the right call — a hardcoded closure set would rot on
every transitive bump. Optional suggestion 2 is applied at plan line 70.

Optional suggestion 3 produced plan line 454, and I verified all four cited sites against
source. Every one is exact: `src/cli/help-data.mjs:883` is the rendered
`npx --yes ai-peer-review@0.2.2 ...` example; `src/cli/run.mjs:595` is the
`zero_install_join_display` command; `test/golden/templates.test.mjs:22` is the
`zero_install_join_display` fixture value that Task 11 moves into
`test/helpers/template-values.mjs`; and `test/golden/templates.test.mjs:80` is the
`/`npx --yes ai-peer-review@0\.2\.2 (?:status|join) /` assertion. The instruction to
locate them by expression rather than by line after earlier tasks shift code is the right
qualification.

**One new finding.** Checking that enumeration for completeness — which is the point of
having one — showed it omits three version-bearing surfaces, none of which any test would
catch, and none of which Task 12 owns: `templates/author-startup.md:37`,
`README.md:371-376`, and `src/mcp/server.mjs:55`. Two of the three are agent-facing
guidance that would ship a 0.3.x release pointing readers at `ai-peer-review@0.2.2` — a
version that by this plan's own Global Constraints cannot contain the new startup
contract. Details in R3-F001. This is narrow and has a clean alternative fix; it is the
only thing standing between this plan and acceptance.

Nothing else regressed. I re-read the preamble and implementation choices (lines 36-95),
Task 4 (lines 196-236), Task 11 (lines 383-417), Task 12 (lines 436-470), and the
acceptance coverage table (lines 472-489) at this revision. The acceptance table still
maps all fourteen design criteria with no criterion dropped, the Task 1 / Task 8
enforcement split and the fifteen-caller migration list are unchanged, the concept-help
seam at `src/cli/parse.mjs:315-316` is unchanged, and the two generation procedures are
unchanged apart from the repository-root clarification.

Verification performed this turn. Read: the revised plan sections above, author
response 2, `src/cli/help-data.mjs:878-889`, `src/cli/run.mjs:590-601`,
`test/golden/templates.test.mjs:18-27` and `:74-81`, `src/mcp/server.mjs:52-58`,
`templates/author-startup.md:35-37`, `README.md:371-376`,
`test/packaging/package.test.mjs:11-13` and `:109-119`, `test/mcp/server.test.mjs`
version fixtures. Grep: every `0.2.2` occurrence across `**/*.{mjs,md,json}`, separating
active code, tests, and documentation from sealed review collateral and historical plans.
I ran no tests and no Git commands. I did not re-verify the `node-gyp@12.4.0` registry
metadata, which remains unverifiable offline and is not the basis of any finding; plan
line 215 now makes that verification a recorded deliverable of Task 4, which is the right
place for it.

## Findings

### R3-F001 — Task 12's version-site enumeration omits three unowned version-bearing surfaces, so a 0.3.x release would ship agent-facing guidance pinned to 0.2.2

**Severity:** required. **Introduced by:** revision 2, in the step added for optional
suggestion 3. **Not a re-litigation:** the four sites the step names are correct; the set
is incomplete.

Plan line 454 reads: "When the selected release version changes, update hardcoded package
versions in `src/cli/run.mjs` and `src/cli/help-data.mjs`, the shared template fixture
values, and version assertions in golden/smoke tests in the same commit. The current
assertion sites are..." followed by four exact references. That phrasing reads as the
complete set, and author response 2 describes it as naming "the current packaged-command
render sites and template version assertion." A full search for `0.2.2` across active
source, tests, templates, and documentation finds three further hardcoded occurrences
that the step does not name and that Task 12's `Files:` list does not include:

1. **`templates/author-startup.md:37`** — `Zero-install help:` followed by a literal
   `npx --yes ai-peer-review@0.2.2 status --help`. This is literal template text, not a
   substituted variable; `templates/reviewer-invitation.md` correctly uses the hydrated
   `zero_install_join_display` and has no literal, which is why only this one file is
   affected. Task 11 owns `templates/author-startup.md`, but Task 11 runs before Task 12
   selects the release number in its first step, so the correct value is not knowable
   when Task 11 executes. Task 12 knows the value but cannot edit the file.
2. **`README.md:371-376`** — four pinned zero-install examples, including
   `npx --yes ai-peer-review@0.2.2 start docs/spec.md --artifact-kind spec`. Task 11 owns
   `README.md` and will rewrite that example's grammar for the new required reviewer
   flags; the pin has the same ordering problem as item 1.
3. **`src/mcp/server.mjs:55`** — `version = '0.2.2'` as the default parameter of
   `createHandoffMcpServer`, which is the identity the MCP server advertises. No task in
   the plan lists `src/mcp/server.mjs`.

**Why no test catches any of them.** This is what makes the omission consequential rather
than cosmetic:

- `test/golden/templates.test.mjs:80` asserts
  `/`npx --yes ai-peer-review@0\.2\.2 (?:status|join) /`. After a bump, the `join` branch
  is satisfied by the regenerated `zero_install_join_display`, so the assertion passes
  while the `status` literal in the template still says `0.2.2`. The alternation hides
  exactly the case in item 1.
- `test/packaging/package.test.mjs:109-119` checks README against `SOURCE`, `FILTERED`,
  and `BOOTSTRAP`, which are commit SHAs (`:11-13`), not versions. README's pins are
  unasserted.
- `test/mcp/server.test.mjs` passes `version: '0.2.0'` explicitly in every fixture, so it
  overrides and never exercises the `src/mcp/server.mjs:55` default.

So all three fail silently, which is precisely why an enumeration was worth adding and
why it needs to be complete.

**Why this matters beyond tidiness.** The design's goals include teaching agents the
complete CLI contract through offline help and examples, and the plan's Global
Constraints require the first release implementing this contract to use a new minor
version above `0.2.x` that must not republish `0.2.2`. A 0.3.x release whose generated
author-startup handoff and README instruct an agent to run
`npx --yes ai-peer-review@0.2.2` would send that agent to a package version that by
construction lacks `--reviewer-provider`, `--reviewer-model`, the broker, and the whole
startup contract this plan exists to deliver. The generated handoff is the primary
agent-facing artifact of the feature. This also sits against the acceptance-table row
"Historical docs point to replacement startup contract."

**Why the plan cannot absorb it as written.** Task 12 ends with "commit exact
package/CI/release/test paths," and none of the three files appear in its `Files:` list.
An implementer who notices the stale pin at Task 12 is blocked from fixing it in that
task. This is the same unowned-file class as reviewer response 1's findings 1 through 4
and R2-F001, all of which the author has otherwise closed thoroughly.

**Two acceptable resolutions.** Either is sufficient; I am not requiring a particular one:

- Add `templates/author-startup.md`, `README.md`, and `src/mcp/server.mjs` to Task 12's
  `Files:` and to the line 454 enumeration, noting that the template and README edits are
  the version pin only, since Task 11 already owns their prose.
- Or have Task 11 remove the version pin from the agent-facing zero-install examples in
  `templates/author-startup.md` and `README.md` — for instance an unpinned or
  `@latest`-style form, or text directing readers to the installed version — and have
  Task 12 own only `src/mcp/server.mjs`. This removes the reconciliation obligation
  permanently rather than re-solving it at every release, and it suits guidance whose
  purpose is "use the current contract." If the pin is retained deliberately for
  reproducibility, say so and take the first option.

## Required changes

1. **Complete the version-site reconciliation in Task 12, or remove the pin in Task 11
   (R3-F001).** Take either resolution described in the finding. If the first: add
   `templates/author-startup.md`, `README.md`, and `src/mcp/server.mjs` to Task 12's
   `Files:` list and name them in the line 454 enumeration alongside the four existing
   sites. If the second: state in Task 11 that agent-facing zero-install examples in
   `templates/author-startup.md` and `README.md` carry no hardcoded version, and leave
   only `src/mcp/server.mjs` for Task 12. In either case, consider whether the
   `(?:status|join)` alternation at `test/golden/templates.test.mjs:80` should be
   tightened so a stale literal in the template cannot be masked by the hydrated
   variable — Task 11 and Task 12 both already own that file, so no new ownership is
   needed for it.

This is the only required change outstanding. R2-F001 and all three optional suggestions
from reviewer response 2 are verified resolved against source, as are all eight required
changes and six optional suggestions from reviewer response 1. Once the version-bearing
surfaces are either owned or made version-neutral, I expect to accept on the next turn
without further findings.

## Optional suggestions

1. Plan line 215 says "Before adding the production dependency, write
   `docs/dependency-audit-broker-build.md` ... inspect the resolved production closure
   with `npm ls --omit=dev --all --json`." Taken literally the ordering is
   self-blocking: the resolved closure does not exist until `node-gyp@12.4.0` is in the
   dependency set and the lockfile is updated. The step's closing sentence — keep the
   audit in the same commit as the approved dependency and lockfile changes — already
   implies the ordering is logical rather than temporal, but one clause would remove the
   ambiguity for an implementer: gather the closure evidence from a scratch resolution
   (for example `npm install --package-lock-only` in a throwaway tree, or inspection of
   the packed tarball) before committing the change, then confirm the recorded closure
   against the final lockfile in the same commit. This preserves both properties the step
   wants: evidence precedes approval, and the recorded evidence matches what ships.

2. Consider naming, in the Task 4 audit step, the specific consumer-visible figure the
   size-delta evidence should record — installed bytes and package count for a production
   install of `ai-peer-review` before and after. The step currently says "installed-size
   delta against the baseline," which is right, but a named unit makes the result
   comparable across future audits and gives the "unacceptable result" stop condition
   something concrete to test against. Purely an ergonomics note.

## Decision

revisions-requested
