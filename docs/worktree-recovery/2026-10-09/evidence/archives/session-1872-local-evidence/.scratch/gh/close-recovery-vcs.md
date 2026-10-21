node --test scripts/tests/unit/task-tracker/verbs/close-authority-refresh.test.mjs scripts/tests/unit/task-tracker/verbs/close-projected-guard-refresh.test.mjs
node --test scripts/tests/integration/task-tracker/lib/action-close.test.mjs scripts/tests/integration/task-tracker/lib/action-close-default.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
