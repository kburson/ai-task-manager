<!-- aitm-skill-version: 1.0.0 -->

# rules/functional-dod.md

Tier-2. Loaded JIT on the first `/task check`, `/task dod-stamp`, or `/task close` of a session. On first read, emit:

```
aitm-skill-loaded:rules/functional-dod:1.0.0
```

## The contract

The `#### Functional (verified at Test)` subsection of the issue body carries
five **keyed** checkboxes. The visible `- [x]` is the sign-off. The hidden
`<!-- aitm-dod-evidence:KEY cmd="…" exit=0 sha=<head> ts=<ISO> -->` marker
appended to the same line is the evidence trail. The script gate refuses to
tick a key without its marker; the marker is what you produce by actually
running the verifier.

Five canonical keys, two classes:

| Key          | Class     | How the marker appears                                                  |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `tests`      | stampable | `/task dod-stamp tests` runs `npm run test:all` and stamps on exit-zero |
| `lint`       | stampable | `/task dod-stamp lint` runs the declared lint+format chain              |
| `commits`    | stampable | `/task dod-stamp commits` runs the declared commit-trail verifier       |
| `acs`        | derived   | `/task close` derives from "all AC checkboxes ticked" — auto-stamped    |
| `checkboxes` | derived   | `/task close` derives from "all non-self non-lifecycle boxes ticked"    |

## Use the batch path. Stamp first.

The right ticking shape is **stamp every stampable key, then batch-tick** in one
push:

```
/task dod-stamp tests
/task dod-stamp lint
/task dod-stamp commits
/task check --label "All automated tests pass" \
            --label "Lint and format checks pass" \
            --label "All changes committed; commit messages follow project convention"
```

The batch fetch/update/push is atomic — one round-trip, one body version bump.
The discipline that makes it safe is the per-key evidence marker: every label
in the batch passes the gate independently. Skip a stamp and the batch refuses
the whole tick set.

`/task close` derives `acs` and `checkboxes` itself, in that order
(`checkboxes` LAST so its count includes the `acs` tick). Do not tick them
manually — the gate refuses derived keys outright.

## Why the marker is not "just a checkbox"

The checkbox is a one-bit signal that an agent decided to tick. The marker
records _what command ran, what its exit was, what HEAD sha it was against,
and when_. The audit trail is the marker; the checkbox is the index into it.
A ticked box with no marker means somebody decided without evidence — the
gate's job is to prevent that decision from reaching `gh`.

## One evidence marker per tick (#480)

A canonical Functional item carries two hidden parts on its line, plus the
visible box:

```
- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->
```

- `aitm-verified cmd="…"` — the **declaration** of which command(s) back this
  item. Carries `cmd` only; no `ts`/`sha`/`proof` (those would make it read as
  execution proof, which a declaration is not).
- `dod:functional:<key>` — the **key tag** that binds the line to a stampable
  key.

When `/task test` runs green, `autoTickVerified` flips the box and records the
run as **one** `<!-- aitm-dod-evidence key="…" cmd="…" exit=0 sha=<head> ts=<ISO> -->`
marker (upserted in place by `stampEvidenceMarker`). It does **not** append a
second `aitm-verified` proof next to the existing declaration — that
double-`aitm-verified` redundancy is what #480 (AC8) removed. The
`aitm-dod-evidence` marker satisfies the checkbox-proof invariant identically to
an execution-form `aitm-verified`.

Non-keyed declared items (custom/legacy, no `dod:functional:<key>` tag) still
get a single inline `aitm-verified` proof, since there is no key to form a
`dod-evidence` marker. Readers stay tolerant of bodies that carry a legacy
double `aitm-verified` (declaration + proof) until the corpus is swept.

## Custom verifiers

The verifier command for each stampable key comes from the
`<!-- aitm-verified cmd="`…`" -->` declaration on the same line (the legacy
`aitm-verified-by:` form is still read). Override the default by editing your
project's `templates/definition-of-done.md` and keeping the
`dod:functional:<key>` marker intact. `dod-stamp <key>` reads the live body;
whatever commands appear on the keyed line are what it runs.

## Backward compatibility

Issues created before #303 may carry a Definition of Done without the
`dod:functional:KEY` markers. The gate is no-op on those: `parseFunctionalDodKeys`
returns no items, and `gateFunctionalDodTick` short-circuits with
`{ kind: 'pass' }`. To opt an existing issue into the new gate, edit its body
to add the markers (or re-render from the updated template).
