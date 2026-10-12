node --test scripts/tests/unit/task-tracker/core/gh-timing-comment-actors.test.mjs scripts/tests/unit/task-tracker/core/heal-timing-log-command.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs scripts/tests/unit/task-tracker/lib/timing-queue-retention.test.mjs
node --test scripts/tests/unit/task-tracker/lib/heal-actor-opener-replays.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
