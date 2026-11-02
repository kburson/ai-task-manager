// @story #2070
// Registered once by the exact root verifier; these are test cases, never production adapters.
import assert from 'node:assert/strict';
import {
  nativeTest,
  completedTimingAuthority,
  legacyTimingAuthority,
  unpublishCompletion,
} from './story-timing-authority-fixture.mjs';
import { deriveLadder } from '../../task-tracker/lib/timing-ladder.mjs';
import { rollupTotals } from '../../task-tracker/timing-rollup.mjs';
export function registerTimingAuthorityProofCases(api, provisional) {
  nativeTest(
    'ordinary work published beside a real pair remains work rather than lifecycle completion',
    async (t) => {
      const ordinary = {
        ...provisional().events[0],
        actorId: provisional().events[0].actorId,
        eventId: 'ordinary-work',
        transitionId: null,
        activeSeconds: 5,
        idleSeconds: 0,
        sourceCursor: 'ordinary-work',
      };
      const f = await completedTimingAuthority(t, { extraTimingEvents: [ordinary] });
      assert.ok(f.receipt.timing.eventIds.includes(ordinary.eventId));
      const timingEvidence = { events: f.events, receipts: [f.bundle] };
      const result = api.timingAuthority(timingEvidence);
      assert.equal(result.completedVisits.length, 1);
      assert.equal(result.completedEventIds.includes(ordinary.eventId), false);
      const ladder = deriveLadder([], { timingEvidence });
      assert.equal(
        ladder.rows.find((row) => row.eventId === ordinary.eventId).lifecycleCompleted,
        false
      );
      assert.equal(ladder.totals.knownActiveSec, 5.25);
    }
  );
  for (const kind of ['native', 'legacy']) {
    nativeTest(
      `${kind} proof copies actual Buffer bytes without invoking overridden conversion methods`,
      async (t) => {
        const f =
          kind === 'native' ? await completedTimingAuthority(t) : await legacyTimingAuthority(t);
        const evidence = kind === 'native' ? f.bundle : f;
        const buffer = [...evidence.generation.payloads.values()].find(Buffer.isBuffer);
        assert.ok(buffer);
        let calls = 0;
        buffer.valueOf = function () {
          calls++;
          return this;
        };
        const result = api.timingAuthority({
          events: kind === 'native' ? f.events : provisional().events,
          [kind === 'native' ? 'receipts' : 'legacyEvidence']: [evidence],
        });
        assert.equal(calls, 0);
        assert.equal(result.completedVisits.length, 1);
        assert.equal(result.measuredActiveSeconds, kind === 'native' ? 0.25 : 30.25);
      }
    );
    nativeTest(
      `${kind} proof rejects an evidence-array method that exposes an undetached destination`,
      async (t) => {
        const f =
          kind === 'native' ? await completedTimingAuthority(t) : await legacyTimingAuthority(t);
        const evidence = kind === 'native' ? f.bundle : f;
        let calls = 0,
          reads = 0;
        evidence.generation.payloads.get = function (key) {
          reads++;
          return Map.prototype.get.call(this, key);
        };
        const list = [evidence];
        list.map = (callback) => {
          calls++;
          const [raw, , destination] = callback(list[0]);
          destination.push(raw);
          return [];
        };
        const result = api.timingAuthority({
          ...provisional(),
          [kind === 'native' ? 'receipts' : 'legacyEvidence']: list,
        });
        assert.deepEqual(result.completedVisits, []);
        assert.equal(calls, 0);
        assert.equal(reads, 0);
        assert.equal(result.measuredActiveSeconds, 30.25);
      }
    );
  }
  for (const kind of ['native', 'legacy']) {
    nativeTest(
      `${kind} proof rejects overridden payload readers without invoking them`,
      async (t) => {
        const f =
          kind === 'native' ? await completedTimingAuthority(t) : await legacyTimingAuthority(t);
        const evidence = kind === 'native' ? f.bundle : f;
        let reads = 0;
        evidence.generation.payloads.get = function (key) {
          reads++;
          return Map.prototype.get.call(this, key);
        };
        const result = api.timingAuthority({
          events: provisional().events,
          [kind === 'native' ? 'receipts' : 'legacyEvidence']: [evidence],
        });
        assert.deepEqual(result.completedVisits, []);
        assert.equal(reads, 0);
        assert.equal(result.measuredActiveSeconds, 30.25);
      }
    );
    nativeTest(
      `${kind} proof rejects changing evidence accessors without invoking them`,
      async (t) => {
        const f =
          kind === 'native' ? await completedTimingAuthority(t) : await legacyTimingAuthority(t);
        const original = kind === 'native' ? f.bundle : f;
        let reads = 0;
        const evidence = { ...original };
        Object.defineProperty(evidence, 'generation', {
          enumerable: true,
          get() {
            reads++;
            return original.generation;
          },
        });
        const result = api.timingAuthority({
          ...provisional(),
          [kind === 'native' ? 'receipts' : 'legacyEvidence']: [evidence],
        });
        assert.deepEqual(result.completedVisits, []);
        assert.equal(reads, 0);
      }
    );
  }

  for (const mode of ['fenced-only', 'fenced-duplicate', 'inline-duplicate']) {
    nativeTest(`${mode} modern receipt text is inert`, async (t) => {
      const f = await completedTimingAuthority(t);
      const result = api.timingAuthority({
        events: f.events,
        receipts: [await unpublishCompletion(f, mode)],
      });
      assert.equal(result.completedVisits.length, mode === 'fenced-only' ? 0 : 1);
    });
  }

  nativeTest(
    'a receipt cannot certify an extra event from another actor with the same transition ID',
    async (t) => {
      const f = await completedTimingAuthority(t);
      const extra = {
        ...provisional().events[0],
        eventId: 'unmatched',
        transitionId: f.receipt.transition.id,
      };
      const timingEvidence = { events: [...f.events, extra], receipts: [f.bundle] };
      const ladder = deriveLadder([], { timingEvidence });
      assert.equal(
        ladder.rows.find((row) => row.eventId === 'unmatched').lifecycleCompleted,
        false
      );
      assert.ok(
        rollupTotals([], 5, '', { timingEvidence }).telemetry.reasons.includes(
          'provisional-completion'
        )
      );
      assert.equal(ladder.totals.knownActiveSec, 30.5);
    }
  );
}
