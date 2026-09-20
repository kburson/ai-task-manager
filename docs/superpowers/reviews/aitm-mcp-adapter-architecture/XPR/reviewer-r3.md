---
record_type: 'publication-copy'
model: 'claude-opus-5'
effort: 'medium'
filepath: 'docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md'
commit_sha: '267b91b9218b59342a0d70e0859a0e38523a3923'
uncommitted_changes: false
reviewed_file_sha256: '4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382'
turn_ordinal: 'XPR r3'
turn_description: 'Cross Provider Review revision 3'
role: 'reviewer'
identity_source: 'declared'
source_file: '2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-3.md'
source_sha256: '1e54244a0872874900a05da7022b37386cd2f750d52f7578c1d528edbc35feea'
submitted_at: '2026-09-20T21:27:27.734Z'
---

# XPR r3: Reviewer report

Publication copy of the [sealed protocol response](2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-3.md).
The source hash identifies the original. This copy adds the requested frontmatter
and does not replace protocol authority. The original response prose follows unchanged.

Mode: `normal`

## Summary

Scope of turn 3: the revised artifact at commit `267b91b9`, blob `9e98109e`,
digest `sha256:4c3e51d9…`, plus the turn-2 author response and its four
dispositions. I verified each disposition against the revised spec text rather
than against the disposition prose, reading the changed regions in full —
Status and Summary (lines 5-38), Goal 7 (73-76), the loader contract (349-376),
the cloud-and-clone contract (638-668), installation staleness and the recovery
surface (670-768), initiating-principal authentication (974-998), quota budgets
(1075-1087), the portable-install and learning-plane tests (1389-1432), Phase 0
(1507-1553), Phase 4 and Phase 5 (1602-1624), the acceptance criteria and
traceability table (1702-1808), and the consequences (1810-1841).

All four turn-2 findings are resolved, and all four optional suggestions were
adopted. I am accepting.

R2-F001 is resolved thoroughly rather than narrowly. The revision did not simply
add a caveat where I pointed; it propagated the execution-target distinction
through every place the old promise appeared — the Summary now states that
"installing a clone alone enables read-only discovery and diagnosis, not write
ownership," Goal 7 is rewritten to promise read-only discovery after `npm ci`
with governed writes requiring "a provisioned, verified execution target," the
cloud-and-clone contract states that "ordinary cloud workers and independent
clones lack governed write channels," the positive consequence is qualified, and
acceptance criterion 7 and Phase 4 match. Phase 0 now answers the two questions
I raised directly: the supervisor "is per execution target and supports a
one-shot lifecycle around a bounded dispatch invocation," with the exclusion
holding "between invocations as well as during them" and "No always-running
local daemon or hosted AITM service is required," which reconciles it with the
non-goal; and the multi-worktree case is addressed explicitly — co-located
worktrees are "independent request workers by default, not independent write
owners," may invoke a shared target-local dispatcher when explicitly configured,
and "Sharing a machine, OS user, or filesystem does not itself establish this
boundary." Phase 0 must "demonstrate the co-located multi-worktree route and the
no-daemon lifecycle, or record them as unsupported before rollout approval."
That is the honest form of the answer, and the added requirement to record an
unsupported result is better than a bare promise to try.

R2-F002 is resolved by the direction reversal: "The installed core ships a
tested support declaration for the setup ABI and configuration/capability schema
versions it can consume. Startup checks that declaration against the versions
recorded in the install manifest. The old generator does not predict or certify
future core releases." The staleness table rows were rewritten to match
("Installed core does not support recorded setup ABI"; "Core version differs
with recorded formats supported"), and the portable-install test now generates
with an older core and consumes "with a core release that did not exist at
generation time" — which makes the previously unpassable Phase 4 case passable.
The "Semver ranges alone cannot grant that compatibility" principle is retained.

R2-F003 is resolved with more precision than I asked for. The loader now
disables ambient upward `node_modules` resolution, routes ordinary bare
dependencies through "declared, verified mappings" inside the staged closure,
and names the single exception: "The sole permitted external module edge is the
declared `@kburson/ai-task-manager/adapter-sdk` peer import. An
identity-verifying loader hook binds that exact SDK export surface to the single
live, trusted kernel module instance used by the dispatcher." It closes the
duplicate-kernel hazard explicitly ("The snapshot must not contain a second
kernel copy"), bars private submodule paths, and binds both the staged bytes and
the shared edge into the execution identity. Phase 5 gains the matching
conformance obligation: load the external reference adapter through the loader
and "assert that its SDK import shares module and registry identity with the
dispatching kernel."

R2-F004 is resolved with a concrete surface on both transports: `aitm_recover`
and `aitm recover --mode evidence-only`, one recovery service, "exactly one
selector" by `actionId` or authenticated principal/request-key pair, business
payloads disallowed by schema, and the routes explicitly "remain discoverable in
diagnostic-only mode" with only the evidence-only branch callable. "Recovery
authority" is now defined rather than assumed — "the authenticated initiating
principal has a current policy grant scoped to the recorded action and recovery
operation; knowledge of its identifier is not a grant" — and is tied back to the
existing principal namespace with no third identity concept, which was the
specific risk I flagged. Placement is stated and consistent with R2-F001:
evidence writes run only on the provisioned target, other clones may inspect and
receive invocation guidance but "cannot append evidence or assume an automatic
remote handoff." The portable-install test exercises both routes and asserts the
ordinary cloud worker is refused.

I note one editorial defect and one granularity observation below as optional
suggestions rather than findings, because neither can change implementation
behavior: the first is a malformed sentence fragment left by an edit, and the
second is a presentation choice the author made deliberately. Neither justifies
another round. I record explicitly that this acceptance covers the architecture
document only. Consistent with the author's own framing, Phase 0 has not been
executed, the provisioned-dispatcher topology and the verified loader remain
candidates rather than proven mechanisms, and nothing in this review constitutes
evidence that any implementation passes.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. The first install-manifest bullet (lines 674-675) reads "generator package
   version as provenance, the setup ABI, and an explicit recorded configuration
   and capability formats". The trailing clause is a malformed fragment left
   from replacing the previous "certified compatibility declaration for
   consuming core versions" text, and it now duplicates the third bullet,
   "configuration and capability schema versions". Suggest reducing the first
   bullet to the generator version as provenance plus the setup ABI, and letting
   the third bullet carry the recorded formats — the normative content is
   already correct in the prose at lines 712-718.

2. Acceptance criterion 8 is now split into 8a through 8d, but the
   traceability table still carries a single row `8` mapping all four to one
   coverage string. The author noted this was deliberate to preserve the
   21-criterion numbering, which is reasonable. If the table is ever regenerated,
   consider four sub-rows so that each independently testable check has its own
   named coverage; the value of splitting the criterion is mostly realized at
   the point where a phase specification must map it to tests.

3. Phase 0 must "demonstrate the co-located multi-worktree route and the
   no-daemon lifecycle, or record them as unsupported before rollout approval."
   Consider stating where an unsupported result is recorded and what consumes it
   — a Phase 0 outcome record that the capability resolver reads, for example —
   so that an unsupported multi-worktree route surfaces to an agent as a typed
   unavailability reason rather than only as a line in a specification. This
   repository's own workflow depends on that route, so the failure path deserves
   the same discoverability the design gives every other blocked capability.

## Decision

accepted
