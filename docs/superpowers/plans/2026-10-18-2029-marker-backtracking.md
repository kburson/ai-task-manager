# Bounded quoted marker parsing Implementation Plan

### Confirmed source cause and bounded repair

PR2028 CodeQL alert83 prevents merge. Both marker-grammar.mjs expressions and decomposition-records.mjs ATTR_RE repeat overlapping alternatives: the non-quote class already includes every character in the entity alternative. A missing closing quote after repeated entity text creates exponentially many partitions. Existing body and record limits do not prevent this small-input failure.

Preserve the accepted #1908 codec and all limits by replacing only the redundant repeated alternation with a non-quote repetition. Preserve capture groups, escaping, entity decoding, duplicate rejection, marker shape and schema validation. No new dependencies, provider behavior, admission exceptions or accepted plan changes.

## Story Intent

- **Beneficiary:** workspace operator
- **Capability:** reject malformed quoted marker attributes in bounded time
- **Need:** overlapping alternatives can consume exponential parser time
- **Value or failure prevented:** a small malformed issue marker cannot stall governed commands and hooks

### Semantic review and execution plan

All seven story questions pass: workspace operators are real beneficiaries; bounded rejection is a safeguard; the overlapping regex is the observed failure; preventing command stalls is concrete value; source and the CodeQL finding support these claims; this standalone parser defect differs from the six #2006 composition repairs; the story is readable independently.

One implementation task, two human hours, Size S. First add real public-API subprocess regressions with a two-second kill timeout and missing quote after 80 entities; observe RED without hanging the runner. Then minimally simplify all three expressions and observe GREEN. Assert literal valid entity roundtrip and existing duplicate/malformed rejection through the existing suites. Run unit, integration, slow, lint and format verification on the final exact source and refresh #2006 delivery evidence. Publish in existing PR2028, preserving ancestry. No extra reviewer or implementer seat.

## Implementation Tasks

### Task 1: Preserve quoted syntax with bounded malformed rejection

Files: scripts/task-tracker/lib/marker-grammar.mjs; scripts/task-tracker/lib/decomposition-records.mjs; scripts/tests/integration/task-tracker/lib/marker-quote-backtracking.test.mjs.

- [ ] Write both public-API subprocess regression tests and observe timeout RED.
- [ ] Simplify the three overlapping expressions, preserving capture groups.
- [ ] Observe GREEN, valid entity roundtrip, duplicate and malformed rejection.
- [ ] Verify full exact-head CI including slow lanes; native Test, Review and governed delivery.

Verification: node --test scripts/tests/integration/task-tracker/lib/marker-quote-backtracking.test.mjs; existing grammar and decomposition-reestimate-guard tests; npm test; npm run test:slow; npm run lint; npm run format:check.
