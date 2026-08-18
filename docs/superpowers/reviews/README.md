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
│   ├── <date>-<slug>-owner-response-r<round>-<actor>.md
│   └── <date>-<slug>-acceptance-r<round>-<actor>.md
└── plan/
    ├── README.md
    ├── <date>-<slug>-owner-response-r<round>-<actor>.md
    └── <date>-<slug>-acceptance-r<round>-<actor>.md
```

The issue-level README indexes available artifact reviews. Each artifact-kind
directory contains its own `README.md` authority/hash manifest for one accepted
terminal exchange and records:

- the normative artifact path and exact reviewed commit;
- protocol ID, roles, terminal decision, acceptance time, and budget usage;
- final owner-response and reviewer-acceptance paths;
- immutable protocol-source and repository-copy SHA-256 values; and
- the transient runtime directory that retains the complete handshake.

## Generated filename grammar

The archive publisher uses one shared grammar inside either artifact-kind directory:

```text
README.md
artifact-<artifact-basename>
<artifact-stem>-r<pair-round>-owner-<owner-slug>-response.md
<artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review.md
```

The manifest embeds the canonical `aitm.co-review.archive/v1` JSON record and hashes
all three evidence files. Identity slugs are deterministic and receive hash suffixes
when normalization would collide. A complete-identical retry succeeds; missing,
extra, mixed-kind, or conflicting destination content refuses without rewriting
evidence. Historical manually archived evidence may predate this generated grammar;
its artifact-kind directory and recorded hashes remain authoritative.

## Authority and fidelity

Review evidence never amends or supersedes its linked specification or plan. A
later normative artifact revision requires a new review record tied to the new
commit.

Copy final exchange bytes exactly when repository checks permit it. When a
repository-only directive is required, record both source and repository-copy
hashes and describe the non-semantic difference in the artifact manifest.
