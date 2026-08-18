# Superpowers Review Evidence

Accepted co-review evidence is organized first by issue, then by normative artifact
type. Use directories rather than filename prefixes to distinguish specification
reviews from implementation-plan reviews.

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

The issue-level README indexes available artifact reviews. Each `spec/README.md` or
`plan/README.md` is the manifest for one accepted terminal exchange and records:

- the normative artifact path and exact reviewed commit;
- protocol ID, roles, terminal decision, acceptance time, and budget usage;
- final owner-response and reviewer-acceptance paths;
- immutable protocol-source and repository-copy SHA-256 values; and
- the transient runtime directory that retains the complete handshake.

## Authority and fidelity

Review evidence never amends or supersedes its linked specification or plan. A
later normative artifact revision requires a new review record tied to the new
commit.

Copy final exchange bytes exactly when repository checks permit it. When a
repository-only directive is required, record both source and repository-copy
hashes and describe the non-semantic difference in the artifact manifest.
