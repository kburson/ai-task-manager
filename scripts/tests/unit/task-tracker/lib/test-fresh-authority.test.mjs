// @story #2096
import assert from 'node:assert/strict';
import test from 'node:test';
import { runVerbTest, defaultMutateBody } from '../../../../task-tracker/verbs/test.mjs';
import {
  canonicalVerificationCommandSet,
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { autoTickVerified } from '../../../../task-tracker/lib/auto-tick-verified.mjs';
import { stampEntryMarker } from '../../../../task-tracker/lib/stage-entry-markers.mjs';
const SHA = 'a'.repeat(40),
  INSTANT = '2026-10-26T20:00:00.000Z';
const CMD = 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs';
const fp = () => ({
  commitSha: SHA,
  verificationCommands: canonicalVerificationCommandSet([CMD]),
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: 'sha256:' + 'a'.repeat(64),
    configHashes: {},
    sandbox: { kind: 'worktree', identity: process.cwd(), clean: true },
  },
});
const receipt = () =>
  createVerificationReceipt({
    issueNumber: 2096,
    stage: 'develop-final',
    fingerprint: fp(),
    commands: [
      ['lint-full', 'lint'],
      ['format-full', 'format:check'],
    ].map(([classification, script]) => ({
      classification,
      command: 'npm',
      args: ['run', script],
      exitCode: 0,
      durationMs: 1,
    })),
    now: () => INSTANT,
  });
function initial() {
  return `## Acceptance Criteria\n- [x] accepted <!-- aitm-verified vc-list="vc:1" exit="0" sha="${SHA}" ts="${INSTANT}" -->\n## Verification Commands\n- [ ] \`${CMD}\` <!-- id=1 -->\n## Definition of Done\n### Functional\n- [ ] lint <!-- dod:functional:lint --> <!-- aitm-verified cmd="\`npm run lint\` \`npm run format:check\`" -->\n## AITM Progress Markers\n<!-- aitm-last-known-state state="develop" ts="${INSTANT}" -->\n`;
}
for (const drift of ['finalization-vc', 'inherited-receipt', 'test-retry-vc', 'test-visit'])
  test(`native Test refuses ${drift} before stale proof publication`, async () => {
    let body = initial(),
      testWrites = 0,
      developWrites = 0,
      changed = false;
    if (drift === 'test-retry-vc')
      body = autoTickVerified(
        body,
        [CMD, 'npm run lint', 'npm run format:check'].map((command) => ({
          command,
          passed: true,
          exit: 0,
        })),
        INSTANT,
        { sha: SHA }
      ).body;
    const modifyVC = () => {
      body = body.replace('lib/markers.test.mjs', 'lib/ac-evidence.test.mjs');
    };
    const run = () =>
      runVerbTest({
        cfg: { repo: 'o/r' },
        issueNumber: 2096,
        projectDir: process.cwd(),
        now: () => INSTANT,
        deps: {
          fetchBody: async () => body,
          mutateBody: (input) =>
            defaultMutateBody({
              ...input,
              deps: {
                fetchBody: async () => body,
                pushBody: async (_repo, _issue, next) => {
                  if (parseVerificationReceipt(next, 'test')) testWrites++;
                  else if (parseVerificationReceipt(next, 'develop-final')) developWrites++;
                  body = next;
                  if (drift === 'test-retry-vc' && testWrites === 1 && !changed) {
                    changed = true;
                    modifyVC();
                  }
                },
              },
            }),
          postComment: async () => {},
          getHeadSha: async () => SHA,
          runDevelopFinalization: async () => {
            if (drift === 'finalization-vc') modifyVC();
            return { ok: true, fingerprint: fp(), receipt: receipt() };
          },
          moveState: async () => {
            body = body.replace('state="develop"', 'state="test"');
            body = stampEntryMarker(body, 'test', INSTANT);
            return { ok: true };
          },
          createWorktree: async () => {},
          removeWorktree: async () => {},
          npmCi: async () => {},
          getSandboxHeadSha: async () => SHA,
          buildFingerprint: () => fp(),
          execInSandbox: async () => {
            if (!changed && drift === 'inherited-receipt') {
              changed = true;
              body = body.replace('aitm-verification-receipt', 'aitm-retired-verification-receipt');
            }
            if (!changed && drift === 'test-visit') {
              changed = true;
              body = stampEntryMarker(body, 'test', '2026-10-26T20:01:00.000Z', 'move:new-visit');
            }
            return {
              exit: 0,
              stdout: '',
              stderr: '',
              durationMs: 1,
              startedAt: INSTANT,
              completedAt: INSTANT,
            };
          },
          logIssueTime: async () => {},
        },
      });
    await assert.rejects(run(), /proof authority changed|Verification Commands changed/);
    if (drift === 'finalization-vc') assert.equal(developWrites, 0);
    else assert.equal(testWrites, drift === 'test-retry-vc' ? 1 : 0);
  });
