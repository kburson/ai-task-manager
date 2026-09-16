---
name: reference_automode_classifier_blocks_pr_merge
description: "Claude Code's auto-mode classifier blocks gh pr merge (and other outward/irreversible actions) independent of Bash allow-rules; ask the user to merge manually"
metadata:
  node_type: memory
  type: reference
  originSessionId: ed015768-b46c-4bdd-9e5e-4770604ad3ee
  modified: 2026-07-23T00:44:35.544Z
---

The Claude Code **auto-mode classifier** is a separate guardrail from the Bash permission allow-list. It blocks outward-facing / irreversible actions — `gh pr merge` is the recurring one — **even when a Bash allow-rule for that exact command exists**. Adding the command to Bash approvals does not satisfy the classifier.

When `gh pr merge` is blocked this way, don't retry variants or try to hand-merge locally. This is exactly what [[project_governed_pr_delivery_is_current]]'s `deliver` verb is designed around: `deliver` emits a structured `AITM_PROVIDER_ACTION_REQUIRED` envelope naming the exact expected action, the host (human or a pre-approved permission rule) executes only that sanctioned action, and rerunning `deliver` verifies and records the receipt before `close` proceeds.
