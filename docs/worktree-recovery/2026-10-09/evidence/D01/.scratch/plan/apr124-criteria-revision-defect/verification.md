node --test scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs scripts/tests/unit/task-tracker/lib/mutate-issue-body-marker-loss.test.mjs scripts/tests/unit/task-tracker/lib/checkbox-proof-marker.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs
node --test scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs
node --test scripts/tests/unit/task-tracker/core/mutate-issue-body-scripts-help-audit.test.mjs scripts/tests/unit/task-tracker/core/docs-issue-body-forbiddance.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
