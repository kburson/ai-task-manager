// @story #1671

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createPositionIndex, decodeGuidanceSource } from '../../../../../guidance/positions.mjs';
import { parseGuidanceSource } from '../../../../../guidance/parse.mjs';
import { validateGuidance } from '../../../../../guidance/validate.mjs';
import { resolveDocumentationReference } from '../../../../../guidance/documentation.mjs';
import { fingerprintCatalog, fingerprintEntry } from '../../../../../guidance/fingerprints.mjs';
import { GUIDANCE_LIMITS } from '../../../../../guidance/requirements.mjs';
import {
  GUIDANCE_PACKAGE_ROOT,
  packagedGuidanceSource,
} from '../../../helpers/guidance-fixtures.mjs';

const PACKAGE_ROOT = GUIDANCE_PACKAGE_ROOT;

test('strict UTF-8 decoding rejects malformed byte sequences before YAML parsing', () => {
  assert.throws(() => decodeGuidanceSource(Uint8Array.of(0x63, 0x3a, 0x20, 0xc3, 0x28)), {
    code: 'guidance-invalid-utf8',
  });
});

test('position index counts UTF-16 code units after emoji and normalizes CRLF and lone CR', () => {
  const raw = 'human: { explanation: "😀", bad: true }\r\nnext: é\rfinal: e\u0301\n';
  const source = decodeGuidanceSource(raw);
  assert.equal(source, raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
  const index = createPositionIndex(source);
  assert.deepEqual(index.positionAt(source.indexOf('bad')), { line: 1, column: 29 });
  assert.deepEqual(index.positionAt(source.indexOf('next')), { line: 2, column: 1 });
  assert.deepEqual(index.positionAt(source.indexOf('final')), { line: 3, column: 1 });
  assert.deepEqual(
    createPositionIndex(decodeGuidanceSource(raw.replaceAll('\r\n', '\n'))).positionAt(
      source.indexOf('bad')
    ),
    { line: 1, column: 29 }
  );
});

test('event parser retains raw nested field ranges independently of decoded scalar values', () => {
  const source = 'entries:\n  - id: action.bind\n    human: { explanation: "😀", bad: true }\n';
  const parsed = parseGuidanceSource(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.value.entries[0].human.explanation, '😀');
  assert.deepEqual(parsed.ranges.get('entries[0].human.bad'), {
    start: source.indexOf('bad:'),
    end: source.indexOf('bad:') + 3,
  });
  assert.deepEqual(createPositionIndex(parsed.source).positionAt(source.indexOf('bad:')), {
    line: 3,
    column: 33,
  });
});

test('event parser rejects duplicate mapping keys before construction loses the first value', () => {
  const parsed = parseGuidanceSource('entries:\n  - id: action.bind\n    id: action.resume\n');
  assert.equal(parsed.value, null);
  assert.deepEqual(
    parsed.diagnostics.map(({ code, path }) => ({ code, path })),
    [{ code: 'duplicate-key', path: 'entries[0].id' }]
  );
});

test('event parser rejects anchors, aliases, tags, and quoted or plain merge keys', () => {
  const cases = [
    ['a: &x value\n', 'yaml-anchor'],
    ['a: *x\n', 'yaml-alias'],
    ['a: !!str value\n', 'yaml-tag'],
    ['<<: {a: 1}\n', 'yaml-merge-key'],
    ['"<<": {a: 1}\n', 'yaml-merge-key'],
  ];
  for (const [source, code] of cases) {
    const parsed = parseGuidanceSource(source);
    assert.equal(parsed.value, null, source);
    assert.ok(
      parsed.diagnostics.some((item) => item.code === code),
      source
    );
  }
});

test('quoted field ranges include raw quotes after a folded block scalar', () => {
  const source =
    'entries:\n  - human:\n      explanation: >-\n        one\n        two\n      "bad": true\n';
  const parsed = parseGuidanceSource(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.value.entries[0].human.explanation, 'one two');
  assert.deepEqual(parsed.ranges.get('entries[0].human.bad'), {
    start: source.indexOf('"bad"'),
    end: source.indexOf('"bad"') + '"bad"'.length,
  });
  assert.deepEqual(createPositionIndex(parsed.source).positionAt(source.indexOf('"bad"')), {
    line: 6,
    column: 7,
  });
});

test('validator reports independent unknown fields with exact UTF-16 field positions', () => {
  const source = [
    'schema: aitm.guidance-catalog/v1',
    'catalog_version: 1',
    'unexpected: true',
    'entries:',
    '  - id: action.bind',
    '    revision: 1',
    '    binds: { action_ids: [bind], guard_ids: [], remediation_ids: [] }',
    '    agent: { instruction: [{ query: bind }] }',
    '    human: { explanation: "😀", bad: true }',
    '',
  ].join('\n');
  const result = validateGuidance({ source, sourcePath: 'instructions/aitm-guidance.yml' });
  const unknown = result.errors.filter(({ code }) => code === 'unknown-field');
  assert.deepEqual(
    unknown.map(({ path, line, column }) => ({ path, line, column })),
    [
      { path: 'unexpected', line: 3, column: 1 },
      { path: 'entries[0].human.bad', line: 9, column: 33 },
    ]
  );
  assert.ok(result.errors.some(({ code }) => code === 'required-field'));
  assert.deepEqual(
    result.errors
      .filter(({ code, path }) => code === 'required-field' && path === 'entries[0].human.summary')
      .map(({ line, column }) => ({ line, column })),
    [{ line: 9, column: 5 }]
  );
  assert.ok(result.errors.some(({ code }) => code === 'guidance-incomplete'));
  assert.equal(result.valid, false);
});

test('validator rejects duplicate IDs and unregistered agent operations without dropping either error', () => {
  const source = [
    'schema: aitm.guidance-catalog/v1',
    'catalog_version: 1',
    'entries:',
    '  - id: action.bind',
    '    revision: 1',
    '    binds: { action_ids: [bind], guard_ids: [], remediation_ids: [] }',
    '    agent: { instruction: [{ execute_shell: echo }] }',
    '    human: { summary: Bind, explanation: Bind safely. }',
    '  - id: action.bind',
    '    revision: 1',
    '    binds: { action_ids: [bind], guard_ids: [], remediation_ids: [] }',
    '    agent: { instruction: [{ query: bind }] }',
    '    human: { summary: Bind again, explanation: Duplicate. }',
    '',
  ].join('\n');
  const result = validateGuidance({ source, sourcePath: 'instructions/aitm-guidance.yml' });
  assert.ok(
    result.errors.some(({ code, path }) => code === 'duplicate-id' && path === 'entries[1].id')
  );
  assert.ok(
    result.errors.some(
      ({ code, path }) =>
        code === 'unknown-agent-operation' && path === 'entries[0].agent.instruction[0]'
    )
  );
});

test('value-level diagnostics use raw instruction-key and binding-value positions', () => {
  const source = packagedGuidanceSource()
    .replace('{ query: bind }', '{ execute_shell: bind }')
    .replace('action_ids: [bind]', 'action_ids: [bogus]');
  const result = validateGuidance({ source, packageRoot: PACKAGE_ROOT });
  const instruction = result.errors.find(({ code }) => code === 'unknown-agent-operation');
  const binding = result.errors.find(
    ({ code, path }) => code === 'unknown-reference' && path === 'entries[0].binds.action_ids[0]'
  );
  assert.deepEqual([instruction.line, instruction.column], [15, 13]);
  assert.deepEqual([binding.line, binding.column], [11, 27]);
});

test('an instruction cannot query or execute a registered action outside its entry binding', () => {
  const source = packagedGuidanceSource()
    .replace('{ query: bind }', '{ query: close }')
    .replace('{ execute: bind }', '{ execute: close }');
  const result = validateGuidance({ source, packageRoot: PACKAGE_ROOT });
  assert.deepEqual(
    result.errors
      .filter(({ code }) => code === 'instruction-action-unbound')
      .map(({ path }) => path),
    ['entries[0].agent.instruction[0]', 'entries[0].agent.instruction[3]']
  );
});

test('documentation references resolve shipped paths and reject traversal', () => {
  assert.equal(
    resolveDocumentationReference(
      { path: 'docs/guides/workflow.md', anchor: 'kanban-board-states' },
      { packageRoot: PACKAGE_ROOT }
    ).ok,
    true
  );
  assert.equal(
    resolveDocumentationReference({ path: '../README.md' }, { packageRoot: PACKAGE_ROOT }).code,
    'documentation-path-invalid'
  );
});

test('validator checks registry bindings, typed examples and documentation anchors independently', () => {
  const source = [
    'schema: aitm.guidance-catalog/v1',
    'catalog_version: 1',
    'entries:',
    '  - id: action.bind',
    '    revision: 1',
    '    binds: { action_ids: [invented], guard_ids: [invented-guard], remediation_ids: [] }',
    '    agent: { instruction: [{ query: bind }] }',
    '    human:',
    '      summary: Bind safely',
    '      explanation: Read-only guidance.',
    '      examples: [{ command: npx aitm bind 1671, purpose: Example, shell: rm }]',
    '      documentation: [{ path: docs/guides/workflow.md, anchor: absent }]',
    '',
  ].join('\n');
  const result = validateGuidance({
    source,
    sourcePath: 'candidate.yml',
    packageRoot: PACKAGE_ROOT,
  });
  assert.ok(
    result.errors.some(
      ({ code, path }) => code === 'unknown-reference' && path.includes('action_ids')
    )
  );
  assert.ok(
    result.errors.some(
      ({ code, path }) => code === 'unknown-reference' && path.includes('guard_ids')
    )
  );
  assert.ok(
    result.errors.some(
      ({ code, path }) => code === 'unknown-field' && path.endsWith('.examples[0].shell')
    )
  );
  assert.ok(result.errors.some(({ code }) => code === 'documentation-anchor-missing'));
});

test('source byte limit is checked before a syntactically malformed oversized document is parsed', () => {
  const source = `a: [\n${'x'.repeat(1024 * 1024)}`;
  const result = validateGuidance({ source, sourcePath: 'candidate.yml' });
  assert.equal(result.errors[0].code, 'source-limit');
});

test('five fingerprints isolate agent, human, semantic and raw-file edits', () => {
  const entry = {
    id: 'action.bind',
    revision: 1,
    binds: { action_ids: ['bind'], guard_ids: [], remediation_ids: [] },
    agent: { instruction: [{ query: 'bind' }, { never: 'bypass_guard' }] },
    human: { summary: 'Bind', explanation: 'Explain binding.' },
  };
  const reordered = {
    human: { explanation: 'Explain binding.', summary: 'Bind' },
    agent: { instruction: [{ query: 'bind' }, { never: 'bypass_guard' }] },
    binds: { remediation_ids: [], guard_ids: [], action_ids: ['bind'] },
    revision: 1,
    id: 'action.bind',
  };
  assert.deepEqual(fingerprintEntry(entry), fingerprintEntry(reordered));
  const humanEdit = {
    ...entry,
    human: { ...entry.human, explanation: 'A different explanation.' },
  };
  assert.equal(fingerprintEntry(entry).agentDigest, fingerprintEntry(humanEdit).agentDigest);
  assert.notEqual(fingerprintEntry(entry).humanDigest, fingerprintEntry(humanEdit).humanDigest);
  const agentEdit = {
    ...entry,
    agent: { instruction: [{ never: 'bypass_guard' }, { query: 'bind' }] },
  };
  assert.equal(fingerprintEntry(entry).humanDigest, fingerprintEntry(agentEdit).humanDigest);
  assert.notEqual(fingerprintEntry(entry).agentDigest, fingerprintEntry(agentEdit).agentDigest);

  const baseline = fingerprintCatalog({
    entries: [entry],
    metadata: { schema: 'aitm.guidance-catalog/v1', catalog_version: 1 },
    source: 'entries: []\r\n',
  });
  const comment = fingerprintCatalog({
    entries: [entry],
    metadata: { catalog_version: 1, schema: 'aitm.guidance-catalog/v1' },
    source: 'entries: []\n# comment\n',
  });
  assert.equal(baseline.catalogSemanticDigest, comment.catalogSemanticDigest);
  assert.notEqual(baseline.catalogFileDigest, comment.catalogFileDigest);
  assert.match(baseline.catalogFileDigest, /^sha256:[a-f0-9]{64}$/);
});

test('packaged seed validates offline with all core IDs, five digests and catalog headroom', () => {
  const source = readFileSync(path.join(PACKAGE_ROOT, 'instructions', 'aitm-guidance.yml'));
  const result = validateGuidance({
    source,
    sourcePath: 'instructions/aitm-guidance.yml',
    packageRoot: PACKAGE_ROOT,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(result.entries.length, 17);
  assert.deepEqual(
    result.entries.slice(-3).map(({ id }) => id),
    ['navigation.unknown', 'navigation.unresolved', 'state.done']
  );
  assert.match(result.fingerprints.catalogSemanticDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.fingerprints.catalogFileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.fingerprints.entryDigests.length, 17);
  assert.ok(result.budgets.catalogProxy <= 240000 * 0.8);
  assert.ok(result.budgets.agentProxy <= 64000 * 0.8);
  assert.ok(result.budgets.humanProxy <= 160000 * 0.8);
  assert.equal(
    result.entries.length,
    result.fingerprints.entryDigests.length,
    'each seed entry has all three per-entry fingerprints'
  );
});

test('packaged genesis provenance names the empty v1 semantic baseline rather than a placeholder', () => {
  const seed = packagedGuidanceSource();
  const result = validateGuidance({ source: seed, packageRoot: PACKAGE_ROOT });
  const emptyBaseline = fingerprintCatalog({
    entries: [],
    metadata: { schema: 'aitm.guidance-catalog/v1', catalog_version: 1 },
    source: '',
  }).catalogSemanticDigest;
  assert.equal(result.valid, true);
  assert.match(seed, new RegExp(`based_on_catalog_digest: ${emptyBaseline}`));
});

test('parser, schema and seed are in the published production package contract', () => {
  const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const schema = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, 'instructions', 'aitm-guidance.schema.json'), 'utf8')
  );
  assert.equal(manifest.dependencies['js-yaml'], '5.4.2');
  assert.equal(manifest.devDependencies['js-yaml'], undefined);
  assert.ok(manifest.files.includes('guidance/'));
  assert.ok(manifest.files.includes('instructions/'));
  assert.equal(schema.$id, 'aitm.guidance-catalog/v1');
});

