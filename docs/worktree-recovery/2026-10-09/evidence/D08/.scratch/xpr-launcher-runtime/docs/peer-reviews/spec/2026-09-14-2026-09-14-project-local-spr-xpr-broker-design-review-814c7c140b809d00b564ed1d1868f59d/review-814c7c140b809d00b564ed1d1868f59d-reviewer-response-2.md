<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-814c7c140b809d00b564ed1d1868f59d"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md"
artifact_commit: "7dfdf255c9b3ee2408e719096a7bf5e07bcc4fe8"
artifact_blob: "4fafa9f821cf062282a845d20b64848355f02bd1"
artifact_digest: "sha256:48b132d85af9a49e8271770b673c4465ed9f403d5667aaf0a44a8347fc8e19b8"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:213be73c4074c670c747a8b650b54a8f2b6d4edf0ba215d148cdc53224221c5a"
  identity_source: "runtime"
started_at: "2026-09-14T02:52:19.455Z"
submitted_at: "2026-09-14T03:15:17.452Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted. All six turn-1 findings are resolved in the revision at commit
`7dfdf255c9b3ee2408e719096a7bf5e07bcc4fe8`. The design is now internally
consistent, states its version boundary explicitly, and separates the several
concepts that were previously conflated: classification versus orchestration
capability, routing identity versus compatibility handshake, and broker protocol
independence versus shared provider-resource compatibility.

The two partial declines are both reasonable and I do not press them.

The R1-F003 decline is a product decision that belongs to the author. My finding
was that mandating a broker for all XPR would invalidate the manual
cross-provider path that works today; the revision resolves the correctness half
by exempting existing reviews and preserving manual recovery, and it labels the
remaining new-start change as deliberately breaking, with a version boundary and
matching acceptance criteria. Requiring a broker for a new manual-transport XPR
is a defensible architectural choice once it is explicit, which it now is.

The R1-F005 decline corrects a premise I flagged, and the correction defeats my
inference. My turn-1 evidence was local: `package.json` at 0.2.2 with public
publish config, `npx --yes ai-peer-review@0.2.2` in generated text, plus README
and `src/public-api.mjs` coordinator entries. I stated the conclusion as a
premise needing an explicit statement rather than an established fact, and that
caution was warranted — local version metadata does not establish tarball
contents. I could not independently reproduce the author's registry fetch: this
session is restricted to `node bin/peer-review.mjs` invocations with no network
or `npm` access, so the claim that the published 0.2.2 tarball omits
`src/coordinator/`, the coordinator exports, and `--phases` is recorded here as
the author's evidence, not as reviewer-verified fact. It is internally
consistent with what I can observe — local `help start` does advertise
`--phases`, and the local checkout carries #9 (`9012a08`) and #10 (`49390e2`)
while still declaring 0.2.2 — and, more importantly, the disposition is now
robust either way: lines 352–355 require rechecking the registry before release
and stopping for an explicit compatibility decision if the surface has shipped.
That mitigation makes the residual disagreement non-blocking.

This remains a design review, not implementation validation. The broker is
unimplemented, so no runtime behavior was exercised; the acceptance criteria are
requirements on future work, not passing tests. Assessment was read-only: the
revised artifact, the author response, the two superseded designs, and the
package help and identity source already inspected in turn 1. No artifact edits,
Git commands, commits, or pushes were performed. Authority verification remains
`unavailable` in this environment, as recorded in the protected frontmatter.

## Findings

None. No new blocking findings. Independent assessment of each turn-1
disposition follows.

