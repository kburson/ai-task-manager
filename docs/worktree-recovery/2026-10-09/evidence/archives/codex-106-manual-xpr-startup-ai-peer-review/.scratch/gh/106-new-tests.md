## New Automated Tests

- `test/integration/manual-xpr-startup.test.mjs`
  - manual XPR registers without asking a recovery-only broker worker to launch
  - manual declared join ignores an inherited official resume command
- `test/unit/claude-observation-wait.test.mjs`
  - active join waits for a delayed genuine observation
  - missing active-join observation still refuses at the bounded deadline
  - an existing observation for another session is never retried
- `test/unit/manual-xpr-evidence.test.mjs`
  - committed manual XPR evidence verifies accepted independent turns
  - manual XPR verifier refuses an unsubmitted launch claim
- `test/unit/claude-launch-permissions.test.mjs`
  - builds and resumes the preflight-bound launch with its exact approved submit command
- `test/unit/claude-reviewer-resume-submit.test.mjs`
  - resumed Claude launch targets only the event-authorized second reviewer response
  - launch-reviewer --resume reads the current pending response from protocol authority
  - a different Claude session cannot submit the declared reviewer turn

Provider stream fixtures cover valid and malformed events through the public CLI. Live Claude evidence is separately documented in the committed conformance report.
