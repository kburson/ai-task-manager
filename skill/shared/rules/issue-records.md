<!-- aitm-skill-version: 1.0.0 -->

# Governed Issue Records

On first read, emit `aitm-skill-loaded:rules/issue-records:1.0.0` once.

Use these commands instead of one-off scripts, raw body replacement, or raw
comment mutations. Both commands require the target to be the active issue,
an open timing session, matching GitHub ownership, and the issue-bound
worktree. Full-Auto is noninteractive but does not bypass those guards.

## Issue body

```bash
npx aitm issue-body #N --operation-file .tmp/gh/N-body-operation.json
```

The JSON file uses schema `aitm.issue-body-operation/v1` and one of these
closed shapes:

```json
{
  "schema": "aitm.issue-body-operation/v1",
  "kind": "replace-exact",
  "expected": "one exact fragment",
  "replacement": "replacement fragment",
  "expectedVersion": 12
}
```

```json
{
  "schema": "aitm.issue-body-operation/v1",
  "kind": "replace-section",
  "heading": "## Plan Metadata",
  "expected": "\n\nold section bytes\n\n",
  "replacement": "\n\nnew section bytes\n\n",
  "expectedVersion": 12
}
```

`expectedVersion` is optional; the expected fragment or section bytes remain
mandatory. The command recomputes the transformation inside the canonical
fresh-base `mutateIssueBody` transaction. It refuses zero or ambiguous matches,
stale expected bytes or versions, lifecycle-marker loss, unsupported checkbox
or evidence changes, section loss, and failed read-back. The schema exposes no
invariant override.

## Owned comment

```bash
npx aitm comment #N --key plan.audit-v1 --body-file .tmp/gh/N-audit.md
```

The key must match `[a-z0-9][a-z0-9._:-]{0,127}` and remain stable for that
logical record. Do not put an `aitm-owned-comment` marker in the body file; the
command appends its canonical hidden marker. It exhaustively discovers all
issue comments, then creates, updates, or no-ops exactly one matching comment.
Duplicate markers, pagination or correlation ambiguity, transport ambiguity
that cannot be reconciled, and failed exact read-back are refusals.

Keep operation and body files in the project-local `.tmp/gh/` scratch bucket
unless the content is an intentional committed artifact. Never use these
commands to fabricate verification evidence or to bypass a dedicated lifecycle
verb.
