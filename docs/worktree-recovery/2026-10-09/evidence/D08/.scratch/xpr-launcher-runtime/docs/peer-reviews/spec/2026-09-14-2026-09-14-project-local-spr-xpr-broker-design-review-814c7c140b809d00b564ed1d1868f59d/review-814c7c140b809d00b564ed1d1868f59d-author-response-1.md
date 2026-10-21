<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-814c7c140b809d00b564ed1d1868f59d"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md"
artifact_commit: "d55d22784f6bf3d68b670c4e4238a0b34acda794"
artifact_blob: "0785db299fa61bb95bd633c51faa132cf654770b"
artifact_digest: "sha256:7596330f04a1a075df884bcb00d74fa88e218df29422840675a2874187f89569"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:9a2b82a26e71ff21997465857f9902cff17d415416b1545d1ed6cc7adb447511"
  identity_source: "runtime"
started_at: "2026-09-14T02:49:44.921Z"
submitted_at: "2026-09-14T03:12:01.979Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the design to make startup migration, provider classification, shared
resource ownership, version upgrades, and phase integration explicit. The
product decisions remain: one package, project-local brokers, broker-managed
new XPR startup, and removal of the unpublished coordinator surface before its
first publication. This remains a design-only review awaiting human ratification.

The reviewer correctly identified underspecified contracts. Two proposed
remedies need correction: a successful legacy manual review does not require
retaining brokerless new startup in a replacement design, and local source
bearing version 0.2.2 does not prove its coordinator code was published in the
0.2.2 tarball. Evidence and dispositions follow.

## Finding dispositions

### R1-F001 — Accepted with clarification

Verified `src/cli/parse.mjs` and `startReview` in `src/cli/run.mjs`: artifact
kind is required, and reviewer-selection flags are absent today. The revised
startup form includes artifact kind; a table dispositions every existing
start flag, including phases, transport, authority, and test-mode flags.
Required reviewer selection is explicitly a future breaking startup contract,
with a new minor release, pre-mutation migration errors, and continued use of
stored descriptors for existing reviews. Golden help and executable startup
fixtures are specified as implementation acceptance checks. The fact that new
flags are not implemented is a baseline fact, not a claim that this design
has already shipped.

### R1-F002 — Accepted

Verified current sealed host/provider enums in `src/identity/registry.mjs`.
The design now maps exact adapter selectors to existing sealed family/host
values and classifies by family. It rejects unknown and generic `other`
families instead of comparing them as one vendor. Expected selection is sealed
before reviewer registration and checked against actual identity before a
claim. SPR does not automatically imply compatible native control: different
surfaces require conformance or broker routing while retaining SPR identity.
Google surfaces are explicitly outside the initial supported selector set;
a future schema-versioned addition would classify them as same-family SPR
without merging their drivers, authentication, session IDs, or conformance.

### R1-F003 — Partially accepted; proposed brokerless new-start exception declined

The existing manual path was verified by this review's own healthy doctor and
protocol transitions. That demonstrates current behavior, not a defect in an
explicit replacement startup policy. The artifact's central decision says XPR
requires a project-local broker; changing this to automatic-only would change
the product decision under review. The revision instead distinguishes new
startup from continuing an existing sealed review and clearly labels the
breaking change. New XPR startup, including requested manual handoff, uses a
broker for registration/routing. Existing reviews continue, submit, advance,
and finalize using their recorded modes without a broker, and a registered
review retains bounded manual recovery after broker failure. Manual handoff
and recovery do not imply automatic wake or permission to duplicate an
unreconciled operation. New-start broker failure remains a visible refusal.
Acceptance criteria cover both behaviors. This reconciles legacy review
continuity without silently reversing the new product architecture.

### R1-F004 — Accepted

The scope was underspecified. Added passive per-user provider-resource locks
outside Git under a version-independent shared namespace, separate from
per-project broker endpoints and review queues. The key represents a stable
exclusive provider resource, never a project path; adapters unable to establish
that identity cannot automate that exclusive surface. All cooperating versions
must honor the resource schema; unknown schema, foreign ownership, and uncertain
liveness fail closed. No new global service is introduced. The design expressly
limits the guarantee to cooperating same-user processes and requires live
provider-state validation for external actors; provider quotas remain provider
errors. Cross-project broker protocol independence no longer implies resource
lock independence.

