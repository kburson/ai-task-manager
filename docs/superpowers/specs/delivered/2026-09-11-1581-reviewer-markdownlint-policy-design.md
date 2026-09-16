# Reviewer Markdownlint Ownership Policy Design

Issue: #1581

Status: Ready for Plan approval

## Context

Peer-review archives contain two distinct ownership classes:

- reviewer-authored evidence copied byte-for-byte from an external reviewer;
- repository-author-controlled material such as owner responses, archive manifests,
  copied normative artifacts, specifications, and plans.

The archive contract forbids editing reviewer evidence after acceptance. Prettier
already preserves the entire review archive, but Markdownlint currently handles
reviewer conflicts through five exact file exclusions. Two were added by #1580 for
MD038. That per-file list does not encode the ownership rule and will grow whenever
new immutable reviewer prose happens to violate a formatting rule.

The generated archive grammar already supplies a stable classifier:

```text
<artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review.md
```

Owner-controlled responses use a separate grammar ending in
`-owner-<owner-slug>-response.md`.

## Decision

Markdownlint will ignore exactly the canonical generated reviewer-artifact glob:

```text
docs/superpowers/reviews/**/*-reviewer-*-review.md
```

The five exact reviewer-file exclusions are removed. Existing protocol-run and
non-review ignores remain unchanged.

The review archive directory is not ignored broadly. In particular, README files,
owner responses, copied artifacts, specifications, and implementation plans remain
eligible for Markdownlint.

## Why filename-role classification

The filename is produced from explicit protocol roles and is recorded in each
archive manifest. It is therefore a stronger ownership signal than incidental file
content and narrower than directory membership. It also makes future generated
reviewer evidence inherit the policy without another configuration edit.

A rule-specific MD038 override was rejected because immutable external prose can
conflict with any Markdownlint rule. A directory-wide ignore was rejected because it
would hide defects in author-controlled archive material.

## Invariants

1. The Markdownlint ignore list contains the canonical reviewer glob exactly once.
2. It contains no exact generated reviewer artifact paths.
3. It does not contain a broad `docs/superpowers/reviews/**` ignore.
4. All five displaced reviewer files, including both #1580 artifacts, retain their
   recorded bytes.
5. A canonical reviewer file with MD038 content is ignored by the live config.
6. An owner-response file with the same MD038 content is reported by Markdownlint.

## Verification design

The unit quality-config test owns structural policy. It asserts the canonical glob,
rejects exact reviewer-file entries, retains the broad-ignore prohibition, and keeps
the historical immutable hash assertion.

The integration policy test owns behavior. It loads the legacy archive hash fixture,
checks all five displaced files against their recorded SHA-256 values, and invokes
the repository-pinned Markdownlint binary in an isolated project scratch directory.
The same invalid quoted-code content must pass under the reviewer grammar and fail
under the owner grammar with MD038.

## Compatibility and migration

No reviewer bytes change. The policy only replaces redundant exact ignore entries
with their shared canonical grammar. Historical manually named review artifacts that
do not follow the generated grammar are unaffected; existing archive hashes and the
protocol-run exception remain authoritative.

## Out of scope

- Editing any accepted review artifact.
- Changing Prettier or CSpell policy.
- Changing peer-review archive naming or publication behavior.
- Exempting all files below `docs/superpowers/reviews/`.
