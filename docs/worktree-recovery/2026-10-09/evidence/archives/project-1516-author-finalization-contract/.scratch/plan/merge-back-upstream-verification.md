node --test scripts/tests/unit/task-tracker/merge-back.test.mjs
npm test
git merge-base --is-ancestor codex/issue-1609-finalize-cli-result codex/issue-1516-author-finalization-contract
npm run test:slow
npm run lint
npm run format:check
