# Externalize Forecast Comparables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the foldable `comparableIssues` list the sole stored copy of forecast comparables while preserving the existing logical forecast payload, compact linked issue labels, historical reads, and fail-closed integrity checks.

**Architecture:** Add a pure forecast-comment transport codec between logical envelope validation and canonical comment serialization. New writes replace the hidden comparable array with a count/element/encoding/SHA-256 descriptor and render the entries once in a visible `<details>` block; reads validate that block, rebuild the logical array, and then run the existing envelope and payload-hash validators. The estimator renderer supplies the canonical block in its intended presentation position, while the common envelope layer guarantees that lower-level forecast writes cannot omit it.

**Tech Stack:** Node.js ES modules, `node:crypto`, strict canonical JSON, GitHub-flavored HTML/Markdown comments, `node:test`.

## Global Constraints

- Keep the logical schema exactly `aitm.estimation-forecast/v2`; the external descriptor is only the versioned comment encoding `aitm.external-list/v1`.
- Keep `aitm.record/v1` and `payloadHash` semantics unchanged; `payloadHash` must validate the reconstructed logical payload containing the comparable array.
- Use exactly one `<ul id="comparableIssues">` inside a collapsed `<details>` block, and store no second copy of comparable entries in the hidden JSON.
- Render every issue as an explicit absolute HTML anchor derived from `envelope.repository`, labeled only `#<number>`, so GitHub does not expand list items to status icons and full titles.
- Compute descriptor SHA-256 over `canonicalRecordJson(comparableIssues)` in original list order.
- Accept historical v1 and v2 forecast comments whose hidden `comparableIssues` value is an array without requiring a visible list.
- Fail closed for malformed descriptors, blocks, items, counts, hashes, repository links, or reconstructed payloads.
- Do not migrate comments, edit closed issues, or reopen historical work.

---

### Task 1: Build the pure comparable-list transport codec

**Files:**

- Create: `scripts/task-tracker/lib/estimation/forecast-comment-transport.mjs`
- Modify: `scripts/task-tracker/lib/estimation/forecast-record.mjs:120-133`
- Create: `scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs`

**Interfaces:**

- Consumes: `canonicalRecordJson(value)` from `github-records/canonical-json.mjs` and the existing comparable validation rules from `forecast-record.mjs`.
- Produces: `validateForecastComparableIssues(comparableIssues)`, `renderForecastComparableSection({ comparableIssues, repository })`, `externalizeForecastComment({ envelope, visibleMarkdown })`, and `hydrateForecastComment({ envelope, visibleMarkdown, expectedRepository })`.
- Returns: externalization returns `{ envelope, visibleMarkdown }`; hydration returns a logical envelope. Neither mutates its input.

- [ ] **Step 1: Export the comparable-array validator without changing its rules**

Replace the inline comparable loop in `validateEstimationForecast` with this named export and call:

```js
export function validateForecastComparableIssues(comparableIssues) {
  if (!Array.isArray(comparableIssues)) fail('forecast-comparables');
  for (const comparable of comparableIssues) {
    exact(comparable, ['issue', 'outcomeRecordId', 'weight'], 'forecast-comparable');
    if (!Number.isInteger(comparable.issue) || comparable.issue <= 0)
      fail('forecast-comparable-issue');
    recordId(comparable.outcomeRecordId, 'forecast-comparable-record');
    if (
      typeof comparable.weight !== 'number' ||
      !Number.isFinite(comparable.weight) ||
      comparable.weight < 0 ||
      comparable.weight > 1
    )
      fail('forecast-comparable-weight');
  }
  return comparableIssues;
}
```

```js
validateForecastComparableIssues(payload.comparableIssues);
```

- [ ] **Step 2: Write failing codec tests for canonical rendering and round trips**

Create a fixture with two comparable entries, including zero weight, then assert the exact descriptor and compact-anchor presentation:

