# PR draft and final code-review rule

User-directed standing rule, 2026-10-04:

1. Create every initial PR as a GitHub Draft PR with the exact title prefix `DRAFT: `.
2. Keep it in draft through Test until the final PR code review agent accepts the current PR head.
3. After that acceptance, while the issue is still in Test, remove the leading `DRAFT: ` prefix and change the PR to Ready for Review.
4. Verify both PR changes before passing the issue from Test to Review.

CI success alone does not replace final code-review acceptance. A subsequent source change requires fresh acceptance for the new head before promotion.

Prefer enforcement at the Test-to-Review state-machine boundary. GitHub automation may perform the title and readiness updates; the lifecycle guard must verify completion before advancing.

This document records the requested rule. Automated enforcement has not been implemented. Existing PRs and the main thread's source and lifecycle state are unchanged.
