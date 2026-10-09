Observed live on #1784 / PR #1785 on 2026-09-24.

1. `npx aitm deliver 1784` authorized an exact-head intent with `mergeMethod: "squash"` (the repo default in `.ai-task-manager/task-tracker.json`), state `pending`, provider `claude`.
2. The session had no sanctioned `github.merge-pull-request` integration, so the provider action could not be executed. `rules/deliver.md` correctly forbids a `gh pr merge` fallback, leaving the intent pending.
3. The human operator merged PR #1785 from the GitHub UI. GitHub used a merge commit: `c862f2ba6e6d1a278fa0525f2a79599a5cc9a818`, second parent `edaa8e402f340af3ca15b5b36ec845b038040d58` — the exact authorized head.
4. `npx aitm deliver 1784` now refuses: `delivery-verification:merge-method predicate=merge-method`.
5. `npx aitm close 1784` refuses `close-delivery-receipt:missing` and instructs: "If the pull request was merged with a method this project does not declare, reconcile it with `/task deliver <N> --reconcile-merge-method <merge|squash|rebase> --reason "<why>"`.
6. `npx aitm deliver 1784 --reconcile-merge-method merge --reason "<substantive>"` refuses with the identical `delivery-verification:merge-method` error.
7. `npx aitm explain 1784 --json` returns `close` / `indeterminate` with `review-exit-close-gates: unclassified-refusal` and `noAutomaticRemediation: legacy-guard-requires-human-investigation`.

Result: the deliverable is on trunk and correct, the issue is approved in Review, and there is no supported command that can close it. The close refusal names a remedy whose code path cannot be reached from this state.