```js
// @story #1514
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  externalizeForecastComment,
  hydrateForecastComment,
  renderForecastComparableSection,
} from '../../../../../task-tracker/lib/estimation/forecast-comment-transport.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';

const repository = 'kburson/ai-task-manager';
const comparableIssues = [
  { issue: 1180, outcomeRecordId: '01J00000000000000000000110', weight: 0.6359 },
  { issue: 1483, outcomeRecordId: '01J00000000000000000000111', weight: 0 },
];

function forecastEnvelope(items = comparableIssues) {
  return {
    schema: 'aitm.record/v1',
    recordType: 'estimation-forecast',
    repository,
    payload: { schema: 'aitm.estimation-forecast/v2', comparableIssues: items },
  };
}

test('renders one canonical collapsed list with compact repository-correct anchors', () => {
  const section = renderForecastComparableSection({ comparableIssues, repository });
  assert.match(section, /^<details>\n<summary>Comparable outcomes: count = 2<\/summary>/);
  assert.match(section, /<ul id="comparableIssues">/);
  assert.match(
    section,
    /<a href="https:\/\/github\.com\/kburson\/ai-task-manager\/issues\/1180">#1180<\/a>/
  );
  assert.doesNotMatch(section, /issue-link|Introduce \.scratch/);
  assert.equal(section.match(/<li>/g)?.length, 2);
});

test('externalizes and hydrates without mutating the logical envelope', () => {
  const logical = forecastEnvelope();
  const original = structuredClone(logical);
  const encoded = externalizeForecastComment({ envelope: logical, visibleMarkdown: 'Forecast.\n' });

  assert.deepEqual(logical, original);
  assert.deepEqual(encoded.envelope.payload.comparableIssues, {
    count: 2,
    elementId: 'comparableIssues',
    encoding: 'aitm.external-list/v1',
    sha256: encoded.envelope.payload.comparableIssues.sha256,
  });
  assert.match(encoded.envelope.payload.comparableIssues.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(canonicalRecordJson(encoded.envelope).includes('outcomeRecordId'), false);

  const hydrated = hydrateForecastComment({
    envelope: encoded.envelope,
    visibleMarkdown: encoded.visibleMarkdown,
    expectedRepository: repository,
  });
  assert.deepEqual(hydrated, logical);
});
```

- [ ] **Step 3: Run the new unit file and verify the red state**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs
```

Expected: FAIL because `forecast-comment-transport.mjs` and its exports do not exist.

- [ ] **Step 4: Implement descriptor hashing, canonical section rendering, strict parsing, externalization, and hydration**

Create `forecast-comment-transport.mjs` with this public contract and implementation structure:

```js
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { FORECAST_RECORD_TYPE, validateForecastComparableIssues } from './forecast-record.mjs';

const ELEMENT_ID = 'comparableIssues';
const ENCODING = 'aitm.external-list/v1';
const DESCRIPTOR_KEYS = ['count', 'elementId', 'encoding', 'sha256'];
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ID_ATTRIBUTE_RE = /\bid=(?:"comparableIssues"|'comparableIssues')/g;
const SECTION_RE =
  /<details>\s*<summary>Comparable outcomes: count = (0|[1-9][0-9]*)<\/summary>\s*<ul id="comparableIssues">([\s\S]*?)<\/ul>\s*<\/details>/g;
const ITEM_RE =
  /<li>\s*<a href="https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9][0-9]*)">#([1-9][0-9]*)<\/a>:\s*(\{[^\r\n<>]*\})\s*<\/li>/g;

function fail(category) {
  throw new TypeError(`forecast-comment-transport:${category}`);
}

function exactObject(value, expectedKeys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail(category);
}

function comparableHash(comparableIssues) {
  return `sha256:${createHash('sha256')
    .update(canonicalRecordJson(comparableIssues))
    .digest('hex')}`;
}

function descriptorFor(comparableIssues) {
  return {
    count: comparableIssues.length,
    elementId: ELEMENT_ID,
    encoding: ENCODING,
    sha256: comparableHash(comparableIssues),
  };
}

function validateDescriptor(descriptor) {
  exactObject(descriptor, DESCRIPTOR_KEYS, 'descriptor');
  if (!Number.isSafeInteger(descriptor.count) || descriptor.count < 0) fail('descriptor-count');
  if (descriptor.elementId !== ELEMENT_ID) fail('descriptor-element-id');
  if (descriptor.encoding !== ENCODING) fail('descriptor-encoding');
  if (typeof descriptor.sha256 !== 'string' || !HASH_RE.test(descriptor.sha256))
    fail('descriptor-hash');
}

function issueHref(repository, issue) {
  return `https://github.com/${repository}/issues/${issue}`;
}

export function renderForecastComparableSection({ comparableIssues, repository } = {}) {
  validateForecastComparableIssues(comparableIssues);
  if (typeof repository !== 'string' || !REPOSITORY_RE.test(repository)) fail('repository');
  const items = comparableIssues
    .map(({ issue, outcomeRecordId, weight }) => {
      const data = canonicalRecordJson({ outcomeRecordId, weight });
      return `<li><a href="${issueHref(repository, issue)}">#${issue}</a>: ${data}</li>`;
    })
    .join('\n');
  return `<details>\n<summary>Comparable outcomes: count = ${comparableIssues.length}</summary>\n<ul id="${ELEMENT_ID}">\n${items}${items === '' ? '' : '\n'}</ul>\n</details>`;
}

