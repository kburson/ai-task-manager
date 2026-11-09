<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-814c7c140b809d00b564ed1d1868f59d"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md"
artifact_commit: "d55d22784f6bf3d68b670c4e4238a0b34acda794"
artifact_blob: "0785db299fa61bb95bd633c51faa132cf654770b"
artifact_digest: "sha256:7596330f04a1a075df884bcb00d74fa88e218df29422840675a2874187f89569"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:213be73c4074c670c747a8b650b54a8f2b6d4edf0ba215d148cdc53224221c5a"
  identity_source: "runtime"
started_at: "2026-09-14T02:52:19.455Z"
submitted_at: "2026-09-14T03:05:52.685Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested. The core architectural decision is sound and well argued: a
project-local, project-root-scoped broker that exists only while cross-provider
work is live is a better shape than either a separate npm package or a
machine-wide daemon, and the per-project endpoint digest correctly prevents
Project A and Project B from colliding. The author/reviewer intent startup
contract is also a genuine improvement over the `--runtime`-first examples it
supersedes.

Six issues block readiness. Four are contradictions between the design and the
shipped 0.2.2 package it must land in: the startup contract ignores the flags
`start` actually requires today, the SPR/XPR classification rests on a "provider
family" vocabulary that collides with the identity vocabulary already sealed into
event authority, decision 9 asserts a pre-publication premise that the repository
state contradicts, and the "XPR must use the broker" rule would invalidate the
manual cross-provider handoff path that is working right now — including this
review. Two are internal: provider resource leases cannot be both project-scoped
and effective, and broker canonical identity includes package version without
defining upgrade-during-active-review behavior.

This review assessed the pinned artifact at commit
`d55d22784f6bf3d68b670c4e4238a0b34acda794` against the current 0.2.2 repository
source, the superseded September 11 runtime orchestration design, and the
superseded issue #9 durable wake design. Evidence was gathered read-only through
`node bin/peer-review.mjs` help and doctor output and source inspection. This is
a design review, not implementation validation; the broker is unimplemented, so
no runtime behavior could be exercised. No artifact edits, Git commands, commits,
or pushes were performed. Doctor reported `manual` transport healthy with runtime
identity; authority verification is `unavailable` in this environment, which is
recorded in the protected frontmatter as `authority_assurance: unavailable`.

## Findings

### R1-F001 — High: The proposed startup contract omits flags the shipped `start` command requires

**Design references:** Summary startup form, lines 21–33; role model examples,
lines 115–124; decision 1, line 46; acceptance criterion "`peer-review start
<artifact>` remains valid", line 288.

The design presents the agent-facing startup API as artifact plus reviewer
provider, model, and effort, and asserts as an acceptance criterion that
`peer-review start <artifact>` remains valid. The shipped command disagrees.
`node bin/peer-review.mjs help start` reports:

```text
peer-review start <artifact> --artifact-kind <spec|plan> [--phases <kind[,kind...]>]
  [configuration] [--bootstrap-grant <signed-grant>]
  [--no-commit [--test-human-authority <fixture-id>]]
Flags: --artifact-kind, --phases, --reviews-root, --review-path-template,
  --record-id, --issue, --max-turns, --claim-ttl, --transport-mode,
  --bootstrap-grant, --no-commit, --test-human-authority
