---
record_type: operational-evidence
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: db28996eeeaa3e290d2b2c18457becaf4f462607
turn_ordinal: XPR r2 recovery
turn_description: Cross Provider Review revision 2 transport recovery
patch_sha256: 4b0897cea0cb64a60c8e67e4fe3d13cbbaa35571b5690b262cbefa5267cffbd0
---

# XPR continuation recovery

The initial Claude launch succeeded using `ai-peer-review` 0.2.2 and Claude Code
2.1.273. After Author r1, the package resume path reused the original invitation's
round-one response path and join instruction. The current turn was round two.
Claude encountered `APR_RESPONSE_INVALID` on rejoining and lacked permission to
edit the actual current response or run recovery/status commands. The wrapper
reported `outcome-unknown`; the stale expected response path prevented its
permission-blocked classification from matching the current denied response.
No successful submission was inferred from the provider's exit or draft prose.

An official manual resume command was offered. The user reported that direct CLI
commands were blocked and asked the Author to find another way. The exact user's
terminal error was not supplied, so its cause is not asserted here.

## Local repair

A copy of the installed package source was placed in ignored scratch at
`.scratch/xpr-launcher-repair`; installed dependencies were linked, not copied.
The installed global package and AITM implementation source were left unchanged.
The [preserved patch](launcher-recovery.patch) records the local change and the
focused regression test. It is experimental recovery evidence, not an upstream
release or generally certified launcher fix.

The repaired resume builder reads event-derived current authority, validates the
registered reviewer against the private saved session fingerprint and model,
requires the active reviewer turn, and obtains its exact pending response path.
It builds permissions with the package's existing encoders: one response Edit
rule plus exact status, resume, and submit commands. It resumes rather than
rejoining. It rechecks the protocol revision, actor, claim, and response just
before execution, and uses the provider's official resume command with the
existing private session handle. It retains the package's submission verification
and fingerprint checks. No protocol identity, event history, reviewer content,
Git seal, or approval boundary was manually rewritten.

Three regression cases initially failed because the current-turn resume builder
did not exist. After implementation, two cases exposed missing structured error
recovery options; these were corrected. The combined focused unit and integration
run then passed all 16 cases, including existing permission and session-privacy
coverage. The command was:

```bash
node --test .scratch/xpr-launcher-repair/test/unit/current-turn-resume.test.mjs \
  .scratch/xpr-launcher-repair/test/unit/claude-launch-permissions.test.mjs \
  .scratch/xpr-launcher-repair/test/integration/claude-launch-permissions.test.mjs
```

The new test intentionally used the live round-two fixture. It is retained as
historical evidence and cannot be rerun unchanged after the protocol advances;
a reusable upstream regression would need an isolated fixture. The recovery
copy's normal CLI selected the new builder only for resume. Fresh launch behavior
was retained. Subsequent round-two and round-three submissions provide live
continuation evidence in addition to the pre-launch tests.

## Claude executable recovery

The first repaired launch returned `APR_CLAUDE_RESULT_INVALID` because the Claude
executable could not produce JSON. A version check exposed a missing native
binary after the local package had changed to 2.1.278. Running that package's own
`install.cjs` restored it; `claude --version` then reported 2.1.278. The record does
not establish who or what initiated that intervening package update, or that it
was the same error the user experienced.

The repaired launcher then resumed the original genuine Claude session, with
`claude-opus-5` and medium effort unchanged. Round two submitted revisions and
round three submitted acceptance with the same registered fingerprint. The
protocol completed normally, with no good-enough override or human authority
attestation. The CLI version change and repair are experimental confounders.

A later Author command included an unsupported `--json` flag on `submit`; the
closed grammar rejected it before mutation. Reissuing the documented command
succeeded. This usage error is separate from the reviewer continuation defect.

The setup-created configuration backup was moved to ignored scratch after
finalization. Private provider handles, launch state, and transcripts were not
copied into the tracked experiment evidence.
