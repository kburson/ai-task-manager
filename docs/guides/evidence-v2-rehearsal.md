# Evidence v2 frozen-history rehearsal

Use this rehearsal to prove the evidence-v2 command and retry paths against immutable copies of historical repositories. It is read-only with respect to every declared source. Its report always contains `productionEvidenceEligible: false` and cannot authorize enrollment, recovery, delivery, or cleanup of a production issue.

## Capture

Create a JSON file with one entry per source:

```json
[
  { "issue": 1490, "path": "/absolute/path/to/worktree", "ref": "HEAD" },
  { "issue": 1488, "path": "/absolute/path/to/worktree", "ref": "HEAD" },
  { "issue": 1485, "path": "/absolute/path/to/worktree", "ref": "HEAD" }
]
```

Run capture only during a quiet window:

```sh
node scripts/maintenance/rehearse-evidence-v2.mjs capture \
  --sources-file .tmp/rehearsal-sources.json \
  --output-root .tmp/evidence-v2-rehearsal
```

Capture reads status, commit, tree, and common-directory identity twice. It refuses a dirty or moving source before creating the output root. Each source is cloned into a separate bare object store with hard links disabled and no alternates.

## Run and inspect

Pin `--tool-root` to the checkout whose exact `HEAD` should execute:

```sh
node scripts/maintenance/rehearse-evidence-v2.mjs run \
  --manifest .tmp/evidence-v2-rehearsal/capture.json \
  --tool-root "$PWD" \
  --provider recorded

node scripts/maintenance/rehearse-evidence-v2.mjs inspect \
  --run-manifest .tmp/evidence-v2-rehearsal/runs/<run-id>/run.json
```

The run clones each captured commit into a manifest-owned sandbox and validates it with `git fsck`. It then runs the existing isolation, close-fault retry, binding-generation, and legacy-enrollment command suites under recorded transport. Inspect verifies manifest and report digests, complete matrix coverage, the permanent production-ineligible flag, and current protected-source fingerprints.

## Dispose

Keep the report, then supply the exact run identity:

```sh
node scripts/maintenance/rehearse-evidence-v2.mjs dispose \
  --run-manifest .tmp/evidence-v2-rehearsal/runs/<run-id>/run.json \
  --confirm-run <run-id>
```

Disposal refuses a symlink, a path outside the capture root, a changed inventory, or any unreported file. It deletes only the sandbox listed in `ownedPaths`; the run manifest, capture, independent object stores, and retained report remain available for audit or rerun.