**R1-F001 (accepted with clarification) — resolved.** The startup form at lines
23–29 now carries `--artifact-kind`, and the table at lines 61–69 dispositions
every flag the shipped `help start` reports: artifact kind, phases, reviews
root, review path template, record ID, issue, max turns, claim TTL, transport
mode, bootstrap grant, no-commit, and test human authority. Nothing from the
0.2.2 flag list is unaccounted for. `--transport-mode` is explicitly retained as
a constraint feeding the sealed descriptor rather than being silently displaced
by it (lines 77–84), which was the specific ambiguity I raised. The "Startup
contract and version boundary" section (lines 47–59) states plainly that this
describes a proposed contract rather than the installed CLI, requires a new
minor above 0.2.x, forbids republishing 0.2.2, requires pre-mutation failure for
old commands, and forbids defaulting a reviewer. The unsatisfiable acceptance
criterion is replaced by an executable one at lines 472–475. The author's
clarification that absent flags are a baseline fact rather than a shipped claim
is correct and was never in dispute.

**R1-F002 (accepted) — resolved.** The selector table at lines 186–190 maps
`codex`/`claude`/`grok` onto exactly the sealed values in
`src/identity/registry.mjs:18-19` — `openai`/`anthropic`/`xai` with hosts
`codex`/`claude-code`/`grok`. Classification is stated to use the mapped family,
not the selector spelling or model name, which removes the three-vocabulary
collision. Refusing unknown and generic `other` families rather than comparing
them as one vendor closes the misclassification path I was most concerned about.
Sealing the expected identity before registration and checking it before a claim
is a stronger guarantee than I asked for. The Google case is handled correctly
and completely: excluded from the first selector set, forbidden from being
encoded as `other`, gated behind a versioned identity schema, and — the point of
the finding — classified same-family SPR without merging drivers,
authentication, session IDs, or conformance. Lines 205–209 add the general rule
that SPR does not imply orchestration compatibility, which generalizes the
Google case properly rather than special-casing it.

**R1-F003 (partially accepted, brokerless new-start exception declined) —
resolved.** The correctness concern is fully addressed. Lines 42–45, 86–94, and
the acceptance criterion at lines 482–484 establish that existing reviews resume,
submit, advance, and finalize on their recorded modes with no broker, including
reviews started by older packages, and that broker loss leaves exact manual
recovery available. The author is right that this review's healthy manual
transitions demonstrate current behavior rather than a defect in a replacement
policy, and right that converting the rule to automatic-only would reverse the
artifact's central decision — that would have been me substituting my
architectural preference for the author's. The retained new-start requirement is
now explicit, version-bounded, and covered by criteria on both sides. The
qualifications at lines 92–94 are a good addition: a broker must stop automatic
delivery before manual recovery takes over, ambiguous deliveries still need
reconciliation, and manual recovery never licenses a duplicate wake. That
prevents the exemption from becoming a bypass of the outcome-unknown invariant.

**R1-F004 (accepted) — resolved.** The scope is now decided rather than
ambiguous. Locks live at
`<user-cache>/ai-peer-review/provider-resources/<resource-digest>/`, shared
across projects of one OS user and separate from per-project broker endpoints
and review queues. The requirements I asked for are all present: a
version-independent `ai-peer-review.provider-resource/v1` schema every
cooperating version must honor (lines 425–427), fail-closed on unknown schema,
malformed records, foreign ownership, and indeterminate liveness, with the
explicit statement that version skew never permits ignoring a lock (lines
429–430). The resource key is correctly defined as a stable exclusive-resource
identity that cannot be derived from a project path and holds no secret or raw
handle, and adapters that cannot establish that identity are simply unavailable
for automated use — a clean fail-closed rather than a weaker heuristic. The
non-goal tension is reconciled honestly at lines 391–394 and 413–414: shared
lock namespace, no daemon, no queue, no cross-project review routing. Lines
436–440 correctly bound the guarantee to cooperating same-user processes and
keep quota failures as provider errors, which avoids overclaiming what a local
lock can promise.

**R1-F005 (partially accepted, publication premise corrected) — resolved.**
Assessed above in the summary. The design now records the local-source versus
published-artifact distinction (lines 347–355), keeps the removal policy,
requires a new minor for the startup change, and requires a pre-release registry
recheck that stops the release for an explicit compatibility decision if the
coordinator surface has shipped by then. That is the right shape: it does not
depend on either party's reading of today's registry state. The dependency half
of the finding is accepted and addressed at lines 373–379 — #10's wake consumer
moves to the internal broker service boundary in the same delivery, with ordered
phases, author-only finalize and advance, per-phase acceptance, exact recipient
routing, and terminal agreement semantics preserved, and tests and generated
handoffs adapted before the exports are removed. Decision 9 is updated to "before
its first publication," which is the precise claim the evidence supports.

