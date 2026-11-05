node --test scripts/tests/unit/task-tracker/lib/evidence-v2/subject.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/eligibility.test.mjs scripts/tests/integration/task-tracker/evidence-v2/journal.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/delivery-flow.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/close-flow.test.mjs scripts/tests/integration/task-tracker/evidence-v2/binding-generation.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/legacy-enrollment.test.mjs scripts/tests/integration/task-tracker/evidence-v2/cli-contract.test.mjs
node --test scripts/tests/slow/task-tracker/evidence-v2/frozen-worktree-rehearsal.test.mjs scripts/tests/integration/task-tracker/evidence-v2/rehearsal-cli.test.mjs
npm run lint
npm run format:check
