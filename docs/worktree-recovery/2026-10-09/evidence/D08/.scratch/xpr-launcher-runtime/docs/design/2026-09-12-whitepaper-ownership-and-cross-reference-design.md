# White Paper Ownership and Cross-Reference Design

## Status

- Date: 2026-09-12
- Status: Approved with bounded provenance amendment
- Scope: Documentation organization, cross-repository linking, and explicit
  standalone-path authorization

## Decision

`ai-peer-review` owns the canonical technical white paper for provider-neutral
runtime orchestration. Writing Studio owns the editorial article that interprets
that architecture for product and engineering leadership. The article links to
the public canonical paper; it does not copy or mirror the paper.

## Repository Boundaries

The canonical paper moves from:

`docs/design/2026-09-11-provider-neutral-runtime-orchestration-white-paper.md`

to:

`docs/whitepapers/2026-09-11-provider-neutral-runtime-orchestration-white-paper.md`

The normative runtime design remains under `docs/design/` and updates its
relative link to the new white-paper path. The move preserves the current paper
content, including any uncommitted research revisions present in the primary
clone when implementation begins.

The extraction verifier enforces a closed standalone repository layout. The
move therefore adds only `docs/whitepapers` to the standalone prefix allowlist.
This approved design is delivered under the already-authorized `docs/design/`
boundary. The execution plan remains recoverable in branch history but is
removed from publishable HEAD because the parity guard forbids workflow
collateral under `docs/superpowers/`.

The manifest, verifier constant, and test fixture change together. The
authorization does not admit any new `docs/superpowers/` path or modify the
immutable retained-history rules, retained path inventory, extraction source,
contributor audit, secret-scan evidence, or relicensing record.

Writing Studio's Article 16 remains at:

`collections/agentic-delivery/articles/16-the-provider-neutral-orchestration-thesis.md`

The article adds a contextual reference explaining that it translates the
white paper's technical runtime architecture into a product and delivery
argument. It links to:

`https://github.com/kburson/ai-peer-review/blob/trunk/docs/whitepapers/2026-09-11-provider-neutral-runtime-orchestration-white-paper.md`

## Source-of-Truth Rule

There is exactly one authoritative white-paper source. Technical corrections
are made in `ai-peer-review`. Writing Studio may quote, summarize, or interpret
the paper, but it must link back to the canonical public document and must not
contain a synchronized copy.

The article and paper may evolve independently because they serve different
audiences. The link expresses provenance, not a byte-for-byte publication
relationship.

## Change Boundaries

Implementation changes only:

- the white paper's location in `ai-peer-review`;
- links in `ai-peer-review` that target the old location; and
- the standalone-layout manifest, verifier expectation, and focused tests
  required to authorize the new documentation paths; and
- the contextual source reference in Writing Studio Article 16.

It does not revise the paper's prose, complete the draft article, add a white-
paper publishing pipeline, or reorganize other documentation. Existing
unrelated edits in both repositories remain untouched.

## Verification

The implementation must prove:

- the old white-paper path no longer exists;
- the new path contains the current paper without content loss;
- all repository-local links resolve;
- the extraction verifier accepts the new white-paper prefix while continuing
  to reject publishable `docs/superpowers/` collateral, unrelated foreign
  paths, and manifest drift;
- the Article 16 reference targets the public `trunk` URL;
- Markdown, spelling, formatting, and local-link checks pass in each affected
  repository; and
- unrelated dirty files and linked worktrees remain unchanged.