test('active source profile refuses an untracked or misplaced override while candidate stays inspectable', () => {
  const source = readFileSync(path.join(PACKAGE_ROOT, 'instructions', 'aitm-guidance.yml'));
  const untracked = validateGuidance({
    source,
    sourcePath: '.ai-task-manager/aitm-guidance.yml',
    profile: 'active-project',
    tracked: false,
    packageRoot: PACKAGE_ROOT,
  });
  assert.ok(untracked.errors.some(({ code }) => code === 'source-untracked'));
  const misplaced = validateGuidance({
    source,
    sourcePath: 'aitm-guidance.yml',
    profile: 'active-project',
    tracked: true,
    packageRoot: PACKAGE_ROOT,
  });
  assert.ok(misplaced.errors.some(({ code }) => code === 'source-path-invalid'));
  const candidate = validateGuidance({
    source,
    sourcePath: 'aitm-guidance.yml',
    profile: 'candidate',
    packageRoot: PACKAGE_ROOT,
  });
  assert.equal(candidate.valid, true);
  assert.equal(candidate.sourceType, 'candidate');
});

test('fatal source diagnostics retain the requested source profile', () => {
  const result = validateGuidance({
    source: Uint8Array.of(0xc3, 0x28),
    sourcePath: 'instructions/aitm-guidance.yml',
    profile: 'published',
  });
  assert.equal(result.sourceType, 'package');
  assert.equal(result.errors[0].code, 'invalid-utf8');
});

