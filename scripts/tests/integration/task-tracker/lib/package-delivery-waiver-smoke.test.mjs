// @story #1787 #1827 #1801
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';
import {
  original as originalIntent,
  pinnedIntent,
  receipt as waivedReceipt,
} from '../../../unit/task-tracker/lib/pinned-delivery-waiver-fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const REQUIRED = [
  'bin/aitm.mjs',
  'docs/guides/workflow.md',
  'skill/shared/rules/deliver.md',
  'scripts/task-tracker/verbs/workflow-exception.mjs',
  'scripts/task-tracker/verbs/help-data.mjs',
  'scripts/task-tracker/lib/workflow-policy/delivery-request.mjs',
  'scripts/task-tracker/lib/workflow-policy/delivery-scope.mjs',
  'scripts/task-tracker/lib/delivery-waiver-journal.mjs',
  'scripts/task-tracker/lib/delivery-waiver-consumption.mjs',
  'scripts/task-tracker/lib/delivery-records.mjs',
];

test('offline installed package prepares a delivery waiver read-only and exposes codecs and help', async () => {
  const before = execFileSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' });
  const scratch = mkdtempSync(join(projectScratchDir('test'), 'aitm-waiver-pack-'));
  const packDir = join(scratch, 'pack');
  const consumerDir = join(scratch, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });
  try {
    const report = parseNpmPackReport(
      execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'silent' },
      }),
      { expectedPackageName: '@kburson/ai-task-manager', requireFilename: true }
    );
    const packed = new Set(report.files.map((file) => file.path));
    for (const path of REQUIRED) assert.ok(packed.has(path), `missing packed file: ${path}`);
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'waiver-consumer', type: 'module', private: true })
    );
    execFileSync(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        join(packDir, report.filename),
      ],
      {
        cwd: consumerDir,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'silent', npm_config_offline: 'true' },
      }
    );
    const installed = join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager');
    for (const path of REQUIRED)
      assert.ok(existsSync(join(installed, path)), `missing installed file: ${path}`);
    for (const verb of ['workflow-exception', 'deliver']) {
      const help = execFileSync(
        process.execPath,
        [join(installed, 'bin/aitm.mjs'), verb, '--help'],
        {
          cwd: consumerDir,
          encoding: 'utf8',
          env: { ...process.env, TT_SKIP_NETWORK: '1', npm_config_offline: 'true' },
        }
      );
      assert.match(help, new RegExp(`/task ${verb}`));
      if (verb === 'workflow-exception') {
        assert.match(help, /Prepare exact PR waivers or one-issue local-trunk close grants/);
        assert.match(help, /<prepare\|record\|show\|revise\|revoke>/);
      }
    }
    const { runWorkflowException } = await import(
      pathToFileURL(join(installed, 'scripts/task-tracker/verbs/workflow-exception.mjs'))
    );
    const { parseDeliveryWaiverProposal, parseDeliveryWaiverRequest } = await import(
      pathToFileURL(
        join(installed, 'scripts/task-tracker/lib/workflow-policy/delivery-request.mjs')
      )
    );
    const { buildDeliveryScope } = await import(
      pathToFileURL(join(installed, 'scripts/task-tracker/lib/workflow-policy/delivery-scope.mjs'))
    );
    const { projectDeliveryWaiverJournal } = await import(
      pathToFileURL(join(installed, 'scripts/task-tracker/lib/delivery-waiver-journal.mjs'))
    );
    const deliveryCodec = await import(
      pathToFileURL(join(installed, 'scripts/task-tracker/lib/delivery-records.mjs'))
    );
    const context = {
      repository: originalIntent.repository,
      issueNumber: originalIntent.issueNumber,
      prNumber: originalIntent.prNumber,
    };
    for (const [record, render] of [
      [originalIntent, deliveryCodec.renderDeliveryIntentComment],
      [pinnedIntent, deliveryCodec.renderDeliveryIntentComment],
      [waivedReceipt, deliveryCodec.renderDeliveryReceiptComment],
    ]) {
      const parsed = deliveryCodec.parseDeliveryComment(
        {
          id: `installed-${record.schema}`,
          createdAt: '2026-09-25T12:05:00.000Z',
          body: render(record),
        },
        context
      );
      assert.deepEqual(parsed.record, record, `installed codec round trip: ${record.schema}`);
    }
    assert.equal(typeof buildDeliveryScope, 'function');
    assert.equal(typeof projectDeliveryWaiverJournal, 'function');
    const proposal = {
      schema: 'aitm.delivery-waiver-proposal/v1',
      action: 'record',
      exceptionId: null,
      priorRecordId: null,
      priorRevision: null,
      requirementId: 'delivery.verification.merge-method',
      reason: 'Accept the observed merge method for this exact pull request.',
      expiresAt: '2026-09-27T00:00:00.000Z',
      deliveryOperationId: null,
    };
    assert.deepEqual(parseDeliveryWaiverProposal(JSON.stringify(proposal)), proposal);
    let effects = 0;
    const result = await runWorkflowException({
      action: 'prepare',
      issues: [1784],
      request: proposal,
      repository: 'example/consumer',
      now: '2026-09-25T00:00:00.000Z',
      runtime: {
        async fetchDeliveryFacts() {
          return {
            repository: 'example/consumer',
            issue: 1784,
            scopeIdentity: `sha256:${'a'.repeat(64)}`,
            pullRequest: 1785,
            acceptedHeadSha: 'b'.repeat(40),
            baseRef: 'trunk',
            resolvedTrunkRef: 'origin/trunk',
            originalIntentRecordId: '01M2H000000000000000000080',
            prior: null,
            now: '2026-09-25T00:00:00.000Z',
          };
        },
        async appendRecord() {
          effects++;
          throw new Error('unexpected write');
        },
        async resolveAuthority() {
          effects++;
          throw new Error('unexpected authority read');
        },
      },
    });
    assert.equal(result.status, 'prepared');
    assert.equal(result.results[0].request.deliveryScope.pullRequest, 1785);
    assert.equal(result.results[0].request.authorizationSource, null);
    assert.equal(effects, 0);
    const request = result.results[0].request;
    const source = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId: 'session-1',
      messageId: 'message-1',
      statementHash: `sha256:${'c'.repeat(64)}`,
    };
    assert.deepEqual(
      parseDeliveryWaiverRequest(JSON.stringify({ ...request, authorizationSource: source }), {
        action: 'record',
      }).deliveryScope,
      request.deliveryScope
    );
    assert.match(
      readFileSync(join(installed, 'docs/guides/workflow.md'), 'utf8'),
      /delivery-waiver-ambiguity/
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  assert.equal(
    execFileSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' }),
    before
  );
});
