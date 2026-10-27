node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
