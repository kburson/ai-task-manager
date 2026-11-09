node --test scripts/tests/unit/task-tracker/lib/evidence-v2/cycles.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/close-machine.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/close-flow.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/binding-generation.test.mjs
npm run lint
npm run format:check
