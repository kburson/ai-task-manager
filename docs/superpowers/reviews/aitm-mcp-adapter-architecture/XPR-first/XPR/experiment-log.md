# XPR-first fresh-context experiment evidence

## Initial conditions

- Started: 2026-09-20T21:47:49.645965+00:00.
- Original checkout: `c2e33f4d0ae704900437a0659119bad6eb30dc01`.
- Original artifact: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`.
- Original SHA256: `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783`.
- Author: fresh `gpt-6-astra`, high effort. Its real runtime thread identity
  was verified against only its own session metadata: distinct spawned Author
  agent with the coordinator as parent. No session history was read.
- Reviewer: fresh `claude-opus-5`, medium effort, launched by the package.
  Project fallback identity is declared model identity, not runtime attestation.
- Protocol: global `ai-peer-review` 0.2.2, normal commit mode, manual transport.
- Runtime: Node v26.8.1, Claude Code 2.1.278, Codex
  0.155.0-alpha.9.2. Manual doctor must pass before start; no automatic-required
  readiness claim is made.

## Isolation and stopping boundary

The Author and Reviewer may use the original spec and its requirements,
repository ADRs and implementation in this checkout, and newly produced review
responses. No initial self architecture review is performed. No memory files,
prior review collateral, historical corrections, other worktrees, or trunk
content may be read. Reviewer isolation instructions are present in the project
Claude instructions before the sealed review starts. The original spec remains
byte-identical at startup.

This is context isolation, not a claim of perfect experimental blinding. Both
participants retain model pretraining and host/system instructions. The Author
received operational protocol instructions and runtime-confounder details from
the coordinator. The coordinator prepared a runtime-only local launcher copy
under ignored scratch: its resume builder uses the event-derived pending turn
and existing permission encoders to avoid a stale original-invitation response
path. This is local runtime carryover, not an upstream release or architecture
finding. Global protocol authority and submit/finalize remain unchanged.

The experiment stops after genuine XPR acceptance, evidence preservation, and
local commits. A later human discussion decides whether to run SPR/SAR. No push,
merge, architecture implementation, or claim of human approval is authorized by
this review. Runtime tests proposed in the spec are not implemented by this work.

## Operational record

- Verified clean starting worktree and original artifact hash.
- Loaded applicable instructions and peer-review, receiving-code-review, and
  verification-before-completion skills.
- `peer-review --version` returned `APR_USAGE` (unsupported command); verified
  version 0.2.2 directly from the installed package metadata instead.
- Project setup completed for Codex and Claude; preserved setup backup privately
  under ignored scratch. JSON formatted before commit.

Further timestamps, input/result commits, hashes, findings, dispositions,
verification, and tool failures are consolidated here after terminal protocol
state; during active review they remain in exact protocol records and runtime
evidence to preserve the ownership boundary.