function parseComparableSection({ visibleMarkdown, expectedRepository }) {
  if (typeof visibleMarkdown !== 'string') fail('visible-markdown');
  if (typeof expectedRepository !== 'string' || !REPOSITORY_RE.test(expectedRepository))
    fail('repository');
  if ([...visibleMarkdown.matchAll(ID_ATTRIBUTE_RE)].length !== 1) fail('element-id-count');

  const sections = [...visibleMarkdown.matchAll(SECTION_RE)];
  if (sections.length !== 1) fail('section');
  const summaryCount = Number(sections[0][1]);
  if (!Number.isSafeInteger(summaryCount)) fail('summary-count');

  const comparableIssues = [];
  const itemBody = sections[0][2];
  let cursor = 0;
  for (const match of itemBody.matchAll(ITEM_RE)) {
    if (itemBody.slice(cursor, match.index).trim() !== '') fail('item');
    const [, linkedRepository, hrefIssueText, labelIssueText, json] = match;
    if (linkedRepository !== expectedRepository || hrefIssueText !== labelIssueText)
      fail('item-link');
    let itemData;
    try {
      itemData = JSON.parse(json);
    } catch {
      fail('item-json');
    }
    const item = { issue: Number(hrefIssueText), ...itemData };
    validateForecastComparableIssues([item]);
    comparableIssues.push(item);
    cursor = match.index + match[0].length;
  }
  if (itemBody.slice(cursor).trim() !== '') fail('item');
  if (summaryCount !== comparableIssues.length) fail('summary-count');
  return comparableIssues;
}

function sameComparables(left, right) {
  return canonicalRecordJson(left) === canonicalRecordJson(right);
}

export function externalizeForecastComment({ envelope, visibleMarkdown } = {}) {
  if (envelope?.recordType !== FORECAST_RECORD_TYPE) return { envelope, visibleMarkdown };
  if (typeof visibleMarkdown !== 'string') fail('visible-markdown');
  const comparableIssues = envelope.payload?.comparableIssues;
  validateForecastComparableIssues(comparableIssues);
  const canonicalSection = renderForecastComparableSection({
    comparableIssues,
    repository: envelope.repository,
  });
  const idCount = [...visibleMarkdown.matchAll(ID_ATTRIBUTE_RE)].length;
  let encodedMarkdown = visibleMarkdown;
  if (idCount === 0) {
    encodedMarkdown = `${visibleMarkdown}${visibleMarkdown.endsWith('\n') ? '' : '\n'}${canonicalSection}\n`;
  } else {
    const parsed = parseComparableSection({
      visibleMarkdown,
      expectedRepository: envelope.repository,
    });
    if (!sameComparables(parsed, comparableIssues)) fail('logical-mismatch');
  }
  return {
    envelope: {
      ...envelope,
      payload: { ...envelope.payload, comparableIssues: descriptorFor(comparableIssues) },
    },
    visibleMarkdown: encodedMarkdown,
  };
}