test('duplicate registered bindings are rejected even though both references resolve', () => {
  const source = packagedGuidanceSource().replace('action_ids: [bind]', 'action_ids: [bind, bind]');
  const result = validateGuidance({ source, packageRoot: PACKAGE_ROOT });
  assert.ok(
    result.errors.some(
      ({ code, path }) => code === 'duplicate-binding' && path === 'entries[0].binds.action_ids[1]'
    )
  );
});

test('field and proxy budgets emit independent limit diagnostics', () => {
  const explanation = 'x'.repeat(64001);
  const source = [
    'schema: aitm.guidance-catalog/v1',
    'catalog_version: 1',
    'entries:',
    '  - id: action.bind',
    '    revision: 1',
    '    binds: { action_ids: [bind], guard_ids: [], remediation_ids: [] }',
    '    agent: { instruction: [{ query: bind }] }',
    '    human:',
    '      summary: Bind',
    `      explanation: ${explanation}`,
    '',
  ].join('\n');
  const result = validateGuidance({ source, sourcePath: 'candidate.yml' });
  assert.ok(
    result.errors.some(({ code, path }) => code === 'field-limit' && path.endsWith('.explanation'))
  );
  assert.ok(
    result.errors.some(({ code, path }) => code === 'budget-limit' && path.endsWith('.human'))
  );
  assert.ok(result.budgets.perEntry[0].humanProxy > 16000);
});

