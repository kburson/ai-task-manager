node --test scripts/tests/integration/task-tracker/lib/test-stage-code-review-gate.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
