node --test scripts/tests/unit/task-tracker/lib/delivery-preflight.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
npm run precommit