test('each structural limit rejects its limit-plus-one catalog', () => {
  const baseline = parseGuidanceSource(packagedGuidanceSource()).value;
  const cases = [
    [
      'id',
      (catalog) => {
        catalog.entries[0].id = 'x'.repeat(GUIDANCE_LIMITS.idCharacters + 1);
      },
      'entries[0].id',
    ],
    [
      'instructions',
      (catalog) => {
        catalog.entries[0].agent.instruction = Array.from(
          { length: GUIDANCE_LIMITS.instructionsPerEntry + 1 },
          () => ({ never: 'bypass_guard' })
        );
      },
      'entries[0].agent.instruction',
    ],
    [
      'bindings',
      (catalog) => {
        catalog.entries[0].binds.action_ids = Array(GUIDANCE_LIMITS.bindingsPerList + 1).fill(
          'bind'
        );
      },
      'entries[0].binds.action_ids',
    ],
    [
      'explanation',
      (catalog) => {
        catalog.entries[0].human.explanation = 'x'.repeat(
          GUIDANCE_LIMITS.explanationCharacters + 1
        );
      },
      'entries[0].human.explanation',
    ],
    [
      'entries',
      (catalog) => {
        catalog.entries = Array.from({ length: GUIDANCE_LIMITS.entries + 1 }, (_, index) => ({
          ...catalog.entries[0],
          id: `extra.${index}`,
        }));
      },
      'entries',
    ],
  ];
  for (const [name, mutate, expectedPath] of cases) {
    const catalog = structuredClone(baseline);
    mutate(catalog);
    const result = validateGuidance({ source: JSON.stringify(catalog), packageRoot: PACKAGE_ROOT });
    assert.ok(
      result.errors.some(({ code, path }) => code === 'field-limit' && path === expectedPath),
      `${name} limit-plus-one must fail at ${expectedPath}`
    );
  }
});
