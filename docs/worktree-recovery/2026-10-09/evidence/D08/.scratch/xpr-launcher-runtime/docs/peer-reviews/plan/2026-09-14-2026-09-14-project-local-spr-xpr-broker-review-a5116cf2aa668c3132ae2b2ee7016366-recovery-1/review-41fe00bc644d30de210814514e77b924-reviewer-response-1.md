<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-41fe00bc644d30de210814514e77b924"
role: "reviewer"
turn: 1
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
started_at: "2026-09-14T04:55:41.761Z"
submitted_at: "2026-09-14T05:00:02.591Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This is turn 1 of `review-41fe00bc644d30de210814514e77b924`, the successor review under
record `review-a5116cf2aa668c3132ae2b2ee7016366`. The predecessor review was superseded
for an infrastructure reason unrelated to the artifact: concurrent branch work in another
linked worktree changed a retained Git ref, and the package correctly refused a reviewer
submission whose sealed boundary no longer matched (`APR_REVIEWER_GIT_VIOLATION`, with
`artifact_matches: true` and `snapshot_matches: true`, differing only in `refs_digest`).
This successor runs in an isolated clone with an independent ref database and seals the
identical artifact: commit `310893d79ba78b581acc0ed6997cbb65f30a61b8`, blob
`9665885d49b01ee03488a254871556a8338815c1`, digest
`sha256:aae69e115b29295aef67b4f72bbebf34ccc6eaed354d0a63c89de77147f66603`.

I did not carry forward the predecessor's unsubmitted draft decision. I re-derived the
judgment below by reading the artifact and source **in this clone**, and every file, line
number, and count cited here was read here. That re-derivation was not a formality: it
surfaced one detail I had not separately checked before (see Optional suggestion 4).