**R1-F006 (accepted) — resolved.** Routing identity and compatibility metadata
are now cleanly split. The root digest at lines 234–248 is an exact ordered JSON
composition with a schema tag, physical worktree root, physical Git common
directory or null, and OS user ID, with canonicalization, Windows path spelling,
and UID/SID encoding all specified — deterministic, which was the defect. Linked
worktrees getting separate brokers is stated explicitly and is consistent with
the package's existing per-review physical-worktree rule. Package, protocol, and
Node major versions become mandatory handshake fields with exact equality and
are explicitly barred from the routing key, and the conditional Node rule is
removed outright. The upgrade gap is closed by the drain path at lines 304–313:
`APR_BROKER_INCOMPATIBLE` at the same endpoint, no second broker, no kill, old
runtime preserved until drain, and an explicit recovery-required state when
preservation cannot be proved — which is the honest answer, since a package
manager can replace module files underneath a live process. Ownership now
restates the #9 invariants directly (lines 315–319), giving them the normative
home they lacked. The 60-second idle rule with timer reset, the correct
observation that reviewer acceptance is not terminal before author finalization,
the platform directory table, and the `APR_BROKER_*`/`APR_PROVIDER_RESOURCE_BUSY`
error family all resolve the optional items as well, and lines 487–498 make the
previously unfalsifiable criteria testable.

## Required changes

None.

## Optional suggestions

None of these blocks acceptance or human ratification; all are for the
implementation delivery.

1. Add agent-facing skill and help text to the documentation reconciliation list
   at lines 454–461. The list covers the README but not the installed skill,
   which currently states that manual transport is "always available"
   ([`SKILL.md`](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/.codex/skills/peer-review/SKILL.md:41)).
   Under the accepted R1-F003 policy that becomes false for a new XPR start,
   while remaining true for continuing an existing review and for recovery. Since
   agents read that text as contract, the delivery should restate it as
   something like "manual transport remains available for handoffs and recovery;
   a new cross-provider start additionally requires the project-local broker."
2. Align the goal bullet at lines 124–125 with the rule at line 221. The goal
   says a broker is required "only when review crosses provider boundaries or
   otherwise needs cross-provider coordination," but the classification section
   now correctly allows an SPR with a same-vendor capability mismatch to require
   broker orchestration, which is not cross-provider coordination. Widening the
   goal to "crosses provider boundaries or lacks a conformant native
   orchestration path" would match the body.
3. Consider whether a platform that cannot construct a usable endpoint should
   permanently block new manual XPR. Line 283 fails preflight on an overlong or
   unsupported endpoint and never falls back, which is the right default, but
   combined with the new-start broker requirement it means such a host cannot
   begin any cross-provider review even when every handoff is human-relayed. An
   explicitly requested, non-default, clearly labeled manual-only start would
   preserve fail-closed behavior while leaving that host usable. If the answer is
   deliberately no, saying so in the version-boundary section would close the
   question.
4. Two small delivery-time items. On Linux, `XDG_RUNTIME_DIR` is the conventional
   location for sockets and lock resources and is cleaned on logout, whereas the
   `XDG_CACHE_HOME` entry in the table at lines 273–277 is a cache subject to
   arbitrary user or tool cleanup; the design already handles deletion safely at
   lines 284–285 and 433–434, so this is a convention preference rather than a
   correctness issue, but it is worth deciding once. Separately, the continuation
   line of the startup acceptance criterion at lines 472–474 is not indented to
   the list item, which is lazy-continuation-legal but reads as a separate block
   in some renderers; indenting it keeps that golden-tested criterion
   unambiguous.

## Decision

accepted
