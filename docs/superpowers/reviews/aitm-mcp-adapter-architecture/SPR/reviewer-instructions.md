---
record_type: reviewer-instructions
model: gpt-5.6-sol
effort: medium
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 6891473eb0dca09b0c88d0745f2039c35c82249a
reviewed_file_sha256: 5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b
turn_ordinal: SPR setup
turn_description: Same Provider Review launch instructions
---

# Native reviewer instructions

<!-- cspell:words implementability -->

This is a transcription of the task messages sent through the native agent
tools, retained after protocol finalization. The generated invitation remains
the protocol routing authority. Native launch requested `gpt-5.6-sol`,
`reasoning_effort: medium`, and `fork_turns: none`. No conversation history was
forked. The same Reviewer was resumed for round two.

## Initial launch message

```text
You are the Reviewer for a Same Provider Review (SPR), paired with a separate GPT-6 Astra Author. Use GPT-5.6 Sol at medium effort as configured. Work only in /Users/kpburson/.codex/worktrees/planning/ai-task-manager. Read and follow this exact generated reviewer invitation: /Users/kpburson/.codex/worktrees/planning/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-reviewer-invitation.md . Load the peer-review skill and use installed peer-review help before uncertain commands. Project setup already completed; do not rewrite setup. Run doctor in manual mode, join, review the architecture specification with repository-grounded evidence, write only the exact pending reviewer response, and submit your decision. Do not run Git commands or modify any other tracked artifact. Use your actual distinct runtime session identity; never substitute a fabricated ID or the Author's identity. The Codex CLI identity resolver requires CODEX_MODEL_ID=gpt-5.6-sol and CODEX_MODEL_DISPLAY='GPT-5.6 Sol' on protocol commands; these reflect your configured model, but session identity must come from your own official environment. Stop and report any identity mismatch/blocker. Review substantial correctness, completeness, implementability, contradictions, failure/recovery cases, security and stated acceptance criteria; avoid stylistic churn. In each reviewer response add YAML frontmatter identifying model, effort, filepath, commit_sha, reviewed_file_sha256, turn_ordinal ('SPR r1' initially), and turn_description ('Same Provider Review revision 1' initially), obtaining actual artifact provenance from package state rather than Git. Preserve the generated protocol fields and identity metadata. Keep findings self-contained with stable IDs, severity, affected sections, evidence, consequence, and correction requested; also state scope/limitations and decision. This is a real review, not a no-commit/test-mode exercise. Keep chat terse: operational status and durable response path only. Return after submission for the Author's response; do not launch another agent or another provider.
```

## Frontmatter compatibility correction

```text
Protocol compatibility note: package response metadata is closed (src/collateral/responses.mjs); do NOT add new keys or alter its protected frontmatter. Preserve generated model/artifact/turn metadata, and put additional requested effort and human-readable 'SPR r1 / Same Provider Review revision 1' provenance in the editable Summary section. I will retain publication copies with full requested YAML frontmatter after protocol completion, while leaving sealed originals intact. Continue the substantive review.
```

## Round-two handoff

```text
The Author has submitted revision 1 through the protocol. Resume from /Users/kpburson/.codex/worktrees/planning/ai-task-manager/.scratch/peer-review/review-1ea55e3127774ff3817f44752efcbc79 and read the durable Author response at /Users/kpburson/.codex/worktrees/planning/ai-task-manager/docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-author-response-1.md . Review the committed updated spec and each disposition; assess any new or remaining substantive defects. Write only the protocol's exact pending reviewer response for round 2, preserving protected metadata and recording medium effort and SPR r2 provenance in Summary. Submit revisions-requested or accepted based on evidence. Same identity and Git boundary; no Git commands or other file writes. Return after submission.
```
