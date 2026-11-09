node --test scripts/tests/unit/task-tracker/lib/evidence-v2/execution-context.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/protocol.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/legacy-enrollment.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/cli-contract.test.mjs
npm run lint
npm run format:check
