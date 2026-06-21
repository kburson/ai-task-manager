---
name: project_plan_metadata_everywhere
description: User-requested feature — guarantee every issue carries a Plan Metadata section with freeform label:value pairs plus a fixed core set
metadata:
  node_type: memory
  type: project
  originSessionId: 210617c1-1292-410a-8f23-eed58036fb4b
---

User wants a feature (not yet filed as a GitHub issue): **every issue must carry a `## Plan Metadata` section**. Some issues currently lack it. The list of `label: value` pairs inside should be **freeform**, but **a select few fields are reported every time** (a fixed core set — exact set TBD; likely Priority/Size/Estimate/Sequence/Parent epic).

Raised 2026-06-12 while #387 was in flight. Must go through a brainstorm to nail down: the canonical core fields, the freeform grammar, a backfill pass over existing issues missing the section, and likely a gate/preflight enforcement so new issues can't skip it (per [[feedback_route_issue_bodies_through_scripts]] — enforce at script level, not behaviorally).

**Why:** consistency of the issue corpus; Plan Metadata is read by humans and tooling.
**How to apply:** do NOT start mid-epic. After EPIC #369 / #367 land, brainstorm → file as a top-level issue → drive through the normal verb chain. Do not file without user input on the core-field set.
