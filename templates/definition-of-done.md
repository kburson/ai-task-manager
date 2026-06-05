<!--
Each item below MUST be individually verified by running the declared
verifier. Do not bulk-check. Do not preemptively check. The visible checkbox
is the sign-off; the hidden `aitm-dod-evidence:<key>` marker is the evidence
trail. `/task check` refuses to tick a stampable Functional DoD item without
its marker; run `/task dod-stamp <key>` to produce one. The two derived keys
(`acs`, `checkboxes`) are auto-stamped by `/task close` from the body itself.
See `skill/shared/rules/functional-dod.md` for the full contract.
-->

#### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` --> <!-- dod:functional:tests -->
- [ ] Lint and format checks pass <!-- aitm-verified-by: `npm run lint` `npm run format:check` --> <!-- dod:functional:lint -->
- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified-by: `git log --oneline -1` --> <!-- dod:functional:commits -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

#### Lifecycle (auto-ticked at Review/Close)

- [ ] Passed final human review
- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue
