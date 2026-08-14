// @story #975 — review.mjs's Test→Review regression-check ignoring the
// `--allow-unverified-ticks` honest hatch (#567). An honestly-ticked VC
// checkbox (categorically allowlist-rejected command, e.g. `node -e`/`npm
// install`) was unconditionally re-validated and demoted as a REGRESSION,
// which also cascaded into unticking AC lines that cite it as evidence — even
// though those ACs carried real, prior `aitm-verified` proof markers. These
// tests pin `extractUnverifiedTickLabels`, the parser the regression-check
// now consults before flagging a checked, command-bearing line.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractUnverifiedTickLabels } from '../../../../task-tracker/verbs/review.mjs';
import { stripMarkers } from '../../../../task-tracker/lib/ac-evidence.mjs';

test('extractUnverifiedTickLabels: finds a single trailing audit marker', () => {
  const body = [
    '## Verification Commands',
    '',
    '- [x] `npm install` <!-- id=6 -->',
    '',
    '<!-- aitm-unverified-tick label="`npm install`" ts="2026-07-25T00:00:00.000Z" -->',
  ].join('\n');
  const labels = extractUnverifiedTickLabels(body);
  assert.equal(labels.size, 1);
  assert.ok(labels.has('`npm install`'));
});

test('extractUnverifiedTickLabels: finds multiple markers and unescapes &quot;', () => {
  const body = [
    '<!-- aitm-unverified-tick label="`node -e &quot;x&quot;`" ts="2026-07-25T00:00:00.000Z" -->',
    '<!-- aitm-unverified-tick label="`npm install`" ts="2026-07-25T00:00:01.000Z" -->',
  ].join('\n');
  const labels = extractUnverifiedTickLabels(body);
  assert.equal(labels.size, 2);
  assert.ok(labels.has('`node -e "x"`'));
  assert.ok(labels.has('`npm install`'));
});

test('extractUnverifiedTickLabels: empty body / no markers yields an empty set', () => {
  assert.equal(extractUnverifiedTickLabels('').size, 0);
  assert.equal(extractUnverifiedTickLabels('## Verification Commands\n- [x] `npm test`').size, 0);
});

test('the stripped checkbox label used at match time equals the stored marker label', () => {
  // `appendUnverifiedTickAudit` stores `stripMarkers(label)`; the review-verb
  // match site strips the live checkbox label (which still carries its
  // trailing `<!-- id=N -->` comment) the same way before comparing. Pin that
  // the two strip results agree so the lookup in review.mjs actually matches.
  const liveCheckboxLabel = '`npm install` <!-- id=6 -->';
  const storedMarkerLabel = '`npm install`';
  assert.equal(stripMarkers(liveCheckboxLabel), storedMarkerLabel);
});
