# User Story Quality and Plan-Approval Repair

AITM treats User Story prose as optional intake material and as required,
source-grounded evidence at Plan approval. Backlog, Refine, and Ready for
Planning accept a missing, blank, or canonical template story. Plan is where an
operator reviews authoritative Story Intent, writes the final story, records
approval, and immediately promotes while the evidence is current.

## Author the story in Plan

Use the public authoring command rather than editing lifecycle markers:

```bash
npx aitm user-story <issue> \
  --as "a release operator" \
  --want "to stop partial publication because registry checks can fail" \
  --so "that consumers receive complete releases"
```

The resulting three lines are:

```text
As a release operator
I want to stop partial publication because registry checks can fail
So that consumers receive complete releases
```

Before approval, verify that the story names a real beneficiary, describes a
concrete capability and motivating need, states a meaningful outcome or
failure prevented, matches its authoritative source, remains distinct from
sibling work, and can be understood without the issue number or plan open.
Workflow progress, task execution, and traceability alone are not stakeholder
value.

## Put Story Intent in the authoritative source

Story Intent has exactly four single-line fields:

```markdown
#### Story Intent

- **Beneficiary:** release operator
- **Capability:** stop partial publication
- **Need:** registry checks can fail
- **Value or failure prevented:** consumers receive complete releases
```

AITM resolves exactly one source:

1. A linked plan plus `Source-plan-section` selects that one task's nested
   `Story Intent` block.
2. A linked plan without a task selector uses the plan's root `Story Intent`.
3. An issue with no linked plan uses the one `Story Intent` block in its
   Deep-Dive Analysis.

A linked plan never falls back to the issue deep dive when its selected source
is unreadable, missing, malformed, duplicated, or ambiguous. Repair the linked
source that claims authority.

For task-selector diagnostics, copy the exact candidate printed by AITM. The
Markdown extractor masks inline-code bytes while preserving their width, so a
candidate can contain meaningful interior spaces. Copying the visually similar
raw heading may select different bytes and will continue to refuse. If a
diagnostic is truncated, use the extractor output to obtain the complete exact
candidate.

## Approve and promote while provenance is current

After reviewing both the story and its source, run:

```bash
npx aitm plan-approve <issue>
npx aitm promote <issue>
```

`plan-approve` reads the current working-tree plan, validates the story and
intent, and binds their digests and source kind into the approval marker. A
recorded `Source-plan-commit` or `Plan-commit` remains generation provenance;
it does not make that historical commit the approval input. This distinction
lets operators review deliberate working-tree plan repairs while retaining the
commit that originally generated the issue.

Promotion re-resolves the source and refuses if the story, intent, source kind,
or current-trunk provenance changed after approval. Treat `plan-approve` as an
explicit renewal decision, not a generic retry. Review the repaired source,
rerun approval, and promote immediately. If trunk changes before promotion,
repeat the review and renewal against the new trunk.

## Repair refusals

Use the refusal code to choose the repair:

| Diagnostic family                                                                                              | Meaning                                                                                                   | Repair                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `story-required-at-plan-approval`, `story-shape-invalid`, `story-placeholder`, or an administrative-story code | The live story is absent, malformed, templated, or describes workflow instead of value.                   | Rewrite it with `npx aitm user-story`, then review it against Story Intent.                                                                             |
| `story-intent-*` or a plan-selector diagnostic                                                                 | The authoritative four-field intent is absent, malformed, ambiguous, unreadable, or not selected exactly. | Repair the linked root/task block, or the deep-dive block only when no plan is linked. Copy exact selector candidates.                                  |
| `story-approval-binding-missing`                                                                               | A legacy approval has no complete story binding.                                                          | Review the current story and source, then rerun `npx aitm plan-approve <issue>`.                                                                        |
| `story-approval-stale-story`                                                                                   | The story changed after approval.                                                                         | Review the new story and explicitly renew approval.                                                                                                     |
| `story-approval-stale-intent`                                                                                  | The selected intent bytes changed after approval.                                                         | Review the changed intent and explicitly renew approval.                                                                                                |
| `story-approval-stale-source`                                                                                  | Authority changed between root plan, task plan, and deep dive.                                            | Confirm the intended source and metadata, then explicitly renew approval.                                                                               |
| `story-approval-binding-changed` or `story-approval-binding-persistence-mismatch`                              | The source or body changed during the versioned write/read-back window.                                   | Re-read the live issue and plan; retry only after confirming the concurrent change.                                                                     |
| `story-approval-binding-unsupported`                                                                           | The issue uses directory-backed authority, which Plan story approval does not yet support.                | Do not force or emulate a seal. Keep the issue in Plan until directory-backed approval support exists or migrate through a separately governed process. |

An `approval.plan` waiver distinguishes a missing approval marker from an
existing stale binding. It may preserve the established missing-marker policy,
but it never makes a present stale story, intent, or source binding valid.

## Adopt existing repositories

- Pre-Plan issues may remain without a story or retain the canonical template until
  Plan; no bulk rewrite is required.
- Legacy issues in Plan must be reviewed and renewed before Develop. A
  successful repair records a new timestamp and supersession evidence without
  converting an old human decision into a new actor's approval.
- Issues already in Develop, Test, Review, or Done are not retroactively gated.
  A later bounce-back to Develop also does not run the Plan-exit binding gate.
- Historical plans must gain valid Story Intent in every task before
  `split-plan` can create children. Enrich the whole splittable plan first;
  never rely on a generic child-story fallback.
- Directory-backed approval is a deliberate compatibility limit. Refusal
  occurs before seal, projection, body, or audit writes, so retrying cannot
  partially approve the issue.
- The non-Plan adaptive forecast repair remains forecast-only. It must preserve
  any already valid story-binding attributes and cannot manufacture new ones.

These rules keep adoption explicit: repair current authority, review the
result, renew approval, and let the normal lifecycle guard verify the exact
evidence before Develop.
