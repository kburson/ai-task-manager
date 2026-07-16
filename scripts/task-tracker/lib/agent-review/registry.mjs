// Agent Review Gate — validator registry (#809).
//
// The gate is a registry + runner pair. This module is the registry: a
// pluggable collection of validators that the `/task review` gate runs before
// an issue may pass Review. Validators V1–V6 self-register against the frozen
// interface below; the registry knows nothing about any individual validator.
//
// Validator interface (frozen — V1–V6 depend on this):
//
//   {
//     id: string,                       // stable, unique registry key
//     describe(): string,               // one-line human summary (optional)
//     validate(context): {              // pure; no side effects
//       pass: boolean,
//       failures: string[],             // human-readable, names the artifact
//       normalized?: string,            // a rewritten issue body (normalizers)
//     },
//   }
//
// A validator that returns `normalized` (V6, the marker-organization
// normalizer) is asking the runner to adopt a rewritten body: the runner
// applies it, threads it into the context for every subsequent validator, and
// re-runs the normalizer on its own output before deciding pass/fail.

// Create an isolated registry. The default export is a shared singleton, but
// tests (and any caller wanting isolation) build their own with this factory
// so registrations never leak between suites.
export function createRegistry() {
  const registered = [];

  function register(validator) {
    if (!validator || typeof validator !== 'object') {
      throw new Error('register: validator must be an object');
    }
    if (typeof validator.id !== 'string' || validator.id.length === 0) {
      throw new Error('register: validator.id must be a non-empty string');
    }
    if (typeof validator.validate !== 'function') {
      throw new Error(`register: validator "${validator.id}" must have a validate() function`);
    }
    if (registered.some((v) => v.id === validator.id)) {
      throw new Error(`register: a validator with id "${validator.id}" is already registered`);
    }
    registered.push(validator);
    return validator;
  }

  // Snapshot of registered validators in registration order.
  function validators() {
    return registered.slice();
  }

  function clear() {
    registered.length = 0;
  }

  // Run every registered validator against `context` in registration order.
  //
  // Threading: `context.body` is the issue body. When a validator returns a
  // `normalized` body, the runner adopts it as the working body for all
  // subsequent validators and re-runs that validator on the normalized body.
  //
  // Aggregate: `pass` is the AND of every validator's pass; `failures` is the
  // concatenation of each failing validator's failures, prefixed with the
  // validator id. Zero validators → vacuous pass. `normalizedBody` is the
  // final working body, present only when some normalizer changed it.
  // `validatorsRun` lists the ids of every validator that executed, in
  // registration order — the review verb stamps this onto the "Agent Review
  // Passed" evidence marker (#841) so the proven box records what actually ran.
  function runAll(context = {}) {
    const baseBody = typeof context.body === 'string' ? context.body : '';
    let body = baseBody;
    let allPass = true;
    const failures = [];
    const validatorsRun = [];

    for (const v of registered) {
      validatorsRun.push(v.id);
      let res = v.validate({ ...context, body });
      if (res && typeof res.normalized === 'string') {
        body = res.normalized;
        // Re-validate the normalizer against its own output.
        res = v.validate({ ...context, body });
      }
      res = res || { pass: false, failures: [`${v.id} returned no result`] };
      if (!res.pass) {
        allPass = false;
        for (const f of res.failures || []) failures.push(`${v.id}: ${f}`);
        // A failing validator with no message still fails the aggregate.
        if (!res.failures || res.failures.length === 0) {
          failures.push(`${v.id}: failed`);
        }
      }
    }

    return {
      pass: allPass,
      failures,
      validatorsRun,
      normalizedBody: body !== baseBody ? body : undefined,
    };
  }

  return { register, validators, runAll, clear };
}

// Shared singleton registry. V1–V6 import this and self-register at module
// load; the `/task review` gate runs it via review-gate.mjs.
export const registry = createRegistry();

export default registry;
