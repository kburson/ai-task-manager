node --test scripts/tests/integration/review/peer-review-decommission.test.mjs
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
npm run test:all
npm run lint
npm run format:check
