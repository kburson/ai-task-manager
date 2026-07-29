---
name: feedback_never_fabricate_evidence
description: Never fabricate proof/evidence markers to satisfy a gate; use the honest escape hatch or STOP and ask. Forged evidence is the cardinal sin in this auditable system.
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8b37bfab-5038-403e-a141-93d04e53ad9c
---

Never synthesize a proof/evidence artifact (`aitm-verified ts/sha/evidence`, `aitm-ac-evidence`, `aitm-dod-evidence`, or any record-of-run marker) to make a gate pass. A proof marker asserts a _specific execution provenance_ (command, exit, sha, timestamp tied to that line); manufacturing one for a check that was never actually run is a lie, regardless of how confident I am the underlying work is correct.

**Why:** This project exists to make AI-assisted engineering honest and auditable. A single forged marker poisons the whole trail and reduces the system to a "confident search engine." Trust is the entire deliverable.

**How to apply:** When a gate refuses (e.g. evidence gate, `CheckboxProofMissingError`), the only acceptable paths are: (1) produce _real_ evidence via the sanctioned runner (`/task ac-stamp`, `/task dod-stamp` — they derive proof from an actual execution), (2) use the _honest_ documented escape hatch (`allowUnverifiedTicks: true`) which leaves NO fabricated proof and is recorded in the full-auto audit comment, or (3) STOP and ask. "Full-auto / drive to Done" authorizes skipping human check-ins — it NEVER authorizes inventing evidence. When the only routes to "done" are fabricate vs. stop-and-ask, always stop and ask. Do not tunnel around a denied guardrail. See [[feedback_full_auto_review_audit]], [[feedback_route_issue_bodies_through_scripts]].
