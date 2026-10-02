# Issue 1859 implementation plan: SAR response r1

- Author, reviewer and revision owner: the same GPT-6 Astra agent, medium reasoning.
- Input: [plan.r0.md](plan.r0.md).
- Input SHA-256: `34fcd493e9acd4e2da621c1915872fe32815576ec845416972063ecfa9be5134`.
- Source baseline: `4c8cb8a6` (spec finalization; runtime source unchanged).
- Governing spec: accepted digest `696b7483439a92a87ad3264508c9070fb7e9c599279beaa3f782ed126652380a`.
- Verdict: revise; three findings accepted into r1.

## Full-document review

Read all plan sections against the accepted spec: header/provenance, constraints,
file map, strict schema and numeric bounds, comment/pointer contracts, every step
of all six tasks, acceptance mapping and verification commands. Checked actual
canonical JSON, assignment/binding readers, activity matrix, versioned retry/no-op
behavior, guard registry/contract and guidance generator. The optional reviewer
clarifications are carried forward explicitly, not treated as acceptance blockers.

## Findings

### PSAR-01 — P1: new guard codes need registry-contract authority

The draft proposes new codes but omits the contract definitions and guard inventory.
`lib/guard-registry.mjs:152` derives indeterminate from registered code statuses;
`lib/action-decision/contract.mjs:37` reads guard identities from the inventory.
Without these seams a new guard can produce generic invalid-result refusals and
lose the promised diagnostics. The context audit also needs explicit mutation
entrypoints in its file map.

Disposition: add typedRefusals, exact producer/argument/status/phase contracts,
legacy-refusals inventory, contract tests and lint:action-refusals. Name Review,
promote and move-state context propagation. Distinguish read-unavailable from
observed stale/malformed evidence without broadening legal statuses.

### PSAR-02 — P1: raw manifest freshness has no input in the proposed interface

validateLocalEvidence originally receives only the parsed manifest, but the
transaction promises to detect original request-byte changes. Parsed/canonical
objects cannot distinguish a rewritten file within an attempt. Also the maximum
comment-ID placeholder assumes a 20-digit bound absent from the schema.

Disposition: pass original bytes/path, retain their digest privately and reopen
through the same safe reader on every freshness validation. Bound database IDs
to 20 decimal digits so preflight's maximum pointer estimate is valid. Clarify
isAllowed's actual two-argument state-matrix API rather than imply a configurable
policy argument that does not exist.

### PSAR-03 — P2: guidance source and generation command are incorrect

`scripts/maintenance/generate-guidance-release.mjs:14` uses
instructions/aitm-guidance.yml, and lines 146–153 require --write/--check mode.
The draft's no-argument command fails and editing only skill/SKILL.md would leave
the released catalog uninformed.

Disposition: name the catalog and release manifest alongside supplemental skill
and CLI help; use exact generator --write and retain consumer-release validation.

## Limitations

No implementation or implementation tests ran. These are plan corrections based
on current source, not proof the future code works. R1 needs another entire-plan
review; this is same-agent SAR, not independent XPR or Plan approval.