export function hydrateForecastComment({ envelope, visibleMarkdown, expectedRepository } = {}) {
  if (envelope?.recordType !== FORECAST_RECORD_TYPE) return envelope;
  const comparableValue = envelope.payload?.comparableIssues;
  if (Array.isArray(comparableValue)) return envelope;
  validateDescriptor(comparableValue);
  const comparableIssues = parseComparableSection({ visibleMarkdown, expectedRepository });
  if (comparableIssues.length !== comparableValue.count) fail('descriptor-count');
  if (comparableHash(comparableIssues) !== comparableValue.sha256) fail('descriptor-hash');
  return { ...envelope, payload: { ...envelope.payload, comparableIssues } };
}
```

Keep helpers private unless another task explicitly consumes them. If a regex must be split for lint readability, preserve the exact accepted grammar and error categories above.

- [ ] **Step 5: Add the complete failure matrix and immutability assertions**

Extend the new test file with table-driven mutations that each assert `/forecast-comment-transport:/`:

```js
test('fails closed for descriptor and visible-list tampering', () => {
  const encoded = externalizeForecastComment({
    envelope: forecastEnvelope(),
    visibleMarkdown: 'Forecast.\n',
  });
  const items = [...encoded.visibleMarkdown.matchAll(/<li>[\s\S]*?<\/li>/g)].map(
    (match) => match[0]
  );
  const cases = [
    { name: 'missing list', markdown: 'Forecast.\n' },
    {
      name: 'duplicate id',
      markdown: `${encoded.visibleMarkdown}\n<ul id="comparableIssues"></ul>`,
    },
    {
      name: 'wrong repository',
      markdown: encoded.visibleMarkdown.replace('kburson/ai-task-manager', 'other/repository'),
    },
    {
      name: 'label and href disagree',
      markdown: encoded.visibleMarkdown.replace('>#1180</a>', '>#1181</a>'),
    },
    {
      name: 'changed weight',
      markdown: encoded.visibleMarkdown.replace('"weight":0.6359', '"weight":0.5'),
    },
    {
      name: 'changed order',
      markdown: encoded.visibleMarkdown.replace(
        `${items[0]}\n${items[1]}`,
        `${items[1]}\n${items[0]}`
      ),
    },
    {
      name: 'deleted entry',
      markdown: encoded.visibleMarkdown.replace(`${items[1]}\n`, ''),
    },
    {
      name: 'inserted entry',
      markdown: encoded.visibleMarkdown.replace('</ul>', `${items[0]}\n</ul>`),
    },
    {
      name: 'malformed json',
      markdown: encoded.visibleMarkdown.replace('{"outcomeRecordId"', '{outcomeRecordId'),
    },
    {
      name: 'extra item key',
      markdown: encoded.visibleMarkdown.replace(
        '"weight":0.6359}',
        '"weight":0.6359,"extra":true}'
      ),
    },
    {
      name: 'invalid item value',
      markdown: encoded.visibleMarkdown.replace('"weight":0.6359', '"weight":2'),
    },
    {
      name: 'invalid outcome record id',
      markdown: encoded.visibleMarkdown.replace('01J00000000000000000000110', 'not-a-record-id'),
    },
  ];

  for (const { name, markdown } of cases) {
    assert.throws(
      () =>
        hydrateForecastComment({
          envelope: encoded.envelope,
          visibleMarkdown: markdown,
          expectedRepository: repository,
        }),
      /forecast-comment-transport:/,
      name
    );
  }

  for (const descriptor of [
    (({ sha256: _removed, ...missingHash }) => missingHash)(
      encoded.envelope.payload.comparableIssues
    ),
    { ...encoded.envelope.payload.comparableIssues, count: 3 },
    { ...encoded.envelope.payload.comparableIssues, elementId: 'other' },
    { ...encoded.envelope.payload.comparableIssues, encoding: 'aitm.external-list/v2' },
    { ...encoded.envelope.payload.comparableIssues, sha256: `sha256:${'0'.repeat(64)}` },
    { ...encoded.envelope.payload.comparableIssues, invented: true },
  ]) {
    assert.throws(
      () =>
        hydrateForecastComment({
          envelope: {
            ...encoded.envelope,
            payload: { ...encoded.envelope.payload, comparableIssues: descriptor },
          },
          visibleMarkdown: encoded.visibleMarkdown,
          expectedRepository: repository,
        }),
      /forecast-comment-transport:/
    );
  }
});

test('allows presentation whitespace without changing authenticated entries', () => {
  const encoded = externalizeForecastComment({
    envelope: forecastEnvelope(),
    visibleMarkdown: '',
  });
  const reformatted = encoded.visibleMarkdown
    .replace('<details>\n<summary>', '<details>\n  <summary>')
    .replace('</summary>\n<ul', '</summary>\n  <ul')
    .replace(/<li>/g, '    <li>')
    .replace(/<\/li>/g, '</li>\n');
  assert.deepEqual(
    hydrateForecastComment({
      envelope: encoded.envelope,
      visibleMarkdown: reformatted,
      expectedRepository: repository,
    }).payload.comparableIssues,
    comparableIssues
  );
});

test('supports empty and large ordered lists deterministically', () => {
  const empty = renderForecastComparableSection({ comparableIssues: [], repository });
  assert.match(empty, /count = 0/);
  assert.match(empty, /<ul id="comparableIssues">\n<\/ul>/);

  const large = Array.from({ length: 500 }, (_, index) => ({
    issue: index + 1,
    outcomeRecordId: `01J${String(index).padStart(23, '0')}`,
    weight: index / 500,
  }));
  const first = externalizeForecastComment({
    envelope: forecastEnvelope(large),
    visibleMarkdown: '',
  });
  const second = externalizeForecastComment({
    envelope: forecastEnvelope(large),
    visibleMarkdown: '',
  });
  assert.equal(first.visibleMarkdown, second.visibleMarkdown);
  assert.deepEqual(
    hydrateForecastComment({
      envelope: first.envelope,
      visibleMarkdown: first.visibleMarkdown,
      expectedRepository: repository,
    }).payload.comparableIssues,
    large
  );
});
```

- [ ] **Step 6: Run the focused codec and existing forecast validation tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs
```

Expected: PASS, with all codec tests and pre-existing estimation record tests green.

- [ ] **Step 7: Commit the pure codec**

```bash
git add scripts/task-tracker/lib/estimation/forecast-record.mjs scripts/task-tracker/lib/estimation/forecast-comment-transport.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs
git commit -m "feat(estimation): encode forecast comparable lists [#1514]"
```

---

### Task 2: Integrate hydration and externalization at the common envelope boundary

**Files:**

