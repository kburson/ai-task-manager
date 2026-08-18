// @story #1157
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_SECTION_CEILING_MS,
  evaluateSections,
  formatSectionSummary,
} from '../../../../run-tests-ceiling.mjs';

const section = (name, elapsedMs, count = 1) => ({ name, elapsedMs, count });

describe('unit runner bounded sections (#1157)', () => {
  it('passes individually bounded phases when their combined duration exceeds the ceiling', () => {
    const result = evaluateSections({
      lane: 'unit',
      env: {},
      sections: [
        section('pooled', 400_000, 738),
        section('subprocess', 300_000, 95),
        section('serial', 100_000, 10),
      ],
    });

    assert.equal(result.totalElapsedMs, 800_000);
    assert.ok(result.totalElapsedMs > DEFAULT_SECTION_CEILING_MS);
    assert.equal(result.breached, false);
    assert.deepEqual(
      result.sections.map(({ name, count, breached }) => ({ name, count, breached })),
      [
        { name: 'pooled', count: 738, breached: false },
        { name: 'subprocess', count: 95, breached: false },
        { name: 'serial', count: 10, breached: false },
      ]
    );
  });

  for (const name of ['pooled', 'subprocess', 'serial']) {
    it(`fails closed and names an over-budget ${name} phase`, () => {
      const result = evaluateSections({
        lane: 'unit',
        env: {},
        sections: ['pooled', 'subprocess', 'serial'].map((candidate) =>
          section(
            candidate,
            candidate === name ? DEFAULT_SECTION_CEILING_MS + 1 : DEFAULT_SECTION_CEILING_MS - 1
          )
        ),
      });

      assert.equal(result.breached, true);
      const failure = result.sections.find((entry) => entry.breached);
      assert.equal(failure.name, name);
      assert.match(failure.message, new RegExp(`section '${name}'`));
      assert.match(failure.message, /section ceiling \(fail-closed\)/);
    });
  }

  it('omits empty phases so single-phase lanes retain one fail-closed ceiling', () => {
    const result = evaluateSections({
      lane: 'slow',
      env: {},
      sections: [
        section('pooled', 0, 0),
        section('subprocess', 0, 0),
        section('serial', DEFAULT_SECTION_CEILING_MS + 1, 50),
      ],
    });

    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].name, 'serial');
    assert.equal(result.sections[0].breached, true);
  });

  it('keeps every internal all-lane phase exempt', () => {
    const result = evaluateSections({
      lane: 'all',
      env: {},
      sections: [
        section('pooled', 3_600_000),
        section('subprocess', 3_600_000),
        section('serial', 3_600_000),
      ],
    });

    assert.equal(result.breached, false);
    assert.ok(result.sections.every((entry) => entry.exempt));
  });

  it('reports both phase timings and the observational aggregate', () => {
    const result = evaluateSections({
      lane: 'unit',
      env: {},
      sections: [
        section('pooled', 400_000, 738),
        section('subprocess', 300_000, 95),
        section('serial', 100_000, 10),
      ],
    });

    const report = formatSectionSummary(result);
    assert.match(report, /lane 'unit' bounded sections/);
    assert.match(report, /pooled=400\.0s\/600s \(738 files\)/);
    assert.match(report, /subprocess=300\.0s\/600s \(95 files\)/);
    assert.match(report, /serial=100\.0s\/600s \(10 files\)/);
    assert.match(report, /aggregate=800\.0s/);
  });
});
