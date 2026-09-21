---
record_type: 'publication-copy'
model: 'claude-opus-5'
effort: 'medium'
filepath: 'docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md'
commit_sha: 'db28996eeeaa3e290d2b2c18457becaf4f462607'
uncommitted_changes: false
reviewed_file_sha256: '8e1096146ddd98be877b8f56a1ac8a3b54fd73c22f49da4c0dbc73427ec7ac12'
turn_ordinal: 'XPR r2'
turn_description: 'Cross Provider Review revision 2'
role: 'reviewer'
identity_source: 'declared'
source_file: '2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-2.md'
source_sha256: '3757fb4391dc0c2c1b4831b0d78b1e06230776db7331ef178a4773ee809b8f62'
submitted_at: '2026-09-20T21:19:16.206Z'
---

# XPR r2: Reviewer report

Publication copy of the [sealed protocol response](2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-2.md).
The source hash identifies the original. This copy adds the requested frontmatter
and does not replace protocol authority. The original response prose follows unchanged.

Mode: `normal`

## Summary

Scope of turn 2: the revised artifact at commit `db28996e`, blob `a2d358fd`,
digest `sha256:8e109614…` (1771 lines, up from 1509), read end to end, plus the
author response for turn 1 and its nine dispositions. I re-verified each
disposition against the revised spec text rather than against the disposition
prose.

All nine turn-1 findings are resolved. I record that plainly because several of
them were resolved by adding a constraint rather than by relaxing one, which is
the harder and better choice. The Phase 0 feasibility gate (lines 1451-1484) is
the most consequential change in the revision: rather than inventing a GitHub
primitive that does not exist or introducing a weaker assurance tier, it states
that neither ADR 0002 nor this document demonstrates a certified execution mode
for the default provider, and it makes proving one a precondition for approving
Phase 1. That is the correct response to R1-F001, and it is a better answer than
the alternative I offered. The narrowly scoped stale-state recovery mode (lines
707-725), the certified-compatibility staleness classification (lines 677-698),
the quota and backpressure section (lines 1029-1062), the advisory-only learning
drift rule (lines 561-568), the initiating-principal section (lines 931-952),
the explicit binding-exclusivity rules (lines 129-144), the reference snapshot
loader (lines 343-361), and the learning-plane tests plus the 21-row
traceability table (lines 1367-1376, 1699-1727) each land the substance of the
corresponding finding in the spec text, not only in the response.

Four of the author's qualifications are correct and I withdraw the corresponding
parts of my turn-1 reasoning. On R1-F002, the original text did already permit
setup to "verify a continuing, authorized recovery path" as an alternative to
settling pending actions, so the cycle I described had an exit and my "no
specified exit" was overstated; the real defect was the unconditional
disablement of mutating tools, which the revision fixes. On R1-F004, I conflated
a received throttle rejection with a lost response, and the revision's four-way
classification — unsent request, certified no-effect rejection, temporary read
unavailability, unknown write — is a sharper model than the one my finding
assumed. On R1-F006, my "both branches are wrong" framing presumed
naturally-chosen descriptive keys; the new 122-bit randomness requirement
removes the accidental-collision branch, and replay-on-identical-input is the
correct semantics for the deliberate branch, so no intent inference is needed or
should be promised. On R1-F008, the author is right that a staging directory is
not automatically an ownership fence, and the added threat-model qualification
improves on my suggestion.

What remains is narrow. The revision's largest addition, Phase 0, introduces an
execution topology whose consequences for the cloud-and-clone contract and for
Goal 7 are not worked through anywhere in the document (R2-F001) — a new
internal inconsistency created by the fix, not a survival of an old finding.
Two of the new mechanisms are underspecified in ways that will block an
implementer at the first attempt: the compatibility declaration is described as
pointing forward in time from a generator that cannot observe future core
versions (R2-F002), and the snapshot loader's closure rule has no provision for
the peer-dependency edge that every external adapter must traverse to reach the
kernel (R2-F003). One new capability has no defined entry route (R2-F004).

Each of the four is resolvable with a paragraph, and none requires rethinking
the architecture. I am requesting revisions rather than accepting because
R2-F001 touches a stated goal and a stated positive consequence that the
revision has silently made conditional, and readers approving Phase 0 scope
should see that conditionality stated rather than inferred.

