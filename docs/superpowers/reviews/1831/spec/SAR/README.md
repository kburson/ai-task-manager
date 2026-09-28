# Issue 1831 spec SAR

One persistent GPT-6-astra agent authored the specification, reviewed the entire
document each round, saved the review notes, and revised the document until no
findings remained. No additional agents or peer-review protocol were used.

Terminal verdict: **ACCEPTED for SAR semantic readiness**, round 4, revision r3.
This does not record human acceptance or governed Plan approval.

| Round | Input | Material findings | Disposition |
| --- | --- | --- | --- |
| 1 | [r0](spec.r0.md) | 3 | Revise containment, verifier, and scope limits |
| 2 | [r1](spec.r1.md) | 0 | Editorial revision |
| 3 | [r2](spec.r2.md) | 0 | Clarify harness wording |
| 4 | [r3](spec.r3.md) | 0 | Accepted; retain r3 |

Full notes: [round 1](review-response.r1.md),
[round 2](review-response.r2.md), [round 3](review-response.r3.md),
[round 4](review-response.r4.md).

Canonical specification:
[Codex skills read scope](../../../../specs/2026-09-27-1831-codex-skills-read-scope-design.md).

## Snapshot integrity

| Revision | SHA-256 |
| --- | --- |
| r0 | `a77f8d40a2bab115db5a7607c0f77bce2166a5cdb527a5142f5002e2a68a5745` |
| r1 | `96a99827f6e35fa805e6d2d5be859324508db3043fbbc0bb85dc95678db8ac05` |
| r2 | `477ef72fcbe9d11112baa25a7fc73a9bcc1e94e75e0c9d13fe776c5fdc74a9f9` |
| r3 | `99fcbae9ea5292c54ae490d467d8c740edb3b796515b08252a0a7beb78ff65ce` |

The r3 snapshot and canonical document have identical bytes. Snapshots are
immutable review inputs; subsequent changes require another recorded round.

## Operational record

Initial document writes were correctly refused while the issue was in Backlog.
A temporary scratch location was also refused; no policy was bypassed. The
orchestrator subsequently advanced the issue to Plan through sanctioned
transitions, after which document writes were permitted.

The initial live issue inspection found invalid VC1
`npm test -- --runInBand bash-guard`. The accepted spec requires sanctioned
replacement before stamping evidence. No implementation edits, test claims,
commits, or lifecycle mutations were made by this SAR agent.
