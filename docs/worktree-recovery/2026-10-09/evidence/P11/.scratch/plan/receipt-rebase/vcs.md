node --test scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs scripts/tests/integration/task-tracker/lib/action-test.test.mjs
node scripts/maintenance/verify-ci-receipts.mjs
npm run lint
npm run format:check
git log --oneline -1
