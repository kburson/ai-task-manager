# Issue 1859 specification: review response r2

- Reviewer and revision owner: the same single GPT-6 Astra agent.
- Input: [spec.r1.md](spec.r1.md).
- Input SHA-256: `d9f82b6142d2133433678d8dc07c5940f69aa8769d4570b3f41e8d2086bf4978`.
- Source baseline: `1b495236e9b9651c5ffd5ad67d4c7f43238ed44f`.
- Verdict: revise; two additional findings accepted into r2.

## Full-document examination

Reread every section of formatted r1, including source attribution, alternatives,
CLI, eligibility, provenance, schema, transaction delta, retries, history,
readiness, normalization, acceptance mapping and scope boundaries. Revisited the
six original findings and tested the proposed contracts against concrete cases:
new HEAD, same-HEAD changed attachment, uncheck/recheck, uncertain successful
write, target-content edit, accepted Test skip, directory routing and delivered
Close. This was a complete document review, not a verification of only r1 fixes.

## Findings and dispositions

### SAR-07 — P1: stale history must not invalidate a fresh superseding head

R1 requires append-only history but says stale reviewed history blocks. Since a
superseded record normally has an old HEAD or artifact digest, that reading makes
re-attestation permanently fail. It also keys a chain per target while hashing
mutable target content, leaving content refresh liable to start a new lineage.
The underlying fresh-base transaction cannot choose this semantic rule for us;
`mutateIssueBody` preserves records but has no reviewed-history semantics yet.

Disposition: r2 separates stable lineage from each recording's content identity.
All history receives schema/digest/chain integrity checks; only the unique current
head receives live binding/content/file validation. Target content changes retain
the original line's lineage, with a fresh append after validation; copying or
moving history to another checkbox refuses. Ambiguous edits refuse rather than
silently rewriting identity. Acceptance coverage now includes an old stale record
followed by a valid fresh head and content refresh within one lineage.

### SAR-08 — P1: shared readiness must preserve directory routing and validate marker location

R1 adds shared Scope validation but does not explicitly order it after lane
resolution. `scripts/task-tracker/verbs/check.mjs:311` already routes directory
writes before legacy checklist handling, and
`scripts/task-tracker/verbs/review.mjs:1059` distinguishes the directory evidence
lane. Applying legacy Scope obligations there would contradict the unsupported
writer route. Conversely, a reviewed marker on a legacy ineligible item must not
vanish from consideration because the parser only returns eligible targets.

Disposition: r2 explicitly routes directory-backed contracts to existing rules
without new narrative proof obligations. Legacy reviewed markers on ineligible
live targets or outside eligible live Scope refuse. Adds lane-routing and
misplaced-marker fixtures; no new Delivery Contract operation is introduced.

## Previous findings and limitations

SAR-01 through SAR-06 remain addressed: terminal authority and stage recovery,
existing proof compatibility and accepted-Test skip, stable request identity,
live target parsing, four mutation outcomes, and truthful Close prechecks with
strict evaluator envelopes. SAR-07 clarifies retained history rather than
weakening current evidence freshness.

No implementation tests or downstream reproduction were performed. This remains
one agent's iterative document review; it neither records Plan approval nor
certifies runtime behavior. R2 requires another full-document pass.
