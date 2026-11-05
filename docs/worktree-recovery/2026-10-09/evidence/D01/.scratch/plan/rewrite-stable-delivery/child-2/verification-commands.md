node --test scripts/tests/unit/task-tracker/lib/evidence-v2/subject.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/eligibility.test.mjs
node --test scripts/tests/unit/task-tracker/lib/evidence-v2/acceptance.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/codec.test.mjs
node --test scripts/tests/integration/task-tracker/evidence-v2/journal.test.mjs
npm run lint
npm run format:check
