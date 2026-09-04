# Externalize Tamper-Evident Forecast Comparables

Issue: #1514  
Status: Revised design pending approval

## Purpose

Plan Estimation Forecast comments currently store every comparable issue twice: once in the hidden `aitm-record` JSON and again in visible Markdown. Large cohorts make the hidden record difficult to inspect and inflate the comment without adding authority.

New comments will store the comparable entries once, in the foldable visible block. The hidden record will retain a compact, tamper-evident reference to that block. Readers will reconstruct the same logical forecast object that current consumers already use.

Historical comments remain immutable. No closed issue or existing comment needs migration.

## Chosen approach

Treat externalization as a comment-transport encoding, not a new forecast-domain schema.

The in-memory forecast remains `aitm.estimation-forecast/v2` and continues to contain:

```json
{
  "comparableIssues": [
    {
      "issue": 1180,
      "outcomeRecordId": "01M1DVK8Q17WQERJQHBEVDM0ET",
      "weight": 0.6359
    }
  ]
}
```

When the record is serialized into a comment, the hidden wire JSON replaces that array with this exact descriptor shape:

```json
{
  "comparableIssues": {
    "count": 1,
    "elementId": "comparableIssues",
    "encoding": "aitm.external-list/v1",
    "sha256": "sha256:<64 lowercase hexadecimal characters>"
  }
}
```

The visible comment contains the sole entry copy:

```html
<details>
  <summary>Comparable outcomes: count = 1</summary>
  <ul id="comparableIssues">
    <li>
      <a href="https://github.com/kburson/ai-task-manager/issues/1180">#1180</a>:
      {"outcomeRecordId":"01M1DVK8Q17WQERJQHBEVDM0ET","weight":0.6359}
    </li>
  </ul>
</details>
```

The fixed ID is deliberately not configurable. It gives writers and readers one unambiguous contract and avoids selector parsing.

The issue reference is an explicit HTML anchor, not a bare `#1180`. GitHub assigns bare references in list items its `issue-link js-issue-link` behavior and expands them into status icons plus full issue titles, as seen in the edited #1512 comment. An explicit anchor keeps the legacy compact `#1180` label while remaining clickable. The writer derives the absolute target from `envelope.repository` and the comparable issue number; no invisible character or editor-specific behavior is involved.

## Authority and integrity

The descriptor fingerprint is SHA-256 over the canonical JSON representation of the full logical comparable array, including each `issue`, `outcomeRecordId`, and `weight` in list order. It authenticates semantic data rather than insignificant HTML whitespace.

The existing envelope `payloadHash` remains unchanged in meaning: it hashes the reconstructed logical forecast payload, including the comparable array. Therefore:

1. Editing a list entry without changing the descriptor fails the list fingerprint.
2. Editing both the list and descriptor fails the existing whole-payload hash.
3. Reordering, adding, or removing entries changes the canonical array and fails validation.
4. Changing only presentation whitespace is allowed when it does not change the parsed entries.

The descriptor's `count` must equal both the number of parsed list items and the count shown in the `<summary>`.

## Write path

A focused forecast-comment transport codec will own descriptor construction, list rendering, list parsing, and hydration.

The standard estimation writer continues receiving the logical forecast envelope. During `renderAitmRecord`:

1. Validate the logical forecast and its current payload hash as today.
2. Render or locate the canonical comparable `<details>` section in visible Markdown, using exact compact anchors derived from `envelope.repository`.
3. Confirm that its parsed entries equal `payload.comparableIssues`.
4. Compute the count and canonical-array SHA-256.
5. Serialize a wire-only envelope whose `comparableIssues` value is the descriptor.
6. Leave the original envelope untouched so write/read-back comparison still uses the existing logical object.

`renderEstimationForecast` places the section between the WBS and test-plan paragraphs, matching the edited #1512 presentation. If a lower-level caller renders a forecast record without a comparable section, `renderAitmRecord` appends the canonical section so new forecast writes cannot silently fall back to duplicated storage. Supplying more than one matching section is an error.

Empty cohorts use the same shape: a collapsed block with `count = 0`, an empty `<ul id="comparableIssues">`, and the fingerprint of `[]`.

## Read path

