import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMAND_FLAGS, COMMAND_USAGE, COMMANDS } from '../../src/cli/parse.mjs';
import { explainError, helpRequest } from '../../src/cli/help-data.mjs';

test('all offline help topics derive complete contracts from the frozen command catalog', () => {
  const resultSchema = JSON.parse(
    readFileSync(new URL('../../schemas/cli-result-v1.json', import.meta.url), 'utf8')
  );
  assert.equal(resultSchema.$id, 'ai-peer-review.cli-result/v1');
  assert.equal(resultSchema.additionalProperties, false);
  assert.equal(resultSchema.properties.review.additionalProperties, false);
  assert.equal(resultSchema.properties.paths.additionalProperties, false);
  assert.equal(resultSchema.properties.next_action.oneOf[1].additionalProperties, false);
  for (const [name, definition] of Object.entries(resultSchema.$defs)) {
    if (definition.type === 'object') assert.equal(definition.additionalProperties, false, name);
  }
  for (const command of COMMANDS) {
    const topic = helpRequest(command, 'json');
    assert.equal(topic.schema, 'ai-peer-review.help/v1');
    assert.equal(topic.command, command);
    assert.equal(topic.usage, COMMAND_USAGE[command]);
    for (const field of [
      'purpose',
      'roles',
      'states',
      'usage',
      'arguments',
      'flags',
      'defaults',
      'environment',
      'preconditions',
      'effects',
      'commit',
      'push',
      'block',
      'wake',
      'tokens',
      'no_commit',
      'examples',
      'result',
      'next_action',
      'errors',
      'json_schema',
    ])
      assert.ok(Object.hasOwn(topic, field), `${command}.${field}`);
    assert.deepEqual(
      topic.flags.map(({ flag }) => flag),
      COMMAND_FLAGS[command]
    );
    for (const code of topic.errors) {
      const explanation = explainError(code);
      assert.equal(explanation.code, code);
      assert.doesNotMatch(explanation.message, /documented fail-closed check/i);
      assert.ok(explanation.recovery.length > 20, code);
    }
  }
});

test('the closed CLI result schema covers attempt supersession and record consolidation', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/cli-result-v1.json', import.meta.url), 'utf8')
  );
  assert.ok(schema.required.includes('record_id'));
  assert.ok(schema.properties.command.enum.includes('supersede'));
  assert.ok(schema.properties.command.enum.includes('consolidate'));
  assert.ok(schema.$defs.state.enum.includes('superseded'));
  assert.ok(schema.$defs.state.enum.includes('planned'));
  assert.ok(schema.$defs.state.enum.includes('consolidated'));
  assert.equal(schema.properties.mode.enum.join(','), 'dry-run,apply');
  assert.equal(schema.properties.mappings.items.additionalProperties, false);
  assert.deepEqual(schema.properties.mappings.items.required, [
    'review_id',
    'source',
    'destination',
    'digest',
    'collision',
  ]);
  assert.ok(
    schema.allOf.some(
      (branch) =>
        branch.if?.properties?.command?.const === 'consolidate' &&
        branch.then?.required?.includes('mappings') &&
        branch.then.required.includes('receipt')
    )
  );
});

test('coordinator help declares durable wake and bounded manual fallback semantics', () => {
  const coordinator = helpRequest('coordinator', 'json');
  assert.match(coordinator.wake, /durable.*exact.*participant/i);
  assert.match(coordinator.tokens, /zero.*idle/i);
  assert.match(coordinator.next_action, /status.*--next.*manual/i);
  assert.equal(coordinator.json_schema, 'ai-peer-review.coordinator-result/v1');
});

test('Claude launch help and result schema freeze bounded recovery', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/claude-launch-result-v1.json', import.meta.url), 'utf8')
  );
  assert.equal(schema.$id, 'ai-peer-review.claude-launch-result/v1');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.command, { const: 'launch-reviewer' });
  assert.deepEqual(schema.properties.status.enum, [
    'submitted',
    'permission-blocked',
    'failed',
    'outcome-unknown',
  ]);
  const topic = helpRequest('launch-reviewer', 'json');
  assert.match(topic.preconditions.join(' '), /sealed.*invitation.*exact.*response/i);
  assert.match(topic.effects.join(' '), /same.*session.*resume/i);
  assert.match(topic.effects.join(' '), /exact.*response.*permission/i);
  assert.match(topic.preconditions.join(' '), /private.*session.*state/i);
  assert.match(topic.next_action, /launch-reviewer.*--resume/i);
  assert.equal(topic.json_schema, 'ai-peer-review.claude-launch-result/v1');
  assert.match(
    explainError('APR_CLAUDE_PERMISSION_INVALID').recovery,
    /\/\/.*filesystem.*\/.*project/i
  );
});

test('help --all, search, JSON, and stable error explanations have deterministic fixtures', () => {
  const rendered = helpRequest(null, 'text', { all: true });
  assert.equal(
    createHash('sha256').update(rendered).digest('hex'),
    readFileSync(new URL('./help/all.sha256.txt', import.meta.url), 'utf8').trim()
  );
  assert.match(helpRequest('submit', 'text'), /peer-review submit/);
  const submitJson = JSON.stringify(helpRequest('submit', 'json'));
  assert.equal(
    createHash('sha256').update(submitJson).digest('hex'),
    readFileSync(new URL('./help/submit.sha256.txt', import.meta.url), 'utf8').trim()
  );
  assert.doesNotMatch(submitJson, /\x1b\[/);
  assert.ok(helpRequest('status', 'json').flags.some(({ flag }) => flag === '--next'));
  assert.match(
    helpRequest('start', 'json').preconditions.join(' '),
    /bootstrap-grant.*pin-verifier/
  );
  assert.ok(helpRequest('start', 'json').errors.includes('APR_AUTHORITY_REQUIRED'));
  assert.ok(helpRequest('start', 'json').errors.includes('APR_REVIEWER_SELECTION_UNSUPPORTED'));
  assert.ok(helpRequest('start', 'json').errors.includes('APR_AUTHORITY_POLICY'));
  assert.ok(helpRequest('start', 'json').errors.includes('APR_STALE_REVIEW'));
  assert.ok(helpRequest('start', 'json').errors.includes('APR_TEMPLATE_INVALID'));
  assert.ok(helpRequest('join', 'json').errors.includes('APR_TRANSPORT_UNAVAILABLE'));
  const consolidate = helpRequest('consolidate', 'json');
  assert.match(consolidate.usage, /--destination.*--dry-run.*--apply/);
  assert.match(consolidate.effects.join(' '), /source.*digest.*receipt/i);
  assert.equal(consolidate.commit, 'Exact relocation paths only in normal mode.');
  assert.equal(explainError('APR_STALE_REVIEW').code, 'APR_STALE_REVIEW');
  assert.equal(explainError('APR_TEMPLATE_INVALID').code, 'APR_TEMPLATE_INVALID');
  assert.ok(helpRequest('review', 'json', { search: true }).matches.includes('submit'));
  assert.equal(explainError('APR_ARTIFACT_DIRTY').code, 'APR_ARTIFACT_DIRTY');
  assert.match(
    explainError('APR_REVIEWER_GIT_VIOLATION').recovery,
    /0\.2\.1.*preserve.*workspace.*restart/i
  );
  assert.throws(
    () => explainError('APR_UNKNOWN'),
    (error) => error.code === 'APR_USAGE'
  );
  assert.throws(
    () => explainError('__proto__'),
    (error) => error.code === 'APR_USAGE'
  );
});
