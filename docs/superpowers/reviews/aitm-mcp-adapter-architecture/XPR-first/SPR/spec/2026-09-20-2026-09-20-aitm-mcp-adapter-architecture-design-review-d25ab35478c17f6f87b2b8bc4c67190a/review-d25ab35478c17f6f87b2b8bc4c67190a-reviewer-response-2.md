<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d25ab35478c17f6f87b2b8bc4c67190a"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "6edf917bdd2d0441ad9c296f69419da08307f758"
artifact_blob: "b44552ca78e058e80fd17123a9b46f374a7103c9"
artifact_digest: "sha256:dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-5.6-sol"
  model_display: "GPT-5.6 Sol"
  session_fingerprint: "sha256:6871f401f6a72a646720760c9a4ccfdcbb3db5fc8e76888427a8d96a3ae73429"
  identity_source: "runtime"
started_at: "2026-09-20T22:19:59.415Z"
submitted_at: "2026-09-20T22:29:20.717Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The Author response accepts the round-one prose finding and all three required
changes. The revised architecture now defines a caller-retained
`invocationKey` before dispatch, durably binds it to one execution-instance
`actionId` and canonical request, distinguishes receipt lookup from fresh
authorization for additional effects, and specifies behavior at every
lost-response boundary. CLI, typed MCP tools, generic actions, and extensions
share that envelope; conflicting reuse fails closed, while identical reuse
returns or recovers the original instance.

The revision also adds the requested Phase 1 schema-freeze requirement,
cross-transport parity checks, adapter conformance cases for creation and
state-only mutations, and acceptance criterion 17. These changes close F1 at
the architecture level. The proposed tests remain future implementation gates;
this review did not execute or imply runtime validation.

The prior round's disclosed incidental exposure to snippets from unrelated
repository designs/plans remains part of the record and weakens the narrow
file-access restriction. No prior-experiment findings or corrected target-spec
version entered this review context. This round used only the generated Author
response, revised target artifact, and previously permitted evidence; no new
isolation breach or tool failure occurred.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted
