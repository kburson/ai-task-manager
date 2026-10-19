// @story #1992 — inventory audit required by the accepted complete caller census.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export function registerDecompositionCensusCases() {
  test('every production generic field/codec reference has an explicit census disposition and proof owner', () => {
    const callers = [];
    function walk(relative) {
      for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const name = relative + '/' + entry.name;
        if (name === 'scripts/tests') continue;
        if (entry.isDirectory()) walk(name);
        else if (
          entry.isFile() &&
          name.endsWith('.mjs') &&
          /writeProjectFieldValue|clearProjectFieldValue|tetherIssueToProject|ensureIssueFieldDb|formatIssueFieldDb/.test(
            readFileSync(path.join(root, name), 'utf8')
          )
        )
          callers.push(name);
      }
    }
    walk('scripts');
    const census = JSON.parse(
      readFileSync(path.join(root, 'docs/guides/decomposition-adapter-census.json'), 'utf8')
    );
    assert.deepEqual(census.callers.map((caller) => caller.path).sort(), callers.sort());
    assert.equal(new Set(census.callers.map((caller) => caller.path)).size, callers.length);
    for (const caller of census.callers) {
      assert.ok(caller.disposition.length > 20, caller.path);
      assert.ok(caller.proof.length > 5, caller.path);
    }
  });
  test('historical foreign healer has a fixed foreign repository and start-time migration targets only startTime', () => {
    // These one-offs must never execute against live repositories in this proof.
    // Inspect parsed effect arguments, not arbitrary source-message wording.
    function nodes(relative) {
      const ast = parse(readFileSync(path.join(root, relative), 'utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'module',
      });
      const result = [],
        stack = [ast];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        result.push(node);
        for (const child of Object.values(node))
          if (Array.isArray(child)) stack.push(...child);
          else if (child && typeof child === 'object') stack.push(child);
      }
      return result;
    }
    const foreign = nodes('scripts/migrate/heal-options-co-pilot-bodies.mjs');
    assert.equal(
      foreign.find((node) => node.type === 'VariableDeclarator' && node.id.name === 'REPO').init
        .value,
      'kburson/options-co-pilot'
    );
    const start = nodes('scripts/migrate/start-time-field.mjs');
    const effects = start.filter(
      (node) => node.type === 'CallExpression' && node.callee.name === 'writeProjectFieldValue'
    );
    assert.equal(effects.length, 1);
    const field = effects[0].arguments[0].properties.find(
      (property) => property.key.name === 'fieldId'
    );
    assert.equal(field.value.name, 'startTimeFieldId');
    const binding = start.find(
      (node) => node.type === 'VariableDeclarator' && node.id.name === 'startTimeFieldId'
    );
    assert.equal(binding.init.left.left.expression.property.name, 'startTime');
    assert.equal(binding.init.left.right.property.name, 'fieldStartTime');
  });
}
