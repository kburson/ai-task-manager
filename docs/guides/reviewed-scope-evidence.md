# Reviewed Scope evidence

Record attributed inspection or historical output for one narrative `## Scope` checkbox after the final implementation commit. Run in the issue's bound physical checkout, on its bound branch at the manifest's exact HEAD, while the issue is in Develop or Test and you are its authenticated singleton owner.

```bash
npx aitm ensureChecked "Inspect output" --reviewed-evidence .scratch/evidence/step.json
```

`check` is a deprecated alias of `ensureChecked`. The flag requires one quoted positional label and a relative manifest path. Batch labels, labels files, unknown flags, unverified overrides, special labels and directory contracts refuse. `ensureUnchecked` retains the pointer and does not accept this flag; a later recheck needs fresh reviewed validation. AC, DoD and verifier-bearing Scope items use their existing machine stampers.

## Canonical manifest

Create a draft with the following exact fields. Replace every example binding and digest with the actual values. Artifact paths must name retained regular files within the bound checkout; symlinks, escapes, devices, directories and physical aliases refuse. Artifact entries must be uniquely sorted by path.

```json
{
  "schema": "aitm.reviewed-scope-evidence/v1",
  "repository": "owner/repo",
  "issue": 1859,
  "worktree": "/absolute/bound/checkout",
  "branch": "codex/1859",
  "head": "0000000000000000000000000000000000000000",
  "label": "Inspect output",
  "provenance": { "kind": "operator-inspection" },
  "rationale": "I inspected the saved output and found the expected result.",
  "artifacts": [
    {
      "path": ".scratch/evidence/output.txt",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

Canonicalize with the repository helper, rather than relying on JSON insertion order:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalRecordJson } from './scripts/task-tracker/lib/github-records/canonical-json.mjs';
writeFileSync(
  '.scratch/evidence/step.json',
  canonicalRecordJson(JSON.parse(readFileSync('.scratch/evidence/step.draft.json', 'utf8'))) + '\n'
);
```

For historical command output, replace the provenance object with these exact fields. `sourceCommit` is the original full commit hash, or `null` with a nonempty `unknownCommitReason`. A known commit requires `unknownCommitReason: null`. The command is recorded as provenance and is not executed by this route.

```json
{
  "kind": "historical-command-output",
  "command": "node --test scripts/tests/unit/example.test.mjs",
  "executedAt": "2026-10-01T00:00:00.000Z",
  "sourceRepository": "owner/repo",
  "sourceIssue": 1859,
  "sourceCommit": null,
  "unknownCommitReason": "The retained log did not record its commit.",
  "reportedOutcome": "The retained log reports passing tests."
}
```

Inspection records the actor's judgment. Historical output records an attributed report. Neither creates execution-proof markers, invents exit status, or replaces exact-SHA Test evidence.

## Retention and recovery

The immutable same-issue comment retains the manifest, target digest, stable actor ID, timestamp, lineage and predecessor descriptor. The body carries only its bounded current pointer. Keep referenced artifacts at their exact paths and bytes through Test-to-Review readiness; readiness uses the comment-retained manifest and does not need the original input manifest. A new HEAD, content edit or changed artifact requires a validated refresh. Equivalent checked requests are validated no-ops; valid unchecked requests reuse the current record when rechecked.

A failed or uncertain body write can leave an orphan comment. Preserve it and retry the identical request so the command reconciles its request digest, lineage and predecessor before creating another comment. Ambiguous duplicates and unavailable authoritative reads refuse; resolve the reported uncertainty before changing the request. Never manually mint, move, edit or delete a body pointer. A changed current pointer means another successor won and must not be overwritten.

Limits are 8,192 bytes for the canonical manifest and record, 12,288 bytes for its comment, 384 bytes for the body pointer, 16 artifacts, 4 MiB per artifact and 16 MiB aggregate. Body preflight enforces 60,000 UTF-8 bytes including the next version marker and maximum pointer before comment creation. If capacity refuses, reduce unrelated body prose through the sanctioned issue-body writer while retaining authority markers; retry afterward. History remains in comments instead of growing the body.

Generated children carry the immutable Scope policy. Their narrative targets need current reviewed evidence even when Test evidence is accepted. Legacy bodies preserve historical checkbox behavior; any explicit reviewed pointer is always validated. If evidence became stale after leaving Test, run `/task test` to return from Review to Test for re-verification, refresh the reviewed record in that bound writable checkout, and re-run the applicable verification.
