# Scoped delivery attribution exception

Date: 2026-09-22. Issue: #1755. Status: approved architecture; implementation design.

## Problem and boundary

AITM rejects mixed attributed and unattributed PR source history with `delivery-preflight:attribution predicate=source-attribution-conflict`. Rewriting accepted history destroys exact-head Test, Review, CI, and audit evidence. The generic `aitm.workflow-exception/v1` catalog does not permit a commit provenance waiver and remains unchanged. This feature adds a separate, default-closed delivery attribution exception, scoped to one complete PR history and one delivery operation. It does not activate an exception for ai-peer-review #39.

## Authority and operator sequence

`aitm delivery-attribution-exception prepare #N` reads the issue, PR, and complete paginated GitHub source commits. It prints a canonical proposed scope and a SHA-256 digest, identifies exactly the commits whose subjects lack valid canonical attribution, and produces a request template. Preparation is read-only and cannot activate delivery.

An operator fills in an explicit issue mapping for each excepted source SHA and an expiration. A user then sends the exact authorization statement shown by the command, including the canonical proposal digest, through a supported Codex host user message. `aitm delivery-attribution-exception record #N --input-file <path>` resolves `aitm.authorization-source/v1` through `createCodexSessionSourceLoader` and `resolveWorkflowExceptionAuthority`; it refuses any non-user, unverifiable, mismatched, injected, or agent-authored statement. A request file, environment variable, label, ordinary GitHub comment, or agent text alone grants no authority.

The record is a new versioned GitHub comment envelope, with unique exception and operation IDs, exact repository/issue/PR/base/head/head SHA, ordered `(SHA, subject)` source inventory and digest, exact excepted SHA to issue mappings, resulting sorted delivery tokens, expiry, source message reference, recording actor, and `host-verified-user-message` level. Revoke and supersede append new revisions; old records remain as audit history. An edited, malformed, conflicting, stale, expired, revoked, or unsupported chain fails closed. Readback after append must prove the exact record, and ambiguous transport never implies success.

## Delivery evaluation

Ordinary delivery uses the existing strict subject parser and retains its refusal. On attribution failure, only the active scoped exception evaluator may supply mappings. It recomputes the entire ordered GitHub source inventory and digest at each delivery call, validates every canonical source subject, and requires exactly one authorized mapping for every invalid subject and none for canonical subjects. It rejects duplicate SHA or mapping, wildcard or zero or negative issue number, extra or missing mappings, wrong branches/head/PR/repository/issue, expiration, and competing active records. The top-level issue must appear in the resulting attribution tokens. Commit title/message bytes derive deterministically from canonical tokens plus authorized mappings.

Immediately before emitting a provider merge action, AITM re-reads GitHub PR metadata and every source commit; any drift in head, order, SHA, subject, or scope invalidates the exception. All existing binding, lifecycle, ownership, dependency, clean-tree, exact-head Test/Review, CI, mergeability, protection, provider-action, trunk reachability, and receipt checks stay in force. A pending delivery intent binds the exception record ID, operation ID, source digest, mappings, and resulting tokens. Retry is allowed only when these bytes and the preexisting intent are unchanged. The exception cannot authorize another PR, head, issue, repository, commit set, or new intent operation.

## Truthful records

Versioned delivery intent and receipt schemas carry `attributionDisposition` (`passed` or `waived`) and, for `waived`, the immutable exception record reference and scope digest. A `waived` result never becomes a normal attribution pass. Merge verification compares live source inventory, authorized intent, actual merge commit attribution, and the recorded exception. The final receipt reports the authorized attribution exception visibly and retains the verified user-message reference, recording actor, mappings, delivery intent, and disposition. Existing v1/v2 delivery records remain readable.

## Tests and documentation

Test red/green for ordinary refusal, a mixed 111-commit style history, exact mapping and deterministic tokens, non-user/unverifiable authority, wrong scope, mutation and reorder, missing/additional/duplicate/ambiguous mappings, wildcard, expired/revoked/superseded chains, exact retry, cross-operation reuse, truthful receipts, and preservation of unrelated gates. Run focused unit and integration tests, complete fast and slow suites, lint, format, package content and install smoke, then exact pushed-head hosted CI before any merge. Document prepare, explicit authorization, record, show, revoke, and delivery retry with a clear warning that preparing does not grant an exception.

## Implementation files

Add `scripts/task-tracker/lib/delivery-attribution-exception.mjs` for canonical inventory and mapping evaluation, `scripts/task-tracker/lib/delivery-attribution-exception-record.mjs` for the separate record schema/chain, and `scripts/task-tracker/verbs/delivery-attribution-exception.mjs` for the CLI. Integrate narrowly into `delivery-attribution.mjs`, `delivery-preflight.mjs`, `deliver.mjs`, `delivery-records.mjs`, and `delivery-verification.mjs`. Update the command catalog/self-doc, `skill/shared/rules/deliver.md`, operator guide, package files, and focused tests. Leave `workflow-policy/catalog.mjs` and its commit provenance restriction intact.
