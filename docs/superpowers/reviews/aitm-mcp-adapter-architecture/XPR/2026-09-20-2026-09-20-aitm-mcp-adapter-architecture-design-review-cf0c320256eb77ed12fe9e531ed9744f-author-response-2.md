<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cf0c320256eb77ed12fe9e531ed9744f"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "db28996eeeaa3e290d2b2c18457becaf4f462607"
artifact_blob: "a2d358fd42f56e4111ffbbc35d938d6d72004e3c"
artifact_digest: "sha256:8e1096146ddd98be877b8f56a1ac8a3b54fd73c22f49da4c0dbc73427ec7ac12"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:43cb4fd5092989dd837ce1e68485335a8fe08ae750ec96419a461e45e172381b"
  identity_source: "runtime"
started_at: "2026-09-20T20:51:09.519Z"
submitted_at: "2026-09-20T21:25:45.383Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All four remaining findings are accepted. The specification now qualifies clone
portability by execution-target readiness, makes format compatibility a guarantee
of the installed consumer, defines the verified shared SDK edge, and exposes the
evidence-only recovery route through both transports. These are design obligations;
Phase 0 has not been executed and no implementation certification is claimed.

The reviewer confirmed all nine first-round findings resolved and explicitly
withdrew four overstatements in the original reasoning. That distinction remains
in the sealed reviewer response for the experiment; acceptance of a useful change
does not retroactively validate every premise of the original finding.

## Finding dispositions

### R2-F001 — Accepted: make execution-target prerequisites visible throughout

Summary, Goal 7, the cloud-and-clone contract, acceptance criterion 7, Phase 4,
and consequences now distinguish portable read-only integration after `npm ci`
from governed write readiness. Ordinary cloud workers cannot perform evidence or
business mutations. A cloud target may write only after explicit provisioning and
verification under the same reference topology; remote forwarding is not assumed.

Phase 0 specifies a per-target supervisor with a bounded one-shot lifecycle and
exclusion between invocations. Co-located worktrees remain request workers by
default; only explicitly configured workers invoke the shared target-local
dispatcher, which verifies each checkout binding. A separate target needs
certified ownership transfer. Shared machine or user identity is not ownership.
The feasibility proof must demonstrate this workflow and no-daemon operation or
report them unsupported before rollout approval. Thus the design states an
explicit feasibility condition rather than pretending the topology is certified.

### R2-F002 — Accepted: compatibility is certified by the installed consumer

The manifest records the generator version as provenance and the produced ABI
and schema versions. The installed core supplies tested support for those formats;
the older generator does not predict future releases. Semver alone remains
insufficient. The portability suite now explicitly generates with an older core
and consumes with a release that did not exist when the manifest was generated.
All executable, policy, and capability checks remain independent gates.

### R2-F003 — Accepted: pin the SDK peer edge to the live kernel

The reference loader maps the exact public SDK peer specifier through an
identity-verifying loader hook to the dispatcher's single live kernel module
instance. The core identity and SDK ABI are bound into the execution identity.
Private submodule paths, ambient upward resolution, a second kernel copy, and other
escaping imports are rejected. Ordinary dependencies remain within the staged
verified closure. Phase 5 must load the external reference plugin through this
loader and verify shared module and registry identity. This is a required loading
contract, not a claim that a loader has already been implemented or certified.

### R2-F004 — Accepted: define the evidence-only recovery surface and authority

`aitm_recover` and `aitm recover --mode evidence-only` use one recovery service,
with an explicit mode and exactly one existing-action selector; no business-action
payload is accepted. Discovery remains available during authoritative staleness.
Invocation requires a trusted compatible runtime, current scoped policy authority,
applicable approval evidence, and exclusive recovery ownership on the provisioned
execution target. Recovery uses the same authenticated principal namespace; an
actor other than the original initiator requires an explicit current policy grant.
Other clones may inspect authorized evidence and receive invocation guidance but
cannot append recovery records or assume remote handoff. Both transport routes
are covered by the stale-state recovery verification requirements.

## Changes made

Also adopted all four optional suggestions: the principal mapping is explicitly
hashed authoritative policy; the Status line names Phase 0; minimum numeric
budget dimensions are named; and criterion 8 is split into independently testable
checks 8a through 8d while retaining the established 21-criterion numbering and
traceability table.

## Declined changes and rationale

None. The provisioned-dispatcher and verified-loader mechanisms remain candidates
subject to Phase 0 proof, not new claims of proven implementation feasibility.

## Verification

Passed: Prettier for the spec; spelling for the spec and response; repository
Markdown lint (565 files); documentation-anchor validation (38 anchors across
three documents); two fenced JSON examples parsed; and whitespace validation. The
protocol response parser validates the four dispositions before submission.
No runtime architecture test is represented as passing: this remains a design.