**What this plan is.** Twelve sequential, individually committed tasks implementing
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`: an author/reviewer intent
startup contract (`--reviewer-provider`, `--reviewer-model`, `--reviewer-effort`
defaulting to `medium`), SPR/XPR classification from resolved provider families, and one
authenticated project-local broker per physical worktree that routes new cross-provider
reviews while leaving existing manual reviews operable without it.

**Assessment.** I judge the plan acceptable. My reasoning rests on four properties I verified rather than
inferred.

**1. The security-critical design constraints survive the decomposition intact.** The
design's fail-closed requirements are not softened anywhere they are restated. Task 4
requires an OS-level exclusive lock plus peer-credential verification (`flock` with
`getpeereid`/`SO_PEERCRED`, `LockFileEx` with an owner-only DACL and client-token SID
check), retained handles for the whole owned lifetime, and explicitly forbids treating
`open('wx')` alone as the lock. Task 5 keeps provider-resource digests independent of
project and package version so locks bind across versions, and states that a timed-out
heartbeat alone never permits stealing and that cache deletion never authorises
ownership. Task 6 pins an immutable runtime image so an upgraded installation cannot
strand a draining broker, and forbids killing, repinning, or starting a second broker on
version mismatch. Task 7 derives terminal state from `reduceEvents`/`statusReview` rather
than inventing protocol states, and requires recovery obligations to be persisted before
locks are released. Task 8 orders startup so that no provider work precedes durable
request and authority registration, and requires automatic delivery to be fenced before
manual recovery can take over. These are the properties that make the feature safe, and
each is stated where an implementer would need it.

**2. Every task owns the files its own changes break.** This is the property the plan most
depends on, because its preamble commits to running `npm test` before every task commit
and to not leaving a known broken default suite for a later task. I tested it against the
suites that are actually coupled to these changes:

- Task 1 adds two flags to `COMMAND_FLAGS.start`. Help output is derived from that
  constant, so this necessarily changes the `help --all` digest; Task 1 owns
  `src/cli/help-data.mjs`, `test/golden/help.test.mjs`, and both hash fixtures.
- Task 4 changes `package.json` dependencies, scripts, and files. Two suites observe
  that: `test/packaging/package.test.mjs` and — less obviously — `test/unit/errors.test.mjs`,
  which asserts all three with exact `deepEqual` at `:18`, `:29`, and `:42` and runs in
  the default suite. Task 4 owns both.
- Task 10 removes the `coordinator` command. Its grammar is asserted in
  `test/unit/cli-parse.test.mjs` and it has a dedicated help contract test in
  `test/golden/help.test.mjs`. Task 10 owns both, and replaces rather than deletes those
  assertions.
- Task 8 makes reviewer selection mandatory for direct service callers. I counted the
  callers in this clone: `startReview(` appears in fifteen files — `test/helpers/intervention-fixture.mjs`
  plus fourteen `test/integration/*.test.mjs`. Task 8's file list names exactly those
  fifteen, with no omission and no nonexistent path.

**3. The distribution decision is made, not deferred, and its cost is scheduled for
evidence.** Shipping a native helper forces a choice about how it gets built for an npm
consumer. The plan commits to one: source plus an opt-in `build:broker-security` script,
pinned `node-gyp@12.4.0` as a production dependency, mandatory absolute `--nodedir`, no
`install`/`postinstall`/startup build, and no prebuilt-binary branch. It states the
consequence honestly — doctor unhealthy, `APR_BROKER_START_FAILED` for new
broker-dependent starts, legacy manual operation preserved. Because that adds a builder to
every consumer install, Task 4 requires `docs/dependency-audit-broker-build.md` following
the evidence model of the existing `docs/dependency-audit-mcp.md`, gathered from an
isolated scratch install with lifecycle scripts disabled, confirmed against the final
committed lockfile, recording the resolved closure via `npm ls --omit=dev --all --json`
plus licences, install scripts, security findings, and installed bytes and package count
before and after. It explicitly declines to pre-approve the result: if the pinned choice
cannot pass, the dependency change stops for a revised decision. That is the correct
posture for a plan written before its own evidence exists.

**4. Version reconciliation fails loudly rather than silently.** A release that renames
the package version while leaving agent-facing guidance pinned to the superseded version
would be a real defect — generated handoffs would direct an agent to a version that by the
plan's own Global Constraints cannot contain the new startup contract. Task 12 enumerates
every active pin: `src/cli/help-data.mjs:883`, `src/cli/run.mjs:595`,
`test/golden/templates.test.mjs:22`, `:80`, `templates/author-startup.md:37`,
`README.md:372-375`, `src/mcp/server.mjs:55`, and `test/unit/errors.test.mjs:13`. I
confirmed all eight exist at those locations in this clone. More importantly, Task 12 does
not rely on the enumeration staying complete: it replaces the permissive
`(?:status|join)` alternation at `test/golden/templates.test.mjs:80` with per-template
exact expectations, adds a `test/mcp/server.test.mjs` case that omits the `version`
argument and compares the captured `createServer` identity against `package.json`, extends
the packaging test to check every active README pin, and requires that these "must fail
when any one active pin or default is stale, even if another rendered command is current."
A general classification sweep over active source, templates, README, and tests backs that
up. I verified both new checks are feasible against source: `createHandoffMcpServer`
exposes an injectable `createServer` alongside the defaulted `version`
(`src/mcp/server.mjs:52-58`), and the packaging test already reads README.

**Design conformance.** The plan's acceptance table maps all fourteen of the design's acceptance criteria to tasks
with named evidence, and I found no criterion dropped or weakened. Two specific
conformance points I checked against source rather than accepting on assertion:

- The design's open question — whether `spr`/`xpr` should be aliases, help topics, or both
  — is resolved as help topics only, and Task 11 implements that through a separate frozen
  registry in `src/cli/help-topics.mjs`, importing the names into `parse.mjs` for named
  help validation only and asserting `COMMANDS.includes('spr') === false`. That is the
  correct seam: `src/cli/parse.mjs:315-316` is exactly where named help topics are
  validated against `COMMANDS` and rejected. It satisfies the design's decision 2 that
  aliases must not make `start` ambiguous, and leaves the `COMMANDS`-driven complete
  command-topic contract at `test/golden/help.test.mjs:9-61` intact.
- The design requires new XPR startup to use the broker even under explicit manual
  transport, while existing manual reviews resume, submit, and finish without one. Task 8
  carries both halves, with fault-injection tests asserting that an unavailable broker
  produces no events and no provider calls.

The plan also stays correctly inside its authority: it does not create issues, authorise
implementation, or authorise release; it refuses to reuse issue #9 or #10 as its delivery
issue; and it requires a fresh registry audit before selecting a release number rather
than trusting the design's dated npm observation.

**Verification performed.** Read in this clone: the plan in full at the sealed commit, the reviewer invitation,
`test/unit/errors.test.mjs`, `test/unit/node-compatibility-policy.test.mjs`,
`test/unit/verify-extraction.test.mjs:325-346`, `src/mcp/server.mjs:52-58`,
`README.md:12` and `:371-376`, `templates/author-startup.md:37`,
`test/golden/templates.test.mjs:18-27` and `:74-81`, `src/cli/help-data.mjs:878-889`,
`src/cli/run.mjs:590-601`, plan lines 197, 215, 216, 236, 437, 454, 455. Searched in this
clone: all `startReview(` call sites; every `0.2.2` occurrence across `src`, `templates`,
`test`, and `README.md`, classified into active rendering sites, active assertions,
historical parser fixtures, and golden fixtures; `package.json`-asserting tests;
release-note and CI-job couplings.

I ran no tests, no Git commands, and no implementation. I could not verify the
`node-gyp@12.4.0` registry metadata offline; plan line 215 makes recording and acting on
it a Task 4 deliverable with an explicit stop condition, which is the right handling and
is not a reason to withhold acceptance of a plan.

**Decision rationale.** Accepting. The plan is internally consistent, its task boundaries are executable under its
own exact-path commit rule, its safety properties match the design, and the one class of
defect that would have shipped silently — stale version pins — is now caught by tests
rather than by an enumeration that could drift. Four optional observations are recorded
below. None blocks acceptance: each would fail loudly at the `npm test` gate the plan
already requires, with an obvious correction, and one turns out to be a non-issue that I
am recording so the next reader does not have to re-investigate it.

## Findings

None.

For record continuity: the predecessor review under record
`review-a5116cf2aa668c3132ae2b2ee7016366` raised eight required changes at its first
reviewer turn, one at its second, and one at its third. I re-verified the two most
structural of those resolutions directly in this clone at the sealed commit — Task 8's
file list names exactly the fifteen files containing `startReview(`, and Task 1 owns
`src/cli/help-data.mjs`, `test/golden/help.test.mjs`, and both
`test/golden/help/*.sha256.txt` fixtures — along with the Task 4 and Task 12 ownership
described in the Summary. Those resolutions are evidence I confirmed here, not a seal
carried over.

## Required changes

None.

## Optional suggestions

Suggestions 1-3 concern one file that no task owns,
`test/unit/node-compatibility-policy.test.mjs`, which runs in the default `npm test`
suite and couples to artifacts Tasks 11 and 12 both edit. Suggestion 4 records a
non-issue so it does not have to be re-investigated.

1. **The release-note filename and version are hardcoded there, and Task 12 may select a
   different minor.** `:42` asserts `existsSync('docs/releases/0.3.0.md')`, `:43` reads
   that exact path, and `:50` asserts the note matches `/0\.3\.0/`; `:45-51` additionally
   require Node 24, "breaking", and the npm 11/12 pairing. Task 12's first step explicitly
   contemplates the branch "If 0.3.0 is already published, choose the next unused minor
   above 0.2.x." In that branch the implementer needs a release note at a path Task 12
   does not list and an edit to a test it does not own, and `npm test` stays red until
   both land. Consider adding `test/unit/node-compatibility-policy.test.mjs` to Task 12's
   `Files:` and noting that the release-note path follows the selected version. Related:
   Task 12's sweep says to search for "the old version," but this coupling is to the
   *target* version — "the old and newly selected version strings" would surface it
   automatically.

2. **The same test constrains README wording that Tasks 11 and 12 rewrite.** `:22`
   requires README to match `/requires Node\.js 24 or later/` and `:23` forbids
   "requires/supports/minimum Node 22" phrasing. That sentence currently lives at
   `README.md:12`. Task 11 rewrites active README examples and Task 12 reconciles its
   version pins; neither owns the test. A sentence in Task 11 noting that the Node-floor
   statement must survive the rewrite removes the risk at no cost.

3. **The same test slices `ci.yml` by job adjacency.** `:31` extracts the compatibility
   job with `/npm-pack-compatibility:[\s\S]*?\n  phase-2-boundary:/` and asserts the
   node/npm pairs and specific steps inside it. Task 12 adds provisioning steps to those
   jobs, which is safe — the assertions are `match`, not equality. Inserting a *new job*
   between `npm-pack-compatibility` and `phase-2-boundary` would empty the slice and turn
   those five assertions into failures against `''`, so this too is loud rather than
   silent. A short note in Task 12 that CI changes modify the four named jobs in place and
   add no job between those two would document the constraint for the next editor.

4. **`test/unit/verify-extraction.test.mjs:335` is not a fourth release-note coupling.**
   It passes `docs/releases/0.3.0.md` to `fakeGit({ current: ... })` in the test "accepts
   bounded standalone release notes." That is a synthetic path in a fake Git listing
   exercising the verifier's standalone-release-note rule, not a filesystem check against
   the real release note, so changing the selected version does not affect it. I checked
   this because it matched the same search as suggestion 1; recording the negative result
   so a future reader or implementer does not repeat the investigation or edit a
   historical-provenance test unnecessarily. Task 12's instruction to leave
   extraction/release evidence unchanged is correct as written.

## Decision

accepted
