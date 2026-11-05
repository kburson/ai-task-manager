Add a code-review gate to the Test stage of the task state machine.

Flow to implement:

1. Develop stage already ends with a squash-committed, lint/format-clean diff before promoting to Test (unchanged by this story).
2. Test stage pushes the branch and opens/updates the pull request (unchanged by this story).
3. While cloud CI runs against the PR, the Test stage additionally runs a local code-review pass (the existing code-review skill or an equivalent scripted invocation) against the PR's diff, and posts its findings as PR comments -- reusing the existing comment-posting mechanism rather than a new one.
4. The Test-stage exit/promote gate is extended to require BOTH conditions before it will allow promotion to Review: cloud CI reports a green status on the PR, AND the local code-review pass reports no outstanding findings.
5. If the code-review pass finds defects, remediation reuses the existing sanctioned Test-stage rework loop: demote to Develop, fix, re-run verify-develop.mjs, commit, re-promote to Test -- not a new loop.
6. Re-running the code-review after a demote/fix cycle posts updated findings to the same PR, so the PR's comment history is the aggregated, high-fidelity record of every review iteration and its resolution -- no separate document is committed to git for this purpose.
7. Once both CI and the local code-review are clean, Test allows the PR to merge to trunk, and the issue's state advances from Test to Review.

Out of scope for this issue:

- Any code-review gate at Develop-stage exit -- considered and deliberately rejected in favor of this Test-stage placement (see Story Origin).
- Changes to the Review stage itself (housekeeping / well-formedness checks on the issue body) -- tracked separately, not part of this story.
- Building a new CI-hosted review job (e.g. a GitHub Actions job running an AI review action) -- this story is specifically the locally-run review pointed at an already-pushed PR, not a cloud-run reviewer.
- The internal implementation of the code-review pass itself (the review skill and its findings format already exist) -- this story is the gating/wiring around it, not the reviewer.
