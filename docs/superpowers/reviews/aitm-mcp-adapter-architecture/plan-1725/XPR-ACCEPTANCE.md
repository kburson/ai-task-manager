# Plan 1725 XPR acceptance

Status: **accepted by reviewer consensus**, finalized on 2026-09-21.

- Author: Codex GPT-6 Astra.
- Reviewer: Claude Opus 5, in a separate preserved reviewer session.
- Accepted artifact commit: `7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd`.
- Acceptance-record commit: `12dd3059`.
- Plan SHA-256: `c3afe525cfce93f36259a957ae5d69e1289adfb6c003dac77022605717431520`.
- [Terminal manifest](XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-review-manifest.md).
- [Round 1 review](XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-response-1.md).
- [Author dispositions and verification](XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-author-response-1.md).
- [Round 2 acceptance](XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-response-2.md).

All required findings are resolved. One optional presentation suggestion remains
in the acceptance response: distinguish the full-program close from the core
release gate in the final verification preamble. The reviewer explicitly states
that the existing normative gate semantics are correct and the suggestion is
not a condition of acceptance. The accepted plan bytes are preserved.

This acceptance covers the umbrella hydration plan. It does not authorize
implementation, issue hydration, live provider certification, or replace the
human approval gates. The protocol ran in normal commit mode with manual
transport; human authority assurance is unavailable.

## Earlier attempts

- [Original workspace recovery](XPR/WORKSPACE-RECOVERY.md) preserves the detached
  worktree snapshot and the limitation of the original lost event journal.
- `XPR-recovery-1/` retains the submitted first reviewer response and author
  revision, plus the original startup, invitation, and never-submitted round 2
  template. That attempt was superseded after launcher permission and legacy
  shared-ref failures. Its empty template is not a review decision.
- The user explicitly authorized the replacement recorded in `XPR-recovery-2/`.
  It uses the verified local peer-review tooling commit
  `f722984e13a2903184afbc5686fc8f0fa1c50da6` and its worktree-scoped boundary.
  Claude resumed after the user-identified five-hour usage reset and completed
  two submitted rounds. The author response retains the recovery provenance.

Earlier evidence is historical collateral, not part of the accepted attempt's
native lineage receipt. No historical seals or provider-session identities were
rewritten. All active review changes and finalization used protocol-generated
commits; the remaining invitations and historical templates are archived only
after the protocol reached its terminal accepted state.
