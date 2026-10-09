node --test scripts/tests/unit/task-tracker/lib/estimation/story-record.test.mjs
node --test scripts/tests/unit/task-tracker/lib/estimation/rubric-manifest.test.mjs
node --test scripts/tests/integration/task-tracker/verbs/rubric-outcome-publication.test.mjs
node --test scripts/tests/integration/task-tracker/lib/estimation/rubric-import.test.mjs
npm run quality
npm run test:slow
