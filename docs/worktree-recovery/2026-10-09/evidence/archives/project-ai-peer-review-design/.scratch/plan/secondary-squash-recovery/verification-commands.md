node --test scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-default-squash-recovery.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
npm run lint
npm run format:check
npm test
npm run test:slow
git diff --check
git log --oneline -1