- Modify: `scripts/task-tracker/lib/github-records/record-envelope.mjs:14-19,273-308`
- Modify: `scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs:235-269,358-405`
- Test: `scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs`

**Interfaces:**

- Consumes: `externalizeForecastComment({ envelope, visibleMarkdown })` and `hydrateForecastComment({ envelope, visibleMarkdown, expectedRepository })` from Task 1.
- Produces: unchanged public signatures for `renderAitmRecord` and `parseAitmRecord`; forecast bodies use the external wire encoding while returned envelopes remain logical.

- [ ] **Step 1: Write failing envelope-boundary tests for external wire JSON and logical readback**

Append `#1514` to the existing `@story` line in `records.test.mjs`. Add assertions that split the comment at `-->`, parse the hidden JSON, and prove the only hidden comparable value is the descriptor:

```js
const forecastBody = renderAitmRecord({
  envelope: envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast),
  visibleMarkdown: renderEstimationForecast(forecast, {
    repository: 'kburson/ai-task-manager',
  }),
});
const wireEnvelope = JSON.parse(forecastBody.match(/^<!-- aitm-record\n([\s\S]*?)\n-->/)[1]);
assert.deepEqual(Object.keys(wireEnvelope.payload.comparableIssues).sort(), [
  'count',
  'elementId',
  'encoding',
  'sha256',
]);
assert.equal(JSON.stringify(wireEnvelope).includes('01J00000000000000000000110'), false);
assert.deepEqual(
  parseAitmRecord({
    commentNodeId: 'IC_kwDO1091Forecast',
    body: forecastBody,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1091,
  }).envelope.payload.comparableIssues,
  forecast.comparableIssues
);
```

Add these lower-level assertions so `renderAitmRecord` cannot omit or duplicate the external record:

```js
test('forecast envelope rendering appends a missing comparable block exactly once', () => {
  const body = renderAitmRecord({
    envelope: envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast),
    visibleMarkdown: 'Custom forecast presentation.\n',
  });
  assert.equal(body.match(/id="comparableIssues"/g)?.length, 1);
  assert.match(body, /Custom forecast presentation\.[\s\S]*<details>/);
});

test('forecast envelope rendering rejects duplicate comparable blocks', () => {
  const section = renderForecastComparableSection({
    comparableIssues: forecast.comparableIssues,
    repository: 'kburson/ai-task-manager',
  });
  assert.throws(
    () =>
      renderAitmRecord({
        envelope: envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast),
        visibleMarkdown: `${section}\n${section}\n`,
      }),
    /forecast-comment-transport:/
  );
});
```

- [ ] **Step 2: Write a historical embedded-array fixture that bypasses the new writer**

Preserve the compatibility test by constructing the old body directly rather than asking the new writer to emit an obsolete transport:

```js
const legacyEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, legacy);
const legacyBody = `<!-- aitm-record\n${canonicalRecordJson(legacyEnvelope)}\n-->\nLegacy forecast presentation.\n`;
const parsed = parseAitmRecord({
  commentNodeId: 'IC_kwDO1091LegacyForecast',
  body: legacyBody,
  expectedRepository: 'kburson/ai-task-manager',
  expectedIssue: 1091,
});
assert.deepEqual(parsed.envelope.payload.comparableIssues, legacy.comparableIssues);
assert.equal(parsed.envelope.payload.refine.humanHours, 20.15);
```

Import `canonicalRecordJson` and `renderForecastComparableSection` into `records.test.mjs`. Exercise the current schema's historical array form with the same manual transport construction:

```js
const historicalCurrentEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast);
const historicalCurrentBody = `<!-- aitm-record\n${canonicalRecordJson(historicalCurrentEnvelope)}\n-->\nHistorical v2 forecast presentation.\n`;
assert.deepEqual(
  parseAitmRecord({
    commentNodeId: 'IC_kwDO1091HistoricalV2Forecast',
    body: historicalCurrentBody,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1091,
  }).envelope.payload.comparableIssues,
  forecast.comparableIssues
);
```

