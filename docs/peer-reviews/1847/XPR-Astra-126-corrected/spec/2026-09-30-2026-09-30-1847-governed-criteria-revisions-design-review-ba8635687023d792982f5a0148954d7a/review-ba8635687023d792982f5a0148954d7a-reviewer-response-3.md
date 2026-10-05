<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ba8635687023d792982f5a0148954d7a"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
artifact_commit: "3bb590b5702754f4d222ce43262291083eb28b99"
artifact_blob: "678e9c132df18876fadc1ef0a5749d44e690f51d"
artifact_digest: "sha256:681bd3f36583f4f1413b5089887f12dee084f8329d9b7a0829234d4caa125677"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5"
  identity_source: "runtime"
started_at: "2026-09-30T08:23:55.073Z"
submitted_at: "2026-09-30T08:38:06.001Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round-3 independent review of the revised artifact at blob `678e9c13` (commit
`3bb590b5`), against `author-response-2.md`.

Method: I read the new "Local Develop activity admission" section (lines
406-458) in full, along with the authorization identifier bound (lines 197-200),
the original-session retry clarification (lines 669-672), and the new
verification cases (lines 796-801). I checked them against the R2-F001
requirement and the baseline `activity-guard.mjs`, which reads only local
state via `readBoundState`.

**R2-F001 — resolved.** The specification chooses the local-projection option
and closes each gap I raised:

- **Source and location.** Each issue gets one closed, versioned entry under the
  registered Git common directory. All linked worktrees share it, and it is
  published by atomic replacement. This fits the baseline hook's local-only read
  model.
- **Fail-closed rules.** These cases all deny code writes/commits and proof
  generation:
  - absence, corruption, or an unknown version;
  - a domain mismatch;
  - unresolved or dirty state;
  - a failed refresh;
  - a crash after a remote effect but before local allow.

  Unavailable remote reads can never create or refresh an allow entry.
- **Never-revised admission.** An allow entry requires an actually verified
  empty chain at enablement, bind, or gate. A missing body pointer cannot
  initialize an entry. This keeps the "pointer cannot prove absence" rule while
  keeping the hook cheap.
- **Freshness ordering.** Covered writers publish deny under the strict
  interlock before their first remote effect. They restore allow only after
  read-back and full authority validation. The interlock prevents a stale
  bind or gate observation from overwriting a newer deny, and hooks never
  cache allow across invocations.
- **Separation from authority.** Local allow never lets an authoritative gate
  skip remote validation. The projection is explicitly not proof or approval.
- **Tests.** The A/B linked-worktree interleaving case is present as I requested,
  plus tests for absence/corruption, never-revised initialization, failed
  refresh, restart, and crash at every local and remote write.

Both round-2 optional suggestions were also adopted:

- session and message IDs are capped at 256 ASCII bytes, and the concrete
  provenance is budgeted at preparation;
- an original-session retry continues the approved operation without minting a
  new `resume` proposal.

The trust-boundary statement (a cooperative single domain; ungoverned remote
edits detected only at authoritative gates) is honest and consistent with the
rest of the design.

Across three rounds, every material finding has been resolved with explicit
refusal behavior and a verification obligation. The remaining open items are
validation obligations that the specification correctly assigns to Refine:

- topology acceptability;
- the #124 archive-size measurement;
- the later-stage code-rework limitation;
- real host message-format verification;
- the concrete producer/consumer inventory.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Formatting.** Lines 379 and 664 and the scope sentence at line 865 still run
   past the wrap width, and the Develop activity-admission consumer-table row no
   longer matches the column widths. Prettier will reflow them. Formatting before
   the Refine attachment keeps the reviewed digest stable.
2. **Name the enablement command at Refine.** "Domain enablement" is now the
   bootstrap that makes every Develop issue in the domain deny until it
   refreshes. When Refine completes the producer/consumer inventory, name the
   operator command that performs enablement and the refresh. That way, the
   first-use cost (one full chain read per bound issue) is visible in sizing,
   and the deny-by-default transition is not a surprise lockout.

## Decision

accepted
