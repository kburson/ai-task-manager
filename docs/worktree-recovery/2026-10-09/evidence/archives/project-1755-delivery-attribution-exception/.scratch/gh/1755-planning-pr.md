## Summary

Publish the reviewed #1755 delivery attribution exception specification, seven-task implementation plan, and peer-review record to trunk before child implementation begins. The seven child issues #1756–#1762 remain Ready for Planning; #1755 remains in Plan with human Plan approval recorded on the issue.

The original plan is retained as a comparison baseline. The final commit adds two spec terms to the spelling dictionary without changing the accepted spec.

## Verification

- `npm test` — 872 fast-lane files passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed.

Tracks #1755. This PR publishes planning records; it does not deliver or close #1755.
