# Adaptive Rubric Lane Normalization Implementation Plan

> Issue: #1094  
> Base: `a2b9ae8236e55119e1776ba2f8b7c80b0c13a6fd`

## Goal

Keep adaptive-estimation rubric refresh compatible with every verification classification emitted by the sanctioned Test workflow. Targeted command ordinals are execution identifiers, not distinct test lanes, so `test-targeted-N` records must contribute to one stable `focused` coefficient.

## Design

Add a small pure classifier in `rubric-model.mjs`. It accepts only `test-` classifications, maps `test-targeted-N` to `focused`, preserves already schema-safe lane suffixes, and converts remaining hyphen-separated suffixes to lower camel case. The existing rubric-record validator remains unchanged and continues to reject arbitrary invalid keys.

Normalize at the boundary where outcome command classifications become coefficient keys. This keeps outcome records faithful to the verification receipt while ensuring the learned rubric has a bounded, schema-safe lane vocabulary.

## Tasks

1. Extend `rubric-model.test.mjs` with a failing regression containing multiple targeted ordinals and a supported hyphenated legacy classification. Assert one combined `focused` sample and a deterministic camel-case legacy lane.
2. Implement the pure normalization helper and use it before populating `laneSamples`.
3. Extend rubric-refresh integration coverage so a current-corpus-shaped targeted outcome produces a validated refreshed record.
4. Run the focused estimation suites, then the governed Test workflow.

## Verification

- `node --test scripts/task-tracker/tests/unit/lib/estimation/rubric-model.test.mjs scripts/task-tracker/tests/unit/lib/estimation/rubric-refresh.test.mjs`
- `node --test scripts/task-tracker/tests/integration/lib/estimation/adaptive-estimation.integration.test.mjs`
- `npm test`
- `npm run test:slow`
- `npm run lint`
- `npm run format:check`
