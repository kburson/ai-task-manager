import assert from 'node:assert/strict';

// Unit fixtures that replace every remote write still need to exercise the
// governed-effect call shape. This adapter authenticates only the in-memory
// test callback; production callers never import it.
export async function withTestGovernedEffect(options, callback) {
  assert.match(String(options?.issueId ?? ''), /^[1-9]\d*$/);
  assert.equal(typeof options?.operation, 'string');
  assert.equal(typeof callback, 'function');
  return callback({
    reverify: async () => {},
    continue: withTestGovernedEffect,
  });
}

export const governedEffectDeps = Object.freeze({
  withGovernedEffect: withTestGovernedEffect,
});
