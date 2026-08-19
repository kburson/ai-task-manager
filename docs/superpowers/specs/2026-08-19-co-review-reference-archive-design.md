# Co-review Reference Archive Design

## Status

Approved for implementation under the explicit Full-Auto authorization for issue #1314.

## Problem

Co-review finalization currently publishes four files: a full copy of the accepted artifact, the reviewer evidence, the owner response, and a `README.md` manifest. The artifact copy is redundant when the accepted commit is durably reachable in the same repository because the manifest already pins the source path, commit, Git blob, and SHA-256 digest. The two evidence files are not redundant: their source is an ignored runtime directory, so both must remain full archived copies.

The change must remain deterministic, atomic, retry-safe, and compatible with complete archives produced before reference mode exists.

## Considered Approaches

### Automatic reachability with archive pinning — selected

Select the default from repository evidence. A reachable accepted commit produces a reference archive; an unavailable or detached accepted commit produces a copy archive. Before creating anything, recognize any exact complete archive already present in reference, current copy, or legacy copy form and pin that existing mode.

This keeps policy out of the CLI, makes new in-repository archives lean, preserves a safe fallback, and makes retries idempotent across the format transition.

### Explicit `--artifact-mode`

This would be easy to route but would let callers override a repository guarantee and would enlarge every finalization and recovery command. The issue asks the publisher to detect the guarantee, so a flag is unnecessary.

### Always use references

This is the smallest code change but cannot preserve copy mode when the accepted commit is not durably reachable and cannot express the requested guarantee in the manifest.

## Mode Selection

The publisher constructs three deterministic candidates from one validated terminal snapshot:

1. `reference`: three files — reviewer evidence, owner response, and `README.md`.
2. `copy`: four files — the artifact copy, both evidence files, and `README.md`; the manifest includes `artifact.mode: "copy"`.
3. `legacy-copy`: the exact pre-#1314 four-file model with no `artifact.mode`; this candidate is recognition-only and is never chosen for a new archive.

If the destination exactly matches any candidate, that candidate is returned as complete. This pins the mode already on disk and prevents a retry from treating an older complete archive as a conflict.

For an absent destination, `repository.resolveReachableCommit(root, acceptedCommit)` chooses the new mode. The commit must resolve to the exact accepted commit and be reachable from the repository head for reference mode. Otherwise the publisher chooses copy mode. Destination containment remains unchanged: archive paths outside the repository are still refused, while an injected or future foreign repository boundary naturally selects copy mode by reporting the commit unreachable.

## Manifest and Prepared Model

The archive schema remains `aitm.co-review.archive/v1` and gains `artifact.mode` for newly published archives.

Reference artifacts contain:

- `mode: "reference"`
- `sourcePath`
- `acceptedCommit`
- `gitBlob`
- `sha256`

They omit `archivePath` and `archivedSha256` because no artifact file exists. The prose above the embedded JSON includes the exact recovery command `git cat-file blob <gitBlob>`.

Copy artifacts contain the same identity fields plus:

- `mode: "copy"`
- `archivePath`
- `archivedSha256`

Legacy manifests without `artifact.mode` are interpreted only as copy archives. The prepared-archive validator accepts exactly three safe entries for reference mode and exactly four for copy or legacy-copy mode. Reviewer and owner evidence entries remain mandatory in every mode.

## Integrity and Publication

Preparing any candidate first validates the accepted artifact at `acceptedCommit:sourcePath`, including the exact Git blob and SHA-256 digest. Prepared-model validation repeats that repository check for reference mode before inspection or publication, so a forged manifest cannot replace the omitted file guarantee.

Copy and legacy-copy validation continues to verify the artifact archive path, prepared bytes, and `archivedSha256`. Evidence files retain their existing byte and digest validation in every mode.

Publication keeps the existing staging-directory and manifest-last protocol. Inspection uses the selected candidate’s exact filename set, so missing, extra, changed, symlinked, or unreadable entries remain conflicts. A complete legacy archive is a no-op and is never rewritten.

## Testing

Extend the in-memory co-review finalization corpus to prove:

- reachable accepted commits select reference mode, omit the artifact file, retain both evidence files, and render the recovery command;
- an injected unreachable-commit result selects copy mode with exact artifact bytes and `archivedSha256`;
- both new modes round-trip through preparation, inspection, publication, and idempotent retry;
- a materialized pre-#1314 archive is accepted as complete without rewriting;
- forged reference metadata, missing Git objects, destination tampering, evidence tampering, and unexpected files fail closed;
- existing consensus, human-good-enough, naming, race, and immutable-manifest tests remain green after becoming mode-aware.

Repository fast and slow suites, lint, formatting, and the issue’s focused co-review test remain the regression gates.

## Scope Boundaries

- Do not rewrite existing archives.
- Do not change co-review state transitions or terminal evidence selection.
- Do not remove or reference the reviewer or owner evidence files.
- Do not allow archive destinations outside the repository.
- Do not introduce a CLI mode override or a new manifest schema version.
