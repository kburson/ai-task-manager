# Superpowers Specs

This directory contains approved design records for AITM work. Specs explain
what should be built, why it exists, and the constraints future implementation
plans must preserve.

## Filename convention

When a specification is created for an existing GitHub issue, its filename must
include that issue number:

```text
YYYY-MM-DD-<issue-id>-<slug>-design.md
```

Example: `2026-08-21-939-governed-pr-delivery-design.md`.

Do not invent an issue number for pre-issue exploration. This requirement
applies whenever the implementing issue exists when the specification is
created, making the artifact-to-issue relationship visible in directory
listings and search results.

Once a spec is referenced by a GitHub issue, PR, release note, or implementation
plan, treat it as an audit artifact:

- Do not delete it.
- Do not rewrite its original meaning to match later decisions.
- Prefer additive notes for clarifications.
- If the design is replaced, add a clearly dated supersession note that points
  to the newer spec or issue.

Issue bodies should reference both the spec path and a commit SHA that contains
the version used for decomposition. A path says where the current file lives; the
SHA says exactly which historical version was approved.
