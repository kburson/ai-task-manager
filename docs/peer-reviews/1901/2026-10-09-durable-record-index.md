# #1901 durable preparation and review records

Issue comments are process summaries and navigation. Specifications, plans, full reviewer findings, author dispositions, manifests, protocol timing, and preparation analysis are maintained in Git. Accepted artifacts use their accepted commit and digest; finalization and documentation commits are separate provenance.

## Record index

| Stage | Process record | Detailed evidence |
| --- | --- | --- |
| Specification SAR | [Manual Astra 6 high SAR](../spec/2026-10-08-1901-astra-sar.md) | Three reviewer rounds and two author dispositions linked in the record |
| Specification XPR | [Claude Opus 5.5 high XPR](xpr/1901-xpr-record.md) | Three sealed reviewer rounds, two author dispositions, and manifest linked in the record |
| Plan SPR | [Astra 6 high SPR](plan/2026-10-08-plan-spr-record.md) | Three sealed reviewer rounds, two author dispositions, and manifest linked in the record |
| Plan XPR | [Claude Opus 5.5 high XPR](plan/2026-10-08-plan-xpr-record.md) | Four sealed reviewer rounds, three author dispositions, and manifest linked in the record |
| Deep dive | [Accepted-plan preparation analysis](../../superpowers/plans/2026-10-08-1901-deep-dive.md) | Source inspection, joint-effort amendment, decomposition, verifiers, dependencies, and stopping boundary |
| Hydration | [Refinement and preparation handoff](../../superpowers/plans/2026-10-08-1901-hydration-handoff.md) | Ten-child WBS, estimates/ranks, current readiness, and genuine Plan-to-Develop blockers |

The accepted specification is pinned at bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8. The final accepted plan is pinned at e8a34e7b1fbb39cafddae7a4189d819f005ba4b9. Astra's plan SPR acceptance refers to its predecessor; Claude's plan XPR acceptance refers to the final revised plan. This publication cleanup does not modify accepted artifact bytes or review responses, rerun reviews, approve a lifecycle transition, or begin implementation.

## Issue publication convention

For specification, plan, and review records, publish a short outcome and process summary with author/reviewer identity and effort, the joint elapsed review span when known, and a compact table of rounds. Every round links directly to immutable origin reviewer notes and its author disposition. Link the accepted artifact and complete Git-tracked record. Keep full findings, manifests, recovery details, timing-event tables, and document contents in the tracked records.

Maintain exactly one issue-comment block per artifact/review type: Design Specification Review: SAR or SPR, Design Specification Review: XPR, Implementation Plan Review: SPR, and Implementation Plan Review: XPR. Each block includes a File Under Review link pinned to the reviewed artifact revision and a table linking every reviewer round and author disposition. Do not publish additional per-round, author-response, manifest, or duplicate acceptance comments. The user's later consolidation instruction supersedes the initial pointer-per-comment strategy; redundant comments are removed only after their content is preserved in Git. See the [consolidation record](2026-10-09-review-comment-consolidation.md) for retained and removed comment IDs. Update each retained logical comment through its existing AITM ownership key. Review acceptance remains reviewer consensus and is distinct from human approval or AITM Plan approval.

## Preserved historical comment text

Before reducing issue content, the exact bodies of all 22 owned preparation/review comments were preserved below, with their original IDs and creation/update times. These are historical snapshots, including then-current statuses; they do not supersede current accepted records. Raw comment text is fenced to preserve bytes and prevent its embedded historical headings or markers from being mistaken for current evidence.

- [Specification summaries and embedded design](2026-10-09-issue-archive-spec-records.md)
- [Specification XPR responses and manifest](2026-10-09-issue-archive-spec-responses.md)
- [Plan XPR responses and manifest](2026-10-09-issue-archive-plan-responses.md)
- [User clarification, plan review summaries, deep dive, and hydration](2026-10-09-issue-archive-preparation-records.md)

## Current AITM presentation constraints

The operational Governing-spec, Source-plan, and Source-plan-commit fields were restored on #1901 after the user's readability edits, preserving the visible grouping and review-before-acceptance order. [Feature #1939](https://github.com/kburson/ai-task-manager/issues/1939) tracks the shared artifact-reference contract, removal of duplicate operational fields from visible Markdown, consolidated review publication, safe historical backhealing, and enforcement for future stories. Its [durable intake record](2026-10-09-1939-artifact-record-feature-request.md) preserves the complete filed requirements.

AITM reads repository-relative operational keys such as Source-plan and Decomposition-plan; Accepted-plan is not a recognized alias and Markdown URLs are not resolved as local plan paths. The human's latest Design Specification / Implementation Plan / Backlog Hydration Plan ordering is retained.

AITM also requires substantive deep-dive prose inside the issue body. Its size-tiered content gate currently does not accept a link-only section. The body therefore retains its required deep dive, lifecycle evidence, acceptance criteria, and verification declarations. The separately owned deep-dive comment can be reduced to a summary and origin link. Supporting link-only deep-dive authority or consolidating duplicate artifact labels requires a separate tooling change.
