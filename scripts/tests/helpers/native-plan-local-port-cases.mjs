// @story #2069
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as nativeFixture from './story-timing-candidate-fixture.mjs';
import { nativePlanFixture } from './native-plan-transition-fixture.mjs';
import { hydrateJournalSnapshot } from '../../task-tracker/lib/story-cache/journal.mjs';
import { setIssue } from './story-batch-fixture.mjs';

function denyAllProviderTransports(t) {
  let calls = 0;
  return import('../../gh/lib/gh-client.mjs').then(({ ghClient }) => {
    for (const key of ['pexec', 'execFile', 'spawn']) {
      const original = ghClient[key];
      t.mock.method(ghClient, key, (...args) => {
        if (args[0] === 'gh') {
          calls++;
          throw new Error('offline provider dispatch');
        }
        return original(...args);
      });
    }
    return () => calls;
  });
}
async function inventoryFor(input) {
  const record = await input.store.readGeneration();
  const snapshot = hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
  return {
    schema: 'aitm.native-plan-children/v1',
    identity: snapshot.identity,
    issueDigest: createHash('sha256')
      .update(snapshot.resources['issue:' + snapshot.identity.issueNodeId].body)
      .digest('hex'),
    complete: true,
    children: [],
  };
}

export function registerNativePlanLocalPortTests() {
  for (const mismatch of ['subject', 'baseline']) {
    nativeFixture.test(
      `retained child authority refuses a different ${mismatch} without provider dispatch`,
      async (t) => {
        const calls = await denyAllProviderTransports(t);
        let error;
        try {
          await nativePlanFixture(t, {
            stagingOverride: async (input) => {
              const inventory = await inventoryFor(input);
              if (mismatch === 'subject')
                inventory.identity = { ...inventory.identity, issueNumber: 999 };
              else inventory.issueDigest = '0'.repeat(64);
              const deps = { ...input.deps, nativeChildInventory: inventory };
              delete deps.fetchEpicChildren;
              return { ...input, deps };
            },
          });
        } catch (value) {
          error = value;
        }
        assert.equal(calls(), 0);
        assert.match(error?.message ?? '', /native-child-inventory-invalid/);
      }
    );
  }
  nativeFixture.test(
    'missing retained epic child inventory refuses without provider dispatch',
    async (t) => {
      const calls = await denyAllProviderTransports(t);
      const { classifyDecompositionKind } =
        await import('../../task-tracker/lib/decomposition-kind.mjs');
      let error;
      try {
        await nativePlanFixture(t, {
          stagingOverride: async (input) => {
            const record = await input.store.readGeneration();
            const snapshot = hydrateJournalSnapshot(
              record.generation.baseSnapshot,
              record.payloads
            );
            const body = snapshot.resources['issue:' + snapshot.identity.issueNodeId].body.replace(
              /(^## (?:AITM )?Progress Markers[^\n]*\n)/m,
              '$1<!-- aitm-issue-kind kind="epic" -->\n'
            );
            assert.equal(classifyDecompositionKind(body).kind, 'epic');
            await nativeFixture.changeGeneration(input, (generation, payloads) =>
              setIssue(generation, payloads, body, body)
            );
            const deps = { ...input.deps };
            delete deps.fetchEpicChildren;
            delete deps.nativeChildInventory;
            return { ...input, deps };
          },
        });
      } catch (value) {
        error = value;
      }
      assert.equal(calls(), 0);
      assert.match(error?.message ?? '', /native-child-inventory-required/);
    }
  );
  for (const missing of [false, true]) {
    nativeFixture.test(
      `${missing ? 'missing retained child authority refuses locally' : 'default solo staging uses retained child authority'} without provider dispatch`,
      async (t) => {
        const calls = await denyAllProviderTransports(t);
        let error;
        try {
          await nativePlanFixture(t, {
            stagingOverride: async (input) => {
              const deps = { ...input.deps };
              delete deps.fetchEpicChildren;
              if (missing) delete deps.nativeChildInventory;
              else deps.nativeChildInventory = await inventoryFor(input);
              return { ...input, deps };
            },
          });
        } catch (value) {
          error = value;
        }
        assert.equal(calls(), 0);
        if (missing) assert.match(error?.message ?? '', /native-child-inventory-required/);
        else assert.ifError(error);
      }
    );
  }
  nativeFixture.test(
    'directory staging preserves its native unsupported refusal without a contract lookup',
    async (t) => {
      const calls = await denyAllProviderTransports(t);
      const { createIssueDirectory, renderIssueDirectory } =
        await import('../../task-tracker/lib/github-records/issue-directory.mjs');
      let error;
      try {
        await nativePlanFixture(t, {
          stagingOverride: async (input) => {
            const record = await input.store.readGeneration();
            const snapshot = hydrateJournalSnapshot(
              record.generation.baseSnapshot,
              record.payloads
            );
            const directory = createIssueDirectory({
              issueNodeId: snapshot.identity.issueNodeId,
              singletons: {
                'delivery-contract': 'IC_contract',
                coordination: 'IC_coord',
                'evidence-projection': 'IC_evidence',
                timing: 'IC_timing',
              },
            });
            const body =
              snapshot.resources['issue:' + snapshot.identity.issueNodeId].body +
              '\n' +
              renderIssueDirectory(directory);
            await nativeFixture.changeGeneration(input, (generation, payloads) =>
              setIssue(generation, payloads, body, body)
            );
            const deps = { ...input.deps };
            delete deps.fetchEpicChildren;
            delete deps.nativeChildInventory;
            return { ...input, deps };
          },
        });
      } catch (value) {
        error = value;
      }
      assert.equal(calls(), 0);
      assert.match(error?.message ?? '', /native-approval-story-approval-binding-unsupported/);
    }
  );
  for (const unavailable of [false, true]) {
    nativeFixture.test(
      `a ${unavailable ? 'unavailable' : 'foreign'} root issue cannot choose dependent plan or epic reads`,
      async (t) => {
        const { fixture, subject, observed } =
          await import('../unit/task-tracker/lib/decomposition-authority-fixtures.mjs');
        const { collectDecompositionAuthority } =
          await import('../../task-tracker/lib/decomposition-authority.mjs');
        const f = fixture();
        const seen = [];
        f.deps.readIssue = async () => ({
          ...observed({
            number: unavailable ? subject.issue : 999,
            body: '## Plan Metadata\n- Source-plan: docs/foreign-plan.md\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n',
          }),
          status: unavailable ? 'unavailable' : 'observed',
        });
        for (const name of ['readProject', 'readSelectedPlan', 'readForecast', 'readPolicy'])
          f.deps[name] = async (input) => {
            seen.push({ name, body: input.body, kind: input.kind });
            return { status: 'unavailable', value: null };
          };
        const result = await collectDecompositionAuthority({
          subject,
          cfg: { repo: 'o/r', projectId: 'PVT_a' },
          projectDir: t.unitRoot,
          deps: f.deps,
        });
        assert.deepEqual(seen, []);
        assert.equal(result.input.availability.status, 'incomplete');
      }
    );
  }
}
