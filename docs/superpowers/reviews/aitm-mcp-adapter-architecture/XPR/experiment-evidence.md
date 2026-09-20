---
record_type: experiment-evidence
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 359bcf188b8e2dd63f8bce96f562c32775e532da
reviewed_file_sha256: 58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125
turn_ordinal: XPR setup
turn_description: Cross Provider Review setup and experiment evidence
---

# XPR experiment evidence

The user requested GPT-6 Astra as Author and Claude Opus 5 at medium effort as
Reviewer. The Author continues at high effort. This stage receives the spec
accepted after SPR, with the content hash above. The [prior experiment log](../SPR/experiment-evidence.md)
records the SAR and SPR baseline and methodological limitations.

This remains a sequential case study, not a comparison of three methods on
identical starting artifacts. XPR sees corrections made during SAR and SPR.
The Reviewer should begin in a fresh Claude session; the Author retains prior
context. Repository access means this is not a blinded experiment.

## Setup observations

- Installed review package: `ai-peer-review` 0.2.2. Claude Code: 2.1.273.
- Claude reports an authenticated first-party session. No credentials are
  copied into these records.
- Project-scoped Claude review setup is installed. Manual-mode Author doctor
  reports healthy. Automatic-required transport is unavailable.
- Requested launch model ID: `claude-opus-5`; requested effort: `medium`.
  These are requested settings until a provider launch confirms them. The
  project identity fallback declares this model when Claude exposes a genuine
  session identity without runtime model metadata; such identity must remain
  labeled declared, not promoted to independently attested runtime identity.
- The supported package launcher will be used with the exact generated
  invitation. Author-specific Codex identity environment variables must be
  removed from its child environment so Claude cannot inherit the Author's
  protocol identity. No Claude session ID will be invented or supplied.
- If direct launch cannot complete, retain the failure and provide the generated
  invitation for the user's manual Claude Desktop handoff. A process exit alone
  is not evidence of review submission.

## Evidence contract

Retain submitted findings, Author dispositions, spec revisions, decisions,
provenance hashes, observed timestamps, launch or handoff failures, and recovery
steps here. Keep sealed protocol originals unchanged. Publication copies may
add the requested frontmatter (model, effort, reviewed filepath and commit,
content hash, and XPR round ordinal) while identifying their sealed source and
source hash, as in SPR.

Token totals and monetary cost are unknown until reliable provider evidence is
available. Separate wall-clock intervals from active reasoning time. Record
runtime and transport differences alongside finding counts. Peer consensus
will not constitute human ratification or implementation approval.

No XPR finding or outcome has been observed at setup. Append subsequent
observations without erasing this initial state.

Setup correction: the first start attempt rejected incomplete Claude identity
configuration (`APR_CONFIG_INVALID`, missing provider and host). The declared
identity was completed and revalidated before retry; no review had been created.