`parseAitmRecord` first parses and canonical-checks the hidden wire JSON. For forecast comments:

- An array-valued `comparableIssues` field follows the historical path unchanged. This keeps existing v1 and v2 comments readable.
- A descriptor-valued field must match the exact external-list descriptor schema.

For a descriptor, the reader:

1. Finds exactly one `<ul id="comparableIssues">` inside a `<details>` block with the expected summary.
2. Parses each list item as an explicit anchor followed by `: <JSON object>`.
3. Requires anchor text `#<positive issue number>` and the exact absolute target `https://github.com/<expectedRepository>/issues/<same number>`.
4. Requires the JSON object to have exactly `outcomeRecordId` and `weight` with the same validations used by forecast records.
5. Reconstructs ordered objects shaped as `{ issue, outcomeRecordId, weight }`.
6. Verifies summary count, descriptor count, and descriptor fingerprint.
7. Replaces the wire descriptor with the reconstructed array in a fresh logical envelope.
8. Runs the existing forecast validation and whole-payload hash validation.

The returned object remains identical in shape to existing parsed forecast records. Runtime projections, rubric learning, supersession handling, and all other consumers continue reading `record.envelope.payload.comparableIssues` without transport awareness.

## Failure behavior

Parsing fails closed when any of these conditions occurs:

- the descriptor has missing, extra, or invalid fields;
- the element ID is not exactly `comparableIssues`;
- the list or enclosing details block is missing;
- the ID appears more than once;
- the summary count is absent or disagrees;
- a list item has malformed structure or JSON;
- an issue anchor has the wrong label, repository, number, protocol, or target shape;
- an item contains missing or extra fields, an invalid record ID, or an out-of-range weight;
- the parsed item count disagrees with the descriptor;
- the canonical-array fingerprint disagrees;
- the reconstructed logical payload disagrees with the existing envelope hash.

The GitHub comment store continues wrapping these as invalid-envelope failures at its boundary. Direct codec and envelope tests will preserve specific internal error categories for diagnosis.

## Components

- `scripts/task-tracker/lib/estimation/forecast-comment-transport.mjs`: pure codec for external descriptor construction, canonical list rendering, strict list parsing, fingerprint validation, and logical-envelope hydration.
- `scripts/task-tracker/lib/estimation/renderers.mjs`: render the foldable comparable section in the Plan Estimation Forecast presentation.
- `scripts/task-tracker/lib/github-records/record-envelope.mjs`: invoke the forecast codec at serialization and parsing boundaries while preserving the generic envelope contract.
- `scripts/task-tracker/lib/estimation/forecast-record.mjs`: retain v1/v2 logical validation; export or reuse comparable-item validation where that prevents rule drift.
- `docs/guides/workflow.md`: document that the comparable block is authenticated record content for new forecast comments, not ordinary mutable presentation.

No report, rubric, projection, outcome, or closed-comment migration is in scope.

## Test strategy

Focused tests will prove:

- a new forecast comment contains no comparable array inside `<!-- aitm-record ... -->`;
- the hidden descriptor and visible #1512-style list round-trip to the original logical envelope;
- the list is emitted once inside a collapsed `<details>` block with the fixed ID;
- each issue is rendered as an explicit, repository-correct HTML anchor whose label is only `#<number>`, preventing GitHub's rich list-item title expansion;
- old v1 and v2 embedded-array comments still parse;
- empty and large lists round-trip deterministically within comment-size limits;
- changed entries, changed order, insertion, deletion, bad count, bad digest, duplicate ID, missing block, malformed JSON, deceptive anchor targets, extra item keys, and invalid values all fail closed;
- ordinary non-forecast records and visible Markdown behavior remain unchanged;
- create/update read-back equality still compares the original logical envelope.

The issue's focused verifier runs the transport, estimation-record, and common record-envelope unit suites. The normal fast and slow lanes, lint, and formatting remain the regression floor.

## Compatibility and rollout

This design does not change `aitm.record/v1` or the logical `aitm.estimation-forecast/v2` schema. The descriptor is a versioned wire encoding recognized only at the comment transport boundary. Readers are dual-format; writers use the external format by default.

Because old comments remain valid and new readers support both forms, rollout requires no backfill, no comment mutation, and no reopening of closed issues.