- [ ] **Step 3: Run envelope and estimation tests to verify the red state**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs
```

Expected: FAIL because `renderAitmRecord` still writes the logical array and `parseAitmRecord` cannot validate a descriptor-valued forecast payload.

- [ ] **Step 4: Wire the codec into serialization without changing the public API**

Import the two codec functions near the existing forecast imports:

```js
import {
  externalizeForecastComment,
  hydrateForecastComment,
} from '../estimation/forecast-comment-transport.mjs';
```

Replace the forecast-sensitive portion of `renderAitmRecord` with this order:

```js
export function renderAitmRecord({ envelope, visibleMarkdown = '' } = {}) {
  if (typeof visibleMarkdown !== 'string') throw recordError('visible-markdown');
  if ([...visibleMarkdown.matchAll(MARKER_RE)].length > 0) throw recordError('unsafe-comment');
  validateEnvelope(envelope);
  assertNoCredentialValues(visibleMarkdown);

  const encoded = externalizeForecastComment({ envelope, visibleMarkdown });
  assertNoCredentialValues(encoded.envelope);
  assertNoCredentialValues(encoded.visibleMarkdown);
  const recordJson = canonicalCommentRecordJson(encoded.envelope);
  assertBounded(recordJson, MAX_RECORD_JSON_BYTES, 'too-large');
  const body = `<!-- aitm-record\n${recordJson}\n-->\n${encoded.visibleMarkdown}`;
  assertBounded(body, MAX_COMMENT_BODY_BYTES, 'too-large');
  return body;
}
```

The initial `validateEnvelope(envelope)` is intentionally before encoding so only a valid logical forecast can be written and `payloadHash` is checked against the array.

- [ ] **Step 5: Hydrate after canonical wire parsing and before logical validation**

Keep the existing bounds, JSON parse, and canonical wire check. Then replace the validation sequence in `parseAitmRecord` with:

```js
if (canonicalCommentRecordJson(envelope) !== recordJson) throw recordError('noncanonical');
assertNoCredentialValues(envelope);
assertNoCredentialValues(visibleMarkdown);

const logicalEnvelope = hydrateForecastComment({
  envelope,
  visibleMarkdown,
  expectedRepository,
});
validateEnvelope(logicalEnvelope);
if (logicalEnvelope.repository !== expectedRepository) throw recordError('repository-mismatch');
if (logicalEnvelope.issue !== expectedIssue) throw recordError('issue-mismatch');

