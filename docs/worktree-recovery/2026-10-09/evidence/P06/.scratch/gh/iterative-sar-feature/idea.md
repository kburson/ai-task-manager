### Feature request

Add a governed iterative Single Agent Review (SAR) capability for specifications
and implementation plans. A maintainer should be able to request repeated
self-review, correction, validation, and commits until a complete review of the
latest artifact finds no further substantive defects. The workflow should
preserve evidence for every round without requiring the maintainer to prompt
for each repetition or manually repair review metadata.

### Problem and demonstrated value

The AITM MCP adapter architecture review required repeated manual instructions
to start another self-review, create a numbered record, update the spec, add
model/effort/file/ordinal metadata, add commit provenance, commit the results,
and continue until clean. Later rounds found defects missed by earlier rounds.
The process eventually reached SAR r5 with no further findings, but its control
flow and evidence conventions were maintained conversationally.

Make that repeatable within AITM so maintainers receive an improved artifact
and an attributable review history before requesting independent peer review.

### Desired behavior

- Require an explicit artifact and validate the repository, worktree, branch,
  and file identity. Operate on the intended artifact even when the host's
  initial project context differs; never silently review another checkout.
- Pin each round to the exact artifact version. Prefer a committed baseline.
  When commit authority is granted, commit the approved in-scope documents
  before starting the next round. Do not include unrelated working-tree changes.
- Have the same reviewing agent examine the entire updated artifact against
  relevant repository code, architecture decisions, requirements, and earlier
  corrections. This is single-agent self-review, not independent peer review.
- When defects are found, create a new review record containing severity,
  evidence, impact, correction requirements, disposition, and validation.
  Update the artifact, run appropriate checks, inspect the diff, commit within
  the authorized scope, and begin the next ordinal against that revision.
- Preserve earlier records. Support the demonstrated naming convention
  `self-review.md`, `self-review-r2.md`, `self-review-r3.md`, and so on under
  `docs/superpowers/reviews/<artifact-slug>/`. Resume from recorded state without
  overwriting a round, reusing an ordinal, or pretending a new version was the
  previously reviewed version.
- Finish only after a complete review identifies no further substantive
  defects. Write a terminal no-findings record with `finding_count: 0`, retain
  the unchanged reviewed artifact, and report the terminal round, reviewed SHA,
  record path, resulting commits, validation, and worktree state.
- Cancellation, failed checks, a missing prerequisite, exhausted configured
  limits, or a blocked correction must report an incomplete or blocked outcome,
  never a clean review. Report no further defects identified, not a guarantee
  that defects cannot exist.
- Keep independent peer-review acceptance, implementation approval, publishing,
  pushing, merging, and issue closure separate. A clean SAR must not start a
  Claude review or cross an approval gate by itself.

### Required front matter

Every review record begins with a parseable YAML block, before the heading.
Include the actual model identifier and reasoning effort for that round, the
repository-relative filepath under review, the full reviewed commit SHA,
whether the reviewed bytes included uncommitted changes, the reviewed file's
SHA-256, and the SAR ordinal with its expanded description.

Example from the completed workflow:

```yaml
---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0
uncommitted_changes: false
reviewed_file_sha256: 5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b
turn_ordinal: SAR r5
turn_description: Single Agent Review revision 5
finding_count: 0
---
```

The same convention makes `SAR r3` mean `Single Agent Review revision 3`.
`commit_sha` identifies the input baseline, not the later commit containing the
corrections or review record. If a supported workflow reviews uncommitted bytes,
the SHA identifies their base commit, `uncommitted_changes` must be true, and
the content hash must identify the actual reviewed bytes. Never mislabel dirty
content as a committed revision.

Resolve model and effort from authoritative per-turn runtime/session metadata;
do not guess from a product name, current default, or a later round's settings.
When unavailable, retain explicit unknown provenance or block certification
according to the designed contract. A previous round's metadata must not change
when later rounds use a different model or effort.

### Success scenarios to refine

- A fixture with defects across multiple revisions produces ordered records,
  corrected artifacts, scoped commits, and a terminal clean review of the final
  committed content.
- An initially clean artifact produces a no-findings record without rewriting
  the artifact or inventing a finding.
- Wrong checkout, changed artifact bytes, invalid commit/path, malformed YAML,
  inconsistent ordinal, and missing model/effort provenance are detected.
- Resume after interruption preserves completed rounds and starts from the
  correct reviewed revision; blocked or budget-limited runs remain incomplete.
- Documentation validation is distinguished from runtime conformance. Passing
  Markdown or spelling checks cannot be represented as proof of the proposed
  implementation, and SAR completion cannot be represented as peer acceptance.

### Origin and reference artifacts

Requested by the maintainer after the AITM MCP adapter architecture SAR loop in
this conversation on 2026-09-20. Reference artifacts are in the ai-task-manager
repository on branch `codex/aitm-mcp-adapter-architecture`:

- Specification: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`.
- Review history: `docs/superpowers/reviews/aitm-mcp-adapter-architecture/self-review.md`
  and `self-review-r2.md` through `self-review-r5.md` in the same directory.
- `21778cf5535b055ad9a42131df9b9d471b428f6e`: rounds 2–3 corrections and metadata.
- `c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0`: round 4 corrections, reviewed by SAR r5.
- `559df32b`: terminal SAR r5 no-findings record.

These reference commits are currently local and have not been pushed. Their
paths and SHAs record provenance; they are not represented as GitHub-accessible
artifacts or as an approved implementation plan for this feature. Command/API
design, formal acceptance verifiers, sizing, and decomposition belong in
Refine/Plan. This request authorizes backlog capture only.