## Findings

### R2-F001 — Phase 0's provisioned-dispatcher topology is not reconciled with Goal 7, the cloud-and-clone contract, or the no-daemon non-goal

Severity: high. New in this revision.

Phase 0 names a concrete reference topology: "one explicitly provisioned
dispatcher per conflicting scope on a verified execution target, with other
workers lacking its governed write channels. The supervisor serializes
dispatcher lifetimes and proves the old instance stopped before another starts."
It adds that "This requires real host/credential enforcement across all
participating clones, not just an epoch recorded in GitHub or a local lock
shared by willing callers."

Read carefully, that is the only coherent answer available — since no shared
coordination service is permitted, exclusivity has to come from the fact that
exactly one execution target holds the governed write credential. I agree with
the mechanism. The problem is that the document asserts it in one place and
contradicts it in four others, none of which the revision touched.

Goal 7 promises to "Make a committed installation consumable by a fresh clone or
cloud worker after only `npm ci`." The cloud-and-clone contract states that
after `npm ci` "The agent host reads the committed project integration and
launches the workspace-local AITM MCP server," with no mention that the
resulting server is read-only. The Positive consequences still claim without
qualification that "Cloud environments inherit a complete installation from
version control." And the Non-goals still bar "Requiring an always-running local
daemon for normal use," while Phase 0 introduces a supervisor that must
serialize dispatcher lifetimes — reconcilable only if that supervisor is
per-execution-target and one-shot, as Phase 0's "One-shot supervised execution is
allowed" hints but never states in relation to the non-goal.

Under the Phase 0 topology, a fresh cloud worker is by construction not the
provisioned dispatcher: it is one of the "other workers lacking its governed
write channels." So it can run discovery, help, and diagnosis, and it cannot
admit or dispatch any governed mutation. That is a defensible v1 posture, and it
may well be the right one. But it is a material change to what the document
promises, and it is currently discoverable only by cross-reading Phase 0 against
the setup chapter.

Failure scenario, concrete: a maintainer reads the Summary, Goals, and the
cloud-and-clone contract, and scopes a cloud-worker rollout on the stated
promise that a committed clone is usable after `npm ci`. Phase 0 then certifies
the provisioned-dispatcher topology as the only passing candidate. Every cloud
worker is now read-only for governed mutations, and the rollout's premise is
void. Because the Negative consequences list mentions only that "Default-provider
write readiness remains conditional on the Phase 0 execution proof" — a statement
about whether writes work at all, not about which hosts may perform them — the
planning error is not caught at approval time. The same ambiguity affects this
repository's own routine practice of running several agent sessions in separate
worktrees: whether those sessions are co-located workers sharing one dispatcher,
or separate execution targets that cannot write, determines whether the current
workflow survives Phase 1, and the document does not say.

### R2-F002 — The certified compatibility declaration is specified as pointing forward from a generator that cannot observe future core versions

Severity: medium. New in this revision.

The install manifest now contains "generator package version as provenance, the
setup ABI, and an explicit certified compatibility declaration for consuming
core versions," and the staleness rule reads: "A core version difference alone is
an advisory when an explicit certified compatibility declaration covers the
installed version and all setup ABI, schema, capability, generated-policy, and
executable-identity checks still pass. Semver ranges alone cannot grant that
compatibility."

These two sentences cannot both hold as written. The declaration is written by
setup, using the generator current at setup time. The "installed version" it
must cover is whatever core version a consumer installs later — frequently a
version published after the declaration was written. A declaration that covers
unseen future versions is either a range, which the text explicitly disallows as
insufficient, or an enumeration, which cannot contain versions that did not exist
when it was written. The direction of the guarantee is backwards: compatibility
with a recorded setup ABI is knowledge the *newer core* has, not knowledge the
older generator can certify.

