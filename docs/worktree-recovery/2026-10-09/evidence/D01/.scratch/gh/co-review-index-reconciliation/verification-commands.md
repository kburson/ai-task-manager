node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
node scripts/review/reconcile-legacy-index.mjs --verify
npm test
npm run lint
npm run format:check