return deepFreeze({ commentNodeId, envelope: logicalEnvelope });
```

This order authenticates the canonical wire bytes, rejects credentials on both surfaces, reconstructs comparables, and only then evaluates forecast schema, supersession, and the unchanged whole-payload hash.

- [ ] **Step 6: Add end-to-end tamper assertions at the envelope layer**

For a valid externally encoded body, assert these mutations fail through `parseAitmRecord`:

```js
for (const tamperedBody of [
  body.replace('"weight":0.4', '"weight":0.5'),
  body.replace('/issues/1068">#1068', '/issues/1067">#1068'),
  body.replace('count = 1', 'count = 2'),
  body.replace('"count":1', '"count":2'),
  body.replace(/"sha256":"sha256:[0-9a-f]{64}"/, `"sha256":"sha256:${'0'.repeat(64)}"`),
]) {
  assert.throws(
    () =>
      parseAitmRecord({
        commentNodeId: 'IC_kwDO1091Forecast',
        body: tamperedBody,
        expectedRepository: 'kburson/ai-task-manager',
        expectedIssue: 1091,
      }),
    /(forecast-comment-transport|record-envelope):/
  );
}
```

Build a wire body whose visible list and descriptor are recomputed together but whose original `payloadHash` is unchanged; this proves the outer hash resists coordinated list-and-descriptor tampering:

```js
const logicalEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast);
const alteredPayload = structuredClone(forecast);
alteredPayload.comparableIssues[0].weight = 0.5;
const coordinated = externalizeForecastComment({
  envelope: { ...logicalEnvelope, payload: alteredPayload },
  visibleMarkdown: '',
});
const coordinatedBody = `<!-- aitm-record\n${canonicalRecordJson(coordinated.envelope)}\n-->\n${coordinated.visibleMarkdown}`;
assert.throws(
  () =>
    parseAitmRecord({
      commentNodeId: 'IC_kwDO1091Forecast',
      body: coordinatedBody,
      expectedRepository: 'kburson/ai-task-manager',
      expectedIssue: 1091,
    }),
  /record-envelope:hash-mismatch/
);
```

Import `externalizeForecastComment` for this test only; do not expose a test-only bypass through `record-envelope.mjs`.

Exercise the common comment-size limits with a complete logical forecast and 500 valid comparables:

```js
const largeComparables = Array.from({ length: 500 }, (_, index) => ({
  issue: index + 1,
  outcomeRecordId: `01J${String(index).padStart(23, '0')}`,
  weight: index / 500,
}));
const largePayload = { ...forecast, comparableIssues: largeComparables };
const largeEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, largePayload);
const largeBody = renderAitmRecord({ envelope: largeEnvelope, visibleMarkdown: '' });
const [largeHidden] = largeBody.split('-->\n');
assert.ok(Buffer.byteLength(largeHidden, 'utf8') < 256 * 1024);
assert.ok(Buffer.byteLength(largeBody, 'utf8') < 1024 * 1024);
assert.deepEqual(
  parseAitmRecord({
    commentNodeId: 'IC_kwDO1091LargeForecast',
    body: largeBody,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1091,
  }).envelope.payload.comparableIssues,
  largeComparables
);
```

- [ ] **Step 7: Run focused envelope, codec, and estimation tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit envelope integration**

```bash
git add scripts/task-tracker/lib/github-records/record-envelope.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs
git commit -m "feat(records): hydrate external forecast comparables [#1514]"
```

---

### Task 3: Make the estimation writer emit the canonical folded presentation

**Files:**

- Modify: `scripts/task-tracker/lib/estimation/renderers.mjs:10-25,40-50`
- Modify: `scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs:378-445`
- Test: `scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation.integration.test.mjs`

**Interfaces:**

- Consumes: `renderForecastComparableSection({ comparableIssues, repository })` from Task 1 and unchanged `renderAitmRecord` behavior from Task 2.
- Produces: `renderEstimationForecast(record, { repository })`; `writeEstimationRecord(...)` keeps its public signature and passes `envelope.repository` into the presentation renderer.

- [ ] **Step 1: Write failing renderer tests for placement, compact anchors, and empty cohorts**

Update direct forecast renderer calls to pass the repository and add exact ordering assertions:

```js
const renderedForecast = renderEstimationForecast(forecast, {
  repository: 'kburson/ai-task-manager',
});
assert.match(renderedForecast, /<details>[\s\S]*<ul id="comparableIssues">/);
assert.match(
  renderedForecast,
  /<a href="https:\/\/github\.com\/kburson\/ai-task-manager\/issues\/1068">#1068<\/a>/
);
assert.ok(renderedForecast.indexOf('<details>') > renderedForecast.indexOf('- learning:'));
assert.ok(renderedForecast.indexOf('</details>') < renderedForecast.indexOf('Test plan:'));
assert.equal(renderedForecast.match(/#1068/g)?.length, 1);

const emptyForecast = { ...forecast, comparableIssues: [] };
const emptyRendered = renderEstimationForecast(emptyForecast, {
  repository: 'kburson/ai-task-manager',
});
assert.match(emptyRendered, /Comparable outcomes: count = 0/);
assert.match(emptyRendered, /<ul id="comparableIssues">\n<\/ul>/);
```

Assert that omitting or malforming `repository` fails so a writer cannot emit deceptive or relative targets:

```js
for (const repository of [undefined, 'not-a-repository', 'owner/repo/extra']) {
  assert.throws(
    () => renderEstimationForecast(forecast, { repository }),
    /forecast-comment-transport:repository/
  );
}
```

- [ ] **Step 2: Run the estimation unit test and verify the red state**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs
```

Expected: FAIL because the renderer still emits the legacy inline paragraph and ignores repository context.

- [ ] **Step 3: Replace the inline comparable paragraph with the shared section renderer**

Import the helper and change the function signature:

```js
import { renderForecastComparableSection } from './forecast-comment-transport.mjs';

export function renderEstimationForecast(record, { repository } = {}) {
  validateEstimationForecast(record);
  const stages = Object.entries(record.ai.stages)
    .map(([stage, value]) => `${stage} ${hours(value)}`)
    .join(', ');
  const wbs = record.wbs
    .map((item) => `- ${item.id}: ${item.description} (${hours(item.humanHours)})`)
    .join('\n');
  const comparables = renderForecastComparableSection({
    comparableIssues: record.comparableIssues,
    repository,
  });
  const testPlan = `Test plan: ${record.testPlan.impactedLanes.join(', ')} via ${record.testPlan.isolation}; expected ${record.testPlan.expectedMinutes} minutes.`;
  const risks =
    record.risks.length === 0 ? 'Risks: none recorded.' : `Risks: ${record.risks.join('; ')}.`;
  return `## Plan Estimation Forecast\n\nHuman Plan estimate: ${hours(record.plan.humanHours)} (${record.plan.size}); Refine delta: ${hours(record.plan.deltaHours)}.\n\nAI P50: ${hours(record.ai.p50EngagedHours)}; AI P80: ${hours(record.ai.p80EngagedHours)}. Stages: ${stages}.\n\nRubric: v${record.rubric.version}, cohort ${record.rubric.cohortSize}, confidence ${percent(record.rubric.confidence)}.\n\n${wbs}\n\n${comparables}\n\n${testPlan}\n\n${risks}\n\nRecommendation: ${record.recommendation.action} — ${record.recommendation.reason}\n`;
}
```

Change `visibleMarkdown` so only forecast rendering receives repository context:

```js
function visibleMarkdown(envelope) {
  if (envelope.recordType === FORECAST_RECORD_TYPE)
    return renderEstimationForecast(envelope.payload, { repository: envelope.repository });
  if (envelope.recordType === OUTCOME_RECORD_TYPE) return renderEstimationOutcome(envelope.payload);
  if (envelope.recordType === RUBRIC_RECORD_TYPE) return renderEstimationRubric(envelope.payload);
  throw new TypeError('estimation-record:unsupported-type');
}
```

Do not move output or rubric rendering into the codec; externalization applies only to forecast comparables.

- [ ] **Step 4: Update immutable write/read-back expectations**

Build the expected body with the repository-aware renderer:

```js
const body = renderAitmRecord({
  envelope: forecastEnvelope,
  visibleMarkdown: renderEstimationForecast(forecast, {
    repository: 'kburson/ai-task-manager',
  }),
});
```

Keep the existing mocked GraphQL comment read-back. Add these assertions inside the mocked `createIssueComment`, followed by the logical read-back assertion:

```js
createIssueComment: async ({ body: actual }) => {
  writes += 1;
  assert.equal(actual, body);
  const [hidden, visible] = actual.split('-->\n');
  assert.doesNotMatch(hidden, /01J00000000000000000000110/);
  assert.equal(visible.match(/01J00000000000000000000110/g)?.length, 1);
  return { node_id: commentNodeId };
},
```

```js
assert.deepEqual(result.envelope, forecastEnvelope);
```

- [ ] **Step 5: Run unit and adaptive-estimation integration coverage**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation.integration.test.mjs
```

Expected: PASS. The integration writer must still publish and read back a logical forecast object even though its stored comment has the descriptor.

- [ ] **Step 6: Commit the standard writer format**

```bash
git add scripts/task-tracker/lib/estimation/renderers.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation.integration.test.mjs
git commit -m "feat(estimation): fold forecast comparable records [#1514]"
```

If the integration test needs no source edit because existing assertions already cover read-back, omit it from `git add`; the passing command remains required evidence.

---

### Task 4: Document the authenticated visible-record boundary and verify the repository

**Files:**

- Modify: `docs/guides/workflow.md:277-286`

**Interfaces:**

- Consumes: the completed writer/reader behavior from Tasks 1-3.
- Produces: operator documentation that distinguishes the hidden descriptor from the authenticated visible comparable record and states the no-migration policy.

- [ ] **Step 1: Update the adaptive-estimation workflow documentation**

Replace the paragraph beginning `Operators can inspect` with:

```markdown
Operators can inspect the visible `Plan Estimation Forecast`, `Estimation
Outcome`, and `Estimation Rubric` comments directly. New forecast comments keep
their comparable outcomes once in a collapsed
`<ul id="comparableIssues">` block, using compact `#<number>` links. The leading
hidden `aitm-record` envelope stores a versioned external-list descriptor with
the item count and canonical-array SHA-256; the reader authenticates that block,
reconstructs the logical comparable array, and then validates the unchanged
whole-payload hash, record ID, predecessor/supersedes links, repository, and
issue correlation. Historical v1/v2 comments with embedded arrays remain
readable and are not migrated. Missing, malformed, truncated, conflicting,
tampered, or uncorrelated evidence fails closed instead of becoming a zero.
```

- [ ] **Step 2: Run the issue-specific focused verifier**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-comment-transport.test.mjs scripts/tests/unit/task-tracker/lib/estimation/records.test.mjs scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run formatting and lint**

Run:

```bash
npm run format:check
npm run lint
```

Expected: both commands exit 0. If formatting fails, run `npm run format`, inspect the resulting diff, and rerun both commands.

- [ ] **Step 4: Run the complete fast and slow regression lanes**

Run:

```bash
npm test
npm run test:slow
```

Expected: both commands exit 0. Treat any unrelated-looking failure as evidence to investigate, not as permission to skip the lane.

- [ ] **Step 5: Inspect the final diff and verify no historical issue mutation code was added**

Run:

```bash
git diff --check
git diff --stat origin/trunk...HEAD
git diff origin/trunk...HEAD -- scripts/task-tracker/lib/estimation scripts/task-tracker/lib/github-records/record-envelope.mjs scripts/tests/unit/task-tracker/lib/estimation scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs docs/guides/workflow.md
```

Expected: only the scoped codec, validation reuse, envelope boundary, renderer, tests, and workflow documentation appear; there is no updater, migration, issue reopen, or historical comment rewrite path.

- [ ] **Step 6: Commit documentation and any final test-only corrections**

```bash
git add docs/guides/workflow.md
git commit -m "docs(workflow): explain external forecast comparables [#1514]"
```

- [ ] **Step 7: Confirm commit history**

Run:

```bash
git log --oneline --decorate origin/trunk..HEAD
```

Expected: the approved design commits plus the focused codec, envelope, writer, and documentation commits for #1514, with no unrelated history.
