## Summary

- Add the AITM design for branch-local Refine, Plan, and Close estimation records and an indexed, rebuildable manifest.
- Preserve the related story IDs, their overlap, and the decision checkpoint after GraphQL measurement.
- Index the numbered spec in feature #1821 without closing that implementation story.

## Verification

- `npm test` — 912 fast-lane test files passed.
- Prettier, markdownlint, and CSpell passed for the spec.

## Scope

This PR publishes the design only. Implementation and the later review process remain with #1821 after the #1818 baseline.