The fix is a direction reversal, not new machinery. The installed core declares
which setup-ABI and configuration/capability schema versions it supports; the
check becomes "the installed core certifies support for the recorded setup ABI
and schema versions," with the manifest's generator version retained as
provenance only — exactly the provenance/semantics split the revision already
introduces one paragraph later ("Producer-version provenance is distinct from
semantic fingerprints").

Failure scenario, concrete: a project runs setup on core 2.3.0. The manifest
records a certified compatibility declaration enumerating 2.3.x. Core 2.4.0
ships, changing no setup ABI, no schema, and no generated artifact. A consumer
runs `npm ci` and installs 2.4.0. The declaration does not cover it, and a range
would not be sufficient proof under the stated rule, so the observation falls
through to "Core crosses certified setup compatibility" and classifies as
portable metadata stale. Every consumer enters diagnostic-only mode and business
mutations are disabled — the precise outcome R1-F003 was raised to prevent,
reintroduced through the mechanism added to prevent it. The Phase 4 test the
revision added ("Exercise a certified compatible core patch with unchanged
semantic setup outputs: version provenance alone must warn rather than disable
business actions") would fail, with no implementation able to pass it.

### R2-F003 — The snapshot loader's closure rule has no provision for the peer-dependency edge every external adapter must traverse

Severity: medium. New in this revision.

The reference loader "materializes the declared closure into a new, private
content-addressed staging directory, verifies every staged byte against the
selected identity, and atomically publishes it for read-only loading. It never
imports from the mutable source checkout or a shared package tree. Relative
imports and asset lookup resolve within the staged closure; undeclared or
escaping resolution is rejected."

The rule covers relative imports and assets. It does not cover bare specifiers,
and the plugin model requires exactly one bare specifier to leave the closure.
The plugin manifest example declares `"peerDependencies": {
"@kburson/ai-task-manager": "^2.0.0" }`, and the SDK entry point is
`import { defineAdapter } from '@kburson/ai-task-manager/adapter-sdk'`. A peer
dependency is by definition not part of the plugin's own installed closure — that
is what distinguishes it from a regular dependency. So when the staged
`dist/adapter.mjs` evaluates that import, Node resolves the bare specifier by
walking `node_modules` upward from the staged file's location. Inside a private
staging directory, that walk either fails outright or escapes the snapshot — and
escaping resolution is what the loader rejects.

Staging a copy of the kernel alongside the plugin does not fix it; it makes it
worse. The plugin would then bind to a second, distinct instance of the kernel
module graph. Class identities, `instanceof` checks, registries, the action
vocabulary, and any module-level singleton would differ between the kernel that
dispatches and the kernel the adapter imports — a failure mode that typically
surfaces as inexplicable type or registration errors rather than as a clean load
failure.

The correct resolution is to declare the kernel edge as an explicitly permitted,
identity-verified escape that resolves to the single live kernel instance — an
import map, a loader hook, or injection of the SDK surface through
`defineAdapter` rather than having the adapter import it. Whichever is chosen,
the loader contract needs to name it, because "undeclared or escaping resolution
is rejected" currently forbids the one edge the plugin model mandates.

Failure scenario, concrete: Phase 5 publishes the SDK and a reference external
adapter built exactly as the artifact's own `package.json` example shows. Phase
4's loader stages its closure and publishes it read-only. The first `import` in
the adapter entry resolves a bare specifier outside the snapshot, the loader
rejects it as escaping, and the adapter cannot load at all. Since "If a host,
loader, native dependency, or dynamic asset cannot satisfy the closure and
ownership contract, that runtime is unsupported until an alternative verified
loading mechanism is certified," the stated consequence is that external
adapters are unsupported — which would void acceptance criterion 4 and Phase 5's
exit ("Prove that an independently built reference adapter requires no core
changes"). The built-in GitHub adapter would not surface the problem, because it
ships inside the kernel and never traverses the peer edge.

### R2-F004 — The stale-state recovery mode has no defined entry route, actor authentication, or transport surface

Severity: low-medium. New in this revision.

The new recovery mode is specified by capability but not by interface: "A
maintainer can enter a narrowly scoped recovery mode while ordinary dispatch is
disabled. It requires a currently trusted, verified runtime with certified
support for the recorded action and journal schemas, authenticated recovery
authority, and exclusive recovery ownership."

Three things are missing. There is no named command or tool: the MCP surface
lists `aitm_recover` among the typed mutation tools, but the artifact never
states whether that tool is the entry point, and if it is, how it remains
callable while "ordinary business mutations are disabled" and diagnostic-only
mode is in force. There is no definition of "authenticated recovery authority" —
the revision carefully defines the initiating principal and separately defines
approval provenance, but recovery authority is a third notion introduced here
and defined nowhere. And there is no statement of where the mode may run: the
paragraph ends with "recovery never silently repairs tracked configuration in a
cloud consumer," which implies evidence repair itself might be permitted from a
cloud consumer, yet under R2-F001's topology a cloud consumer holds no governed
write channel and could not append the recovery records.

Failure scenario, concrete: a project hits the exact situation the recovery mode
was added to solve — an ambiguous pending action plus a stale installation. The
maintainer reads the section, finds no command to run, and reaches for
`aitm_recover`, which the capability resolver reports as unavailable because
mutating tools are disabled in diagnostic-only mode. The documented escape hatch
is unreachable in practice, and the deadlock R1-F002 identified returns in a new
form — not because the rule is wrong, but because nothing connects it to an
invocable surface. The Phase 4 test the revision added ("prove recovery-mode
evidence repair or a staged compatible recovery runtime can resolve it") has no
specified entry point to exercise.

## Required changes

1. Reconcile Phase 0's execution topology with the rest of the document
   (R2-F001). State explicitly which execution targets may perform governed
   mutations under the reference topology, and qualify Goal 7, the
   cloud-and-clone contract, and the "Cloud environments inherit a complete
   installation" positive consequence to say what a non-dispatcher clone can and
   cannot do after `npm ci` — read-only discovery and diagnosis, at minimum,
   versus governed mutation. State whether the Phase 0 supervisor is
   per-execution-target and one-shot, so its relationship to the "no
   always-running local daemon" non-goal is explicit rather than inferred. Say
   directly whether multiple concurrent worktrees or clones on one machine are
   co-located workers under a single dispatcher or separate execution targets.

2. Reverse the direction of the compatibility declaration (R2-F002). Specify
   that the installed core declares the setup-ABI and configuration/capability
   schema versions it supports, and that the staleness check verifies the
   installed core covers the versions recorded in the manifest. Keep the
   generator version as provenance only. This preserves the "semver ranges alone
   are not proof" principle while making the check evaluable by a consumer
   running a core version newer than the one that wrote the manifest.

3. Specify the permitted kernel edge in the loader contract (R2-F003). State
   that the adapter's peer-dependency import of the AITM SDK resolves to the
   single live kernel instance through a declared, identity-verified mechanism —
   import map, loader hook, or SDK injection through `defineAdapter` — and that
   this is the sole permitted resolution outside the staged closure. State
   explicitly that the kernel must not be duplicated inside the snapshot. Add a
   Phase 5 conformance case that loads an external adapter through the snapshot
   loader and asserts it shares kernel module identity with the dispatcher.

4. Give the recovery mode an interface (R2-F004). Name its entry command or
   tool and state how that route remains available while ordinary mutation is
   disabled; define "authenticated recovery authority" and its relationship to
   the initiating principal and to approval provenance; and state which
   execution targets may enter it, consistently with the answer to required
   change 1.

## Optional suggestions

1. The principal-authentication section relies on "a verified operating-system
   identity mapped by trusted project policy." Consider stating explicitly that
   this mapping is an authoritative generated artifact covered by the install
   manifest's content hashes, so that tampering with it classifies as
   installation drift rather than silently redefining the deduplication
   namespace. The protection is inferable from the existing rules; making it
   explicit removes the inference.

2. Phase 0 is referenced from the release gates, acceptance criterion 14, Phase
   1's exit, and the Negative consequences, but the document's Status header
   still reads only that "implementation and provider-plugin delivery remain
   separately gated." Consider updating the Status line to name the Phase 0
   feasibility precondition, since it is now the document's single most
   load-bearing gate and the first thing a reader of the header should learn.

3. The quota section requires Phase 0 to measure "the GitHub reference profile
   and agrees these budgets before approving Phase 1 delivery." Consider naming
   the minimum dimensions a budget must fix — sustained governed actions per
   hour, retained bytes per work item, and cold-replay read count — so that
   Phase 0 cannot exit with a qualitative profile in place of the numbers the
   section's own wording ("explicit numeric operating budgets") clearly intends.

4. Acceptance criterion 8 has grown to five sentences covering staleness
   classification, advisory drift, the recovery exception, and executable
   identity. Consider splitting it; as a single criterion it is difficult to
   mark satisfied or unsatisfied, which is the property an acceptance criterion
   exists to have.

## Decision

revisions-requested