```

`--artifact-kind` is mandatory, so bare `peer-review start <artifact>` fails today
and the acceptance criterion is unsatisfiable as written. None of
`--reviewer-provider`, `--reviewer-model`, or `--reviewer-effort` exists;
[`src/cli/parse.mjs`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/cli/parse.mjs:22)
contains `--transport-mode` and no reviewer-selection flag.

Three interactions are left undefined:

1. `--artifact-kind` and `--phases` are load-bearing for phased sessions, which
   both this invitation and the author-startup document rely on; the `advance`
   command's documented state is `awaiting-phase-artifact`. The design never
   states that they survive.
2. `--transport-mode` is a user-visible startup flag whose values overlap the
   design's internal sealed descriptor (decision 6). If runtime mode becomes
   internal, `--transport-mode` is either removed, retained as a synonym, or
   silently contradicted. The design picks none of these.
3. Reviewer provider and model are declared required "for agent-driven starts"
   (decision 4), but every current start is agent-driven and none supplies them.
   Making them required is a breaking change to a published command with no
   stated migration.

**Required resolution:** Restate the startup contract against the actual 0.2.2
flag set. Enumerate, for each existing `start` flag, whether it is retained,
deprecated with a migration message, or absorbed into the sealed runtime
descriptor. Replace the acceptance criterion "`peer-review start <artifact>`
remains valid" with one that is executable — for example, "`peer-review start
<artifact> --artifact-kind spec --reviewer-provider <p> --reviewer-model <m>`
succeeds and `--runtime` is not required" — and add a golden help test asserting
the new flag set.

### R1-F002 — High: SPR/XPR classification depends on a "provider family" vocabulary that collides with sealed identity

**Design references:** Classification rules, lines 35–42 and 126–140; reviewer
selection contract, lines 105–124; decision 8, lines 54–55; open question "Which
provider family names are canonical for classification?", line 277.

Classification is normative — it decides whether the broker is mandatory
(decision 8, and line 144's fail-closed `APR_BROKER_START_FAILED`) — but the
vocabulary it classifies on is listed as an open question. Three incompatible
vocabularies are in play simultaneously:

- Sealed identity vocabulary in
  [`src/identity/registry.mjs:18`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/identity/registry.mjs:18):
  `HOSTS = {codex, claude-code, grok, other}` and `PROVIDERS = {openai,
  anthropic, xai, other}`. This is what is actually written into participant
  records; this review's own `participants.json` records `provider: "openai"` for
  the author and `provider: "anthropic"` for the reviewer.
- This design's CLI examples (lines 116–124): `--reviewer-provider claude` and
  `--reviewer-provider codex` — product and CLI names, which are `HOSTS` values,
  not `PROVIDERS` values.
- The superseded September 11 design's adapter vocabulary: `'codex' | 'claude' |
  'grok' | 'gemini'`, plus independently versioned surfaces such as `gemini-cli`
  and `antigravity-cli`.

The collision is not cosmetic. Under vendor vocabulary, Gemini CLI and
Antigravity CLI are one family and would classify as SPR, yet the September 11
design is explicit that their authentication, session IDs, and lifecycle
semantics must never be conflated and that they cannot share one provider-native
orchestration path. Conversely, two Claude models under one Anthropic account
classify SPR correctly under vendor vocabulary but not under product vocabulary
if the surfaces differ. Deferring this to an open question means the design does
not yet determine which reviews require a broker.

**Required resolution:** Define the classification key normatively in this design
rather than as an open question. State whether the key is vendor, product
surface, or the `(provider, host)` pair; state the exact accepted values of
`--reviewer-provider` and how they map onto the sealed `identity/registry.mjs`
vocabulary; and state the classification outcome for the Google case where one
vendor owns two non-interchangeable surfaces. Add the mapping as an acceptance
criterion so classification is testable offline.

### R1-F003 — High: "XPR must use the project-local broker" invalidates the working manual cross-provider path

**Design references:** "XPR must use the project-local broker. If the broker
cannot start or connect, startup returns `APR_BROKER_START_FAILED`", lines
142–144; goal "Require a broker only when review crosses provider boundaries",
lines 72–73; non-goal "Falling back from XPR to SPR … without an explicit new
review request", lines 91–92.

This review is itself a counterexample. Author `provider: openai`, reviewer
`provider: anthropic` — unambiguously XPR under any of the candidate vocabularies
in R1-F002. It started, joined, and reached `reviewer-turn` with `doctor --mode
manual` healthy, transport `manual`, and no broker in existence. The same is true
of the prior cross-provider reviews under `docs/peer-reviews/spec/`. Manual
handoff is described in
[`SKILL.md`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/.codex/skills/peer-review/SKILL.md:41)
as "always available", and the superseded September 11 design preserves
`user-recovery` as the final logical path that cannot be omitted.

As written, the design makes the broker mandatory for the exact class of review
the package currently performs successfully without one, and makes broker start
failure a startup error rather than a degradation to the manual path. That either
breaks manual cross-provider review or contradicts the "manual transport is
always available" invariant inherited from the superseding chain. The non-goal
about not falling back from XPR to SPR is a different concern and does not
address it: falling back from broker-mediated XPR to manual-handoff XPR preserves
both participants' identities and the reviewer selection.

**Required resolution:** Scope the broker requirement to automated XPR
orchestration rather than to XPR as a classification. State explicitly that
manual-transport XPR remains valid with no broker, and that
`APR_BROKER_START_FAILED` applies only when the request asked for automatic
cross-provider orchestration. Add an acceptance criterion that a manual-mode
cross-provider review starts, hands off, and completes with no broker process
created.

### R1-F004 — High: Provider resource leases cannot be both project-scoped and effective

**Design references:** Provider resource leases, lines 238–252, particularly "The
package records provider leases in ignored runtime state and fails closed when a
requested reviewer surface is busy"; multi-project independence, lines 220–236;
non-goals "Installing a global npm dependency, daemon, scheduler, or launch
agent" and "Making one broker coordinate multiple project roots", lines 84–87.

The section correctly identifies that broker isolation does not imply provider
isolation: two project brokers may contend for one desktop application or one
exclusive CLI session. It then places the mitigating lease in "ignored runtime
state" without naming the scope, and the surrounding architecture forbids the
only scope that would work. If the lease lives in project-ignored scratch, broker
A cannot see broker B's lease and the fail-closed check never fires for the
cross-project contention the section was written to address. If the lease lives
in the shared user cache beside `brokers/<project-root-digest>/`, it does work,
but it is machine-scoped shared mutable state coordinating multiple project
roots, which is in tension with the stated non-goals and with "brokers do not
coordinate across project roots" (lines 231–232).

The version skew noted at lines 228–231 sharpens this: two projects may run
different package versions, so a shared lease file needs its own independently
versioned, forward-compatible schema that any participating version can read and
honor. The design states the opposite — that cross-project compatibility is not
required.

**Required resolution:** Decide and state the provider-lease scope explicitly. If
machine-scoped, say so, define the lease record location and its own
compatibility contract independent of package version, define behavior when a
lease is written by an unknown future schema version (fail closed is acceptable;
ignoring it is not), and reconcile the wording of the non-goals so that "no
machine-wide daemon" is distinguished from "no machine-wide shared lease state".
If project-scoped, remove the claim that the package fails closed on
cross-project provider contention and state the residual risk plainly.

### R1-F005 — Medium: Decision 9's "before publication" premise contradicts repository state, and #10 already depends on the surface

**Design references:** Decision 9, lines 56–61; non-goal "Preserving the issue #9
public coordinator surface for backward compatibility", lines 87–88; relationship
to issue #9, lines 198–218; "should not be exposed as the primary CLI, help,
README, or public API surface", lines 216–218.

Decision 9 requires the #9 public coordinator surface to be "removed before
publication, with no backward compatibility requirement". The repository state
does not support that premise:

- [`package.json`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/package.json:43)
  is version 0.2.2 with `publishConfig.access: public` and provenance enabled.
- This review's own invitation and every `help` example advertise the
  zero-install form `npx --yes ai-peer-review@0.2.2`, which only resolves against
  a published registry artifact.
- [`README.md:396`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/README.md:396)
  documents `coordinator run|reconcile|status|stop` as a user-facing command
  family.
- [`src/public-api.mjs:10`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/public-api.mjs:10)
  exports `decideWake`, `canonicalWakeCapsule`, `wakeOperationKey`,
  `inspectCoordinatorLease`, `requestCoordinatorStop`, the ledger functions, and
  `coordinatorStatus`, `reconcileWake`, and `runCoordinator` through the
  package's single `exports` entry point.

Separately, the #9 design states at its line 181 that "#10 begins only after #9
is delivered and closed, and it consumes this public coordinator boundary without
duplicating wake logic". Issue #10 has landed (commit `49390e2`). This design
supersedes the boundary that a delivered downstream issue was built on without
saying what happens to that dependency.

**Required resolution:** Replace the "before publication" framing with the actual
state. State whether 0.2.2 is published and, if so, give the removal a version
policy — for example, removal in the next minor with a deprecation notice, or
retention as documented-internal. Separately, state what #10 must do when the
public coordinator boundary it consumes becomes internal broker machinery, and
whether that work is in scope for this design or a follow-on.

### R1-F006 — Medium: Broker canonical identity includes package version with no upgrade-during-active-review behavior

**Design references:** Canonical broker identity, lines 152–159; endpoint layout,
lines 161–170; lifecycle steps 1–7, lines 178–187; shutdown conditions, lines
193–196.

Package version and broker protocol version are both identity components, so
upgrading `ai-peer-review` inside a project changes the identity tuple and
therefore the endpoint the next CLI invocation computes. The design specifies
broker shutdown only when all reviews it owns are terminal and the idle grace
period expires. An upgrade performed while an XPR review is mid-flight therefore
leaves a live old-version broker owning non-terminal reviews that no new
invocation will ever address, with no shutdown trigger. Lifecycle step 4,
"recover or refuse stale ownership according to lease evidence", does not cover
this case because the old broker is not stale — it is healthy and unreachable.

Two smaller identity questions are also unresolved. The composition rule for
"physical project root" and "Git common directory when present" is not stated, so
linked worktrees of one repository either collapse into one broker or split into
several depending on which field dominates; the package elsewhere enforces
per-review physical-worktree identity through the `physical-worktree` doctor row
and SKILL.md's requirement to join from a distinct session in the same physical
worktree, so the two rules should be stated consistently. And "Node runtime major
version where compatibility requires it" is conditional without saying who
decides the condition, which makes the digest non-deterministic across
implementations.

**Required resolution:** Define upgrade-during-active-review behavior: either
exclude package version from the endpoint digest and make it a compatibility
check performed after connect, with a stated action when versions differ, or keep
it in the digest and define a discovery-and-drain path so an orphaned old-version
broker is detected and shut down. State the exact composition function for the
identity fields, including the worktree rule and a deterministic rule for the
Node major version.

## Required changes

1. R1-F001: Restate the startup contract against the shipped 0.2.2 `start` flag
   set, resolving `--artifact-kind`, `--phases`, and `--transport-mode`, and
   replace the unsatisfiable "`peer-review start <artifact>` remains valid"
   acceptance criterion with an executable one.
2. R1-F002: Make the SPR/XPR classification key normative — exact
   `--reviewer-provider` values, their mapping to the sealed
   `identity/registry.mjs` vocabulary, and the one-vendor/two-surfaces outcome —
   and remove it from open questions.
3. R1-F003: Scope the broker requirement to automated XPR orchestration, state
   that manual-transport XPR remains valid without a broker, and add a
   corresponding acceptance criterion.
4. R1-F004: Decide and state the provider-lease scope, with a version-independent
   schema contract and unknown-version behavior if machine-scoped, or an explicit
   residual-risk statement if project-scoped.
5. R1-F005: Replace decision 9's "before publication" premise with the actual
   publication state plus a version policy, and state the disposition of issue
   #10's dependency on the public coordinator boundary.
6. R1-F006: Define broker behavior when the package is upgraded during an active
   review, and give a deterministic composition rule for canonical broker
   identity including linked worktrees and the Node major version.

## Optional suggestions

1. Answer the open question "Should `--reviewer-effort medium` be printed in
   generated commands?" as yes. Generated commands are copied verbatim by agents
   across sessions, and an explicit value keeps a command's meaning stable if the
   default changes later. This matches the package's existing preference for exact
   printed recovery commands over implied state.
2. Give the broker a stable error family rather than the single named
   `APR_BROKER_START_FAILED` (line 144). At minimum, distinguish start failure,
   version or protocol incompatibility on connect, stale-ownership refusal, and
   provider-surface contention, so `explain` can carry one exact recovery command
   per case as the September 11 design's recovery reporter requires.
3. Inherit the #9 lease invariants explicitly instead of summarizing them as
   "recover or refuse stale ownership according to lease evidence" (line 182). The
   concrete rules worth restating are: an exclusive lock resource plus diagnostic
   lease, file contents never proving liveness, stop by verified instance ID and
   nonce rather than by caller-supplied PID, and never removing a foreign lease.
   Since this design supersedes #9 as the product design, those invariants
   otherwise have no normative home.
4. Make two acceptance criteria falsifiable. "The broker exits after terminal
   active reviews and idle grace" (line 293) cannot be tested while the grace
   period remains an open question (line 280) — pick a value. "Issue #9 mechanics
   are reused only as internal broker machinery where they still fit" (lines
   294–295) has no test — replace it with an assertion about the public surface,
   such as the absence of coordinator entries from `help`, README, and
   `src/public-api.mjs`.
5. Consider stating the user-cache directory choice (line 281) as an explicit
   platform table now. It affects the endpoint path layout at lines 166–170 and
   the provider-lease location in R1-F004, so leaving it open leaves two other
   sections underspecified.

## Decision

revisions-requested
