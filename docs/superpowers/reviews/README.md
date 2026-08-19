# Superpowers Review Evidence

Accepted co-review evidence is organized first by issue, then by normative artifact
type. Use directories rather than filename prefixes to distinguish specification
reviews from implementation-plan reviews.

The canonical host destination is exactly
`docs/superpowers/reviews/<issue>/<artifact-kind>/`, where `<issue>` is a positive
decimal GitHub issue number and `<artifact-kind>` is exactly `spec` or `plan`.
Guided startup derives this path only from explicit paired host inputs; it never
guesses either value from an artifact filename.

## Layout

```text
docs/superpowers/reviews/<issue>/
├── README.md
├── spec/
│   ├── README.md
│   ├── artifact-<artifact-basename>  # copy and legacy-copy modes only
│   ├── <artifact-stem>-r<pair-round>-owner-<owner-slug>-response.md
│   └── <artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review.md
└── plan/
    ├── README.md
    ├── artifact-<artifact-basename>  # copy and legacy-copy modes only
    ├── <artifact-stem>-r<pair-round>-owner-<owner-slug>-response.md
    └── <artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review.md
```

The issue-level README indexes available artifact reviews. Each artifact-kind
directory contains its own `README.md` authority/hash manifest for one accepted
terminal exchange and records:

- the archive mode, normative artifact path, exact reviewed commit, Git blob, and
  source SHA-256 digest;
- protocol ID, roles, terminal decision, acceptance time, and budget usage;
- final owner-response and reviewer-acceptance paths;
- immutable source and archive SHA-256 values for both copied evidence files; and
- the transient runtime directory that retains the complete handshake.

## Generated filename grammar

The archive publisher uses one shared grammar inside either artifact-kind directory:

```text
README.md
[artifact-<artifact-basename>]  # present only in copy and legacy-copy modes
<artifact-stem>-r<pair-round>-owner-<owner-slug>-response.md
<artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review.md
```

The manifest embeds the canonical `aitm.co-review.archive/v1` JSON record. New
archives record `artifact.mode` as `reference` or `copy`; historical generated
archives without the field are interpreted as `legacy-copy`. Reference mode omits
the artifact copy and pins its exact bytes with `sourcePath`, `acceptedCommit`,
`gitBlob`, and `sha256`; recover them with `git cat-file blob <gitBlob>`. Copy modes
also record the artifact archive path and archived SHA-256. Both evidence files are
always copied and hashed. Identity slugs are deterministic and receive hash suffixes
when normalization would collide. A complete-identical retry succeeds; missing,
extra, mixed-kind, or conflicting destination content refuses without rewriting
evidence. Historical manually archived evidence may predate this generated grammar;
its artifact-kind directory and recorded hashes remain authoritative.

## Authority and fidelity

Review evidence never amends or supersedes its linked specification or plan. A
later normative artifact revision requires a new review record tied to the new
commit.

Copy both final exchange evidence files exactly. Reference the normative artifact
by its reviewed commit and Git blob when it is durably reachable; otherwise retain
the exact artifact bytes in copy mode. When a repository-only directive is
required, record both source and repository-copy hashes and describe the
non-semantic difference in the artifact manifest.