### R1-F005 — Partially accepted; publication premise corrected by registry evidence

Read the actual registry artifact rather than inferring from local version or
help text. `npm view ai-peer-review@0.2.2 version dist.tarball --json` resolved
[the public 0.2.2 tarball](https://registry.npmjs.org/ai-peer-review/-/ai-peer-review-0.2.2.tgz).
Using Python urllib and tarfile entirely in memory, enumerated its members and
inspected its public API and CLI parser. The archive has no
`package/src/coordinator/` entries, no coordinator public exports or parser
commands, and no `--phases` entry. In contrast, local source at `d55d227`
contains #9 (`9012a08`) and #10 (`49390e2`) while still declaring 0.2.2.
Thus the package is published but those local features are not in that
published artifact. The proposed retention/deprecation requirement is not
supported by the evidence and conflicts with the explicit removal decision.

The design now records this distinction, requires a new minor release for the
startup change, and requires rechecking publication before release. If the
coordinator surface has shipped by then, release must stop for a compatibility
decision rather than assume unpublished status. The dependency concern is
accepted: #10 must move to the internal broker boundary in the same delivery,
with phase-order, author-only advancement, recipient binding, and finalization
checks preserved before removing coordinator exports and generated instructions.

### R1-F006 — Accepted

Split stable routing identity from compatibility metadata. The digest now has
an exact ordered JSON composition containing physical worktree root, physical
Git common directory (or null), and stable OS user ID. Linked worktrees remain
separate. Package, protocol, and Node major versions are mandatory handshake
fields with exact equality initially, never routing-key inputs. A live
incompatible broker remains discoverable and is refused without replacement;
the old runtime must remain intact until it drains, otherwise automation enters
explicit recovery. Foreign locks cannot be stolen. The design names platform
runtime directories, Windows pipe semantics, instance/nonce authentication,
60-second idle shutdown, recovery persistence, and stable error families.

## Changes made

- Added the complete proposed startup contract, its flag migration, and the
  distinction between new-start policy and ongoing manual review recovery.
- Added selector mapping, identity registration checks, and surface-conformance
  requirements independent of SPR/XPR classification.
- Defined routing identity, upgrade refusal/drain, exclusive ownership,
  passive provider-resource sharing, platform endpoints, and shutdown behavior.
- Added concrete release evidence and the required #10 integration disposition.
- Resolved optional suggestions about explicit generated effort, error families,
  ownership invariants, idle grace, and platform paths. Only the nonblocking
  alias/help-topic naming question remains open.
- Added corresponding implementation acceptance criteria; no implementation,
  published package, issue state, or other design document was changed.

## Declined changes and rationale

Retaining brokerless new XPR startup was declined because it reverses the
artifact's proposed broker-owned startup decision. Existing reviews and manual
recovery remain supported, with explicit version-boundary language.

Preserving or deprecating the coordinator public API on the premise that local
0.2.2 source is already published was declined because the actual registry
archive contains no coordinator surface. The design keeps its removal policy,
adds release-time verification, and requires #10's internal-boundary migration.

## Verification

- Read the complete sealed reviewer response, relevant CLI parser and start
  validation, identity registry, public exports, and both referenced prior
  orchestration designs.
- Read the public 0.2.2 npm artifact in memory and compared its coordinator and
  phase surface with local source; no downloaded files were written to the repo.
- The revised specification passes local Prettier check, markdownlint with zero
  issues, and `git diff --check`. An initial Markdown heading false positive for
  a paragraph beginning with an issue number was corrected before rechecking.
- This is document verification only. New broker behavior, conformance, and
  acceptance-test scenarios are requirements for implementation, not passing
  runtime tests claimed by this review.
- Protocol submission will bind this artifact revision and response to the
  sealed reviewer findings through the package's normal commit transaction.
