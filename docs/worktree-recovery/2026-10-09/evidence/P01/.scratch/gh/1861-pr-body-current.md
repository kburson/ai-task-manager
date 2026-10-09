Interrupted runtime publication must expose a complete generation or a protected recovery refusal. This PR implements batch journals and read fencing, observed ownership recovery, crash-safe migration and linked-root initialization, and registered migrate-runtime recovery commands.

Targets `feature/epic/1857/parent` for epic #1857. Current head: `ea29cacc8d1bfe9aa4774bdb5cd7c03b06520091`. Refs #1861, #1857; normal AITM delivery owns closure.

The authorized scope transfer assigns seven catalog/census/timing prerequisites and three required pure validators to #1861; #1862 retains production consumers. README is the only packaged human documentation. Runtime skills/templates/instructions remain included. The package contains 766 files, removing 129 documentation entries and 1,680,611 unpacked bytes without increasing the package budget.

### Verification and review

- Full test lanes execute only in cloud CI. Local automation uses formatting, lint and canonical TIA, plus each failing CI file as required repair coverage.
- CI passed at `5d8bd6d8`: 941 unit files, 245 integration files, 55 slow files and both npm compatibility jobs. CI also passed the subsequent mandatory-deletion repair at `a0db77fc`.
- GPT-6.1 Sol / Extra High (`xhigh`) independently reviewed exact green head `5d8bd6d8`. [Review](https://github.com/kburson/ai-task-manager/pull/1871#pullrequestreview-5401800366): no critical findings, five important findings; not ready to merge.
- Four findings have candidate repairs: mandatory-record deletion refusal; incomplete migration inventory refusal before publication; all-root control ownership preflight on recovery; durable-legacy absence checks for linked initialization and apply-time drift.
- Local regression cases reproduced the missing refusals before repairs. Deletion repair TIA passed all five selected files. Admission/recovery repair TIA passed all seven selected files after retained failed runs were repaired.
- Cloud `5d34ff2a` failed the repository 800-line test-file lint guard. The new migration regressions now occupy a focused admission file. Before `ea29cacc` was committed/pushed, complete `npm run lint`, `npm run format`, `npm run format:check` and all three TIA-selected split files passed locally.
- [Exact-head cloud CI passed](https://github.com/kburson/ai-task-manager/actions/runs/37140548711) at `ea29cacc`: 941 unit files, 246 integration files, 55 slow files, both npm compatibility jobs and the cache budget. Cloud formatting and complete lint also passed. [GPT-6.1 Sol / Extra High reassessment](https://github.com/kburson/ai-task-manager/pull/1871#pullrequestreview-5401920569) confirms findings 1, 2, 3 and 5 resolved, no new findings, and finding 4 still open as P2. Verdict: not ready to merge. Earlier failures and raw local/cloud outputs remain retained.

### Remaining acceptance and workflow gates

The review identified the accepted fresh-main empty-initialization route as missing. Both current main migration and linked initialization refuse an entirely empty main repository. The proposed architectural amendment is not approved or implemented; this remains a #1861 acceptance blocker.

The delivered control also has no supported cloud-to-Test receipt import. Existing green runs produced no verification artifacts. PR checks and AI code review are not lifecycle Test records or human approval. No full Test sandbox will run automatically on the local machine.

The actual workspace remains the isolated 8dae continuation worktree. Every scoped commit retained original WIP bytes, configurations, backups, private fixtures, the staged rename and protected refs; all 338 original WIP paths were verified. Candidate runtime has not been activated against live legacy state. #1861 remains in Develop, unmerged and unclosed.
