// @story #1851
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
import { deriveProposal } from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import {
  validateRevisionRequest,
  validateRevisionProposal,
} from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { withRevisionValidation } from '../../../../../task-tracker/lib/criteria-revision/records.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { resolveCoordinatorAuthority } from '../../../../../task-tracker/lib/github-records/coordination-authority.mjs';
import { COMMAND_CATALOG } from '../../../../../task-tracker/lib/command-surface/catalog.mjs';
import { listLifecycleActions } from '../../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
function reseal(p) {
  const rest = { ...p };
  delete rest.proposalDigest;
  p.proposalDigest = `sha256:${createHash('sha256').update(canonicalRecordJson(rest)).digest('hex')}`;
}
for (const make of [makeLegacyRevisionFixture, makeCanonicalRevisionFixture])
  test(`${make.name}: complete initial and recovery requests validate`, () => {
    const f = make();
    assert.equal(validateRevisionRequest(f.request), f.request);
    assert.equal(validateRevisionRequest(f.resumeRequest), f.resumeRequest);
  });
test('unknown nested keys cannot be laundered by resealing', () => {
  const f = makeLegacyRevisionFixture();
  for (const path of [
    [],
    ['executor'],
    ['writerDomain'],
    ['authority'],
    ['before'],
    ['edits'],
    ['edits', 'acceptanceCriteria', 0],
    ['edits', 'acceptanceCriteria', 0, 'replacements', 0],
    ['edits', 'acceptanceCriteria', 0, 'replacements', 0, 'declaration'],
    ['identityMap', 0],
    ['invalidation', 0],
    ['archive'],
    ['archive', 'observation'],
    ['archive', 'definitions', 0],
    ['archive', 'resourceVector'],
    ['writeSet', 0],
    ['after'],
  ]) {
    const r = structuredClone(f.request);
    let value = r.proposal;
    for (const key of path) value = value[key];
    value.unknown = true;
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /keys|declaration/);
  }
  for (const key of ['allowMarkerLoss', 'body', 'proof', 'loadUserMessage', 'transcriptPath'])
    assert.throws(() => validateRevisionRequest({ ...f.request, [key]: true }), /keys/);
});
test('caller dispositions, identities and write bytes must reproduce tool derivation', () => {
  const f = makeLegacyRevisionFixture();
  for (const mutate of [
    (p) => (p.invalidation[0].disposition = 'preserved-individual'),
    (p) => {
      p.writeSet[0].afterBytes = 'arbitrary body';
      p.writeSet[0].afterHash = `sha256:${createHash('sha256').update('arbitrary body').digest('hex')}`;
    },
    (p) => (p.identityMap[0].afterIdentities = ['forged']),
  ]) {
    const r = structuredClone(f.request);
    mutate(r.proposal);
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /derived|identity|disposition/);
  }
});
test('actions, modes, prior references and recovery-vector digests agree', () => {
  const f = makeLegacyRevisionFixture();
  assert.throws(() => validateRevisionRequest({ ...f.request, action: 'recover' }), /mode/);
  for (const mutate of [
    (p) => (p.observedResourceVector = null),
    (p) => (p.observedResourceVector = 'sha256:' + '0'.repeat(64)),
    (p) => (p.priorTransaction = null),
  ]) {
    const r = structuredClone(f.resumeRequest);
    mutate(r.proposal);
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /resource-vector|prior|derived/);
  }
});
test('ID bounds and declaration-only edits reject supplied proof or arbitrary body prose', () => {
  const f = makeLegacyRevisionFixture();
  for (const messageId of ['x'.repeat(257), 'é', 'bad\nmessage'])
    assert.throws(
      () =>
        validateRevisionRequest({
          ...f.request,
          authorizationSource: { ...f.authorizationSource, messageId },
        }),
      /source|identifier/
    );
  for (const mutate of [
    (r) =>
      (r.proposal.edits.acceptanceCriteria[0].replacements[0].text +=
        ' <!-- aitm-verified sha="fake" -->'),
    (r) => (r.proposal.edits.acceptanceCriteria[0].replacements[0].text = '## Scope\nbody'),
    (r) => (r.proposal.edits.verificationCommands[0].command = () => {}),
  ]) {
    const r = structuredClone(f.request);
    mutate(r);
    assert.throws(() => validateRevisionRequest(r));
  }
});
test('no production mutation command, action or public package export is reachable', () => {
  assert.equal(
    COMMAND_CATALOG.some((x) => x.name.startsWith('criteria-revise')),
    false
  );
  assert.equal(
    listLifecycleActions().some((x) => x.id.startsWith('criteria-revise')),
    false
  );
  const pkg = JSON.parse(
    readFileSync(new URL('../../../../../../package.json', import.meta.url), 'utf8')
  );
  assert.equal(
    Object.keys(pkg.exports ?? {}).some((x) => x.includes('criteria-revision')),
    false
  );
});

test('canonical dependency fixture includes a natively valid active grant', () => {
  const f = makeCanonicalRevisionFixture();
  const result = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue: 124, parentIssue: null }],
    grants: [f.nativeGrant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: f.nativeGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(result.status, 'active');
});

test('current and old approval fixtures bind all Plan sources and target contract epochs', () => {
  const f = makeCanonicalRevisionFixture(),
    target = JSON.parse(
      f.proposal.writeSet.find((x) => x.resource === 'delivery-contract').afterBytes
    );
  assert.equal(f.currentApproval.contractEpoch, target.contractEpoch);
  assert.deepEqual(
    f.currentApproval.sourceBindings.map((x) => x.identity),
    ['user-story', 'story-intent', 'linked-plan']
  );
  assert.equal(f.currentApproval.provenance.mode, 'full-auto');
  assert.equal(f.oldApproval.contractEpoch, f.contract.contractEpoch);
  assert.notEqual(f.oldApproval.revisionId, f.currentApproval.revisionId);
});

test('closed canonical added-root request reproduces contract-resolvable declaration identities', () => {
  const f = makeCanonicalRevisionFixture(),
    c = structuredClone(f.context);
  c.edits.acceptanceCriteria[0].replacements[0].declaration.vcIds = ['vc-new'];
  c.edits.verificationCommands = [
    { operation: 'add', id: 'vc-new', command: 'node --test new-root.test.mjs' },
  ];
  const p = deriveProposal(c);
  validateRevisionRequest({ ...f.request, proposal: p });
  const contract = JSON.parse(
      p.writeSet.find((x) => x.resource === 'delivery-contract').afterBytes
    ),
    ids = new Set(contract.verificationCommands.map((x) => x.logicalId));
  assert.ok(
    p.after.definitions
      .filter((x) => x.declaration.kind === 'vc-list')
      .every((x) => x.declaration.vcIds.every((id) => ids.has(id)))
  );
});

// @story #1855
test('one synchronous validation scope hashes an equal-byte proposal once and expires on return', () => {
  const f = makeLegacyRevisionFixture();
  const first = structuredClone(f.proposal);
  const second = structuredClone(first);
  const rest = { ...first };
  delete rest.proposalDigest;
  const expectedBytes = canonicalRecordJson(rest);
  const prototype = Object.getPrototypeOf(createHash('sha256'));
  const original = Object.getOwnPropertyDescriptor(prototype, 'update');
  assert.equal(typeof original.value, 'function');
  let digestReads = 0;
  Object.defineProperty(prototype, 'update', {
    ...original,
    value: function (...args) {
      const result = Reflect.apply(original.value, this, args);
      if (args[0] === expectedBytes && args[1] === 'utf8') digestReads++;
      return result;
    },
  });
  try {
    withRevisionValidation(() => {
      assert.equal(validateRevisionProposal(first), first);
      assert.equal(validateRevisionProposal(second), second);
    });
    assert.equal(digestReads, 1);
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
    assert.equal(validateRevisionProposal(first), first);
    assert.equal(digestReads, 2);
  } finally {
    Object.defineProperty(prototype, 'update', original);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'update'), original);
});

// Proposed append after the independently retained counter RED.
test('schema scope preserves exact cold refusal and detects changed or repaired DATA', () => {
  const f = makeLegacyRevisionFixture();
  const cases = [
    [
      'request keys',
      (r) => {
        r.extra = true;
      },
      'criteria-revision:keys',
    ],
    [
      'action',
      (r) => {
        r.action = 'other';
      },
      'criteria-revision:action',
    ],
    [
      'mode',
      (r) => {
        r.proposal.mode = 'other';
      },
      'criteria-revision:mode',
    ],
    [
      'digest',
      (r) => {
        r.proposal.proposalDigest = 'sha256:' + '0'.repeat(64);
      },
      'criteria-revision:proposal-digest',
    ],
    [
      'nested keys',
      (r) => {
        r.proposal.executor.extra = true;
      },
      'criteria-revision:keys',
    ],
    [
      'authorization',
      (r) => {
        r.authorizationSource.messageId = 'bad.message';
      },
      'workflow-exception-authority:source',
    ],
    [
      'non-finite',
      (r) => {
        r.proposal.reason = Infinity;
      },
      'canonical-json:invalid:number',
    ],
    [
      'signed zero',
      (r) => {
        r.proposal.reason = -0;
      },
      'canonical-json:invalid:number',
    ],
    [
      'unicode',
      (r) => {
        r.proposal.reason = String.fromCharCode(0xd800);
      },
      'canonical-json:invalid:unicode',
    ],
    [
      'resealed body',
      (r) => {
        r.proposal.writeSet[0].afterBytes = 'arbitrary body';
        r.proposal.writeSet[0].afterHash =
          'sha256:' + createHash('sha256').update('arbitrary body').digest('hex');
        reseal(r.proposal);
      },
      'criteria-revision:derived-proposal',
    ],
  ];
  const failure = (input, expected) => {
    let error;
    try {
      validateRevisionRequest(input);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    assert.equal(Object.getPrototypeOf(error), TypeError.prototype);
    assert.equal(error.message, expected);
    assert.equal(error.code, undefined);
    return { message: error.message, code: error.code, prototype: Object.getPrototypeOf(error) };
  };
  for (const [name, mutate, expected] of cases) {
    const cold = structuredClone(f.request);
    mutate(cold);
    const originalFailure = failure(cold, expected);
    withRevisionValidation(() => {
      const warm = structuredClone(f.request);
      assert.equal(validateRevisionRequest(warm), warm, name);
      mutate(warm);
      assert.deepEqual(failure(warm, expected), originalFailure, name);
      const repaired = structuredClone(f.request);
      assert.equal(validateRevisionRequest(repaired), repaired, name);
    });
    assert.deepEqual(failure(cold, expected), originalFailure, name);
  }
});

test('schema scope rechecks nested accessors and preserves original input identity', () => {
  const f = makeLegacyRevisionFixture();
  let gets = 0;
  withRevisionValidation(() => {
    const input = structuredClone(f.request);
    assert.equal(validateRevisionRequest(input), input);
    Object.defineProperty(input.proposal, 'reason', {
      enumerable: true,
      configurable: true,
      get() {
        gets++;
        return f.proposal.reason;
      },
    });
    assert.throws(() => validateRevisionRequest(input), {
      message: 'canonical-json:invalid:property',
    });
    assert.equal(gets, 0);
    const reordered = Object.fromEntries(Object.entries(f.request).reverse());
    assert.equal(validateRevisionRequest(reordered), reordered);
    assert.notEqual(reordered, f.request);
  });
});

test('schema bridge retains original records callback then observation and cleanup order', async () => {
  const f = makeLegacyRevisionFixture();
  let thenReads = 0,
    calls = 0;
  const value = {
    get then() {
      thenReads++;
      return undefined;
    },
  };
  assert.equal(
    withRevisionValidation(() => {
      calls++;
      validateRevisionRequest(f.request);
      return withRevisionValidation(() => {
        calls++;
        return value;
      });
    }),
    value
  );
  assert.equal(calls, 2);
  assert.equal(thenReads, 1);
  const marker = new Error('original then failure');
  assert.throws(
    () =>
      withRevisionValidation(() => ({
        get then() {
          thenReads++;
          throw marker;
        },
      })),
    (error) => error === marker
  );
  assert.equal(thenReads, 2);
  const promise = Promise.resolve('original');
  assert.throws(() => withRevisionValidation(() => promise), {
    message: 'criteria-revision:async-validation-scope',
  });
  assert.equal(await promise, 'original');
  assert.equal(validateRevisionRequest(f.request), f.request);
});
test('one synchronous validation scope avoids equal-byte request derivation twice', () => {
  const f = makeLegacyRevisionFixture();
  const first = structuredClone(f.request),
    second = structuredClone(first);
  const rest = { ...first.proposal };
  delete rest.proposalDigest;
  const expectedBytes = canonicalRecordJson(rest);
  const prototype = Object.getPrototypeOf(createHash('sha256'));
  const original = Object.getOwnPropertyDescriptor(prototype, 'update');
  let reads = 0;
  Object.defineProperty(prototype, 'update', {
    ...original,
    value: function (...args) {
      const result = Reflect.apply(original.value, this, args);
      if (args[0] === expectedBytes && args[1] === 'utf8') reads++;
      return result;
    },
  });
  try {
    let firstReads;
    withRevisionValidation(() => {
      assert.equal(validateRevisionRequest(first), first);
      firstReads = reads;
      assert.ok(firstReads > 0);
      assert.equal(validateRevisionRequest(second), second);
      assert.equal(reads, firstReads);
    });
    assert.notEqual(first, second);
    const beforeFresh = reads;
    assert.equal(validateRevisionRequest(first), first);
    assert.ok(reads > beforeFresh);
  } finally {
    Object.defineProperty(prototype, 'update', original);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'update'), original);
});

test('schema scope rejects then repairs the same actual request object', () => {
  const f = makeLegacyRevisionFixture();
  const request = structuredClone(f.request);
  withRevisionValidation(() => {
    assert.equal(validateRevisionRequest(request), request);
    const reason = request.proposal.reason;
    request.proposal.reason = Infinity;
    assert.throws(() => validateRevisionRequest(request), {
      message: 'canonical-json:invalid:number',
    });
    request.proposal.reason = reason;
    assert.equal(validateRevisionRequest(request), request);
    const messageId = request.authorizationSource.messageId;
    request.authorizationSource.messageId = 'invalid.message';
    assert.throws(() => validateRevisionRequest(request), {
      message: 'workflow-exception-authority:source',
    });
    request.authorizationSource.messageId = messageId;
    assert.equal(validateRevisionRequest(request), request);
  });
  assert.equal(validateRevisionRequest(request), request);
});

test('both native proposal forms preserve cold and warm initial and recovery input references', () => {
  for (const make of [makeLegacyRevisionFixture, makeCanonicalRevisionFixture]) {
    const f = make();
    for (const input of [f.request, f.resumeRequest]) {
      const original = canonicalRecordJson(input);
      assert.equal(validateRevisionRequest(input), input);
      withRevisionValidation(() => {
        assert.equal(validateRevisionRequest(input), input);
        const copy = structuredClone(input);
        assert.equal(validateRevisionRequest(copy), copy);
        assert.notEqual(copy, input);
        assert.equal(canonicalRecordJson(copy), original);
      });
      assert.equal(canonicalRecordJson(input), original);
      assert.equal(validateRevisionRequest(input), input);
    }
  }
});
test('schema-only bridge expires at return, throw and a real await without observing then', async () => {
  const { withRevisionSchemaValidation } =
    await import('../../../../../task-tracker/lib/criteria-revision/schema.mjs');
  assert.equal(typeof withRevisionSchemaValidation, 'function');
  const f = makeLegacyRevisionFixture();
  const first = structuredClone(f.proposal),
    copy = structuredClone(first);
  const rest = { ...first };
  delete rest.proposalDigest;
  const expectedBytes = canonicalRecordJson(rest);
  const prototype = Object.getPrototypeOf(createHash('sha256'));
  const original = Object.getOwnPropertyDescriptor(prototype, 'update');
  let reads = 0,
    thenReads = 0;
  Object.defineProperty(prototype, 'update', {
    ...original,
    value: function (...args) {
      const result = Reflect.apply(original.value, this, args);
      if (args[0] === expectedBytes && args[1] === 'utf8') reads++;
      return result;
    },
  });
  try {
    const result = {
      get then() {
        thenReads++;
        return undefined;
      },
    };
    assert.equal(
      withRevisionSchemaValidation(() => result),
      result
    );
    assert.equal(thenReads, 0);
    const promise = Promise.resolve('original result');
    assert.equal(
      withRevisionSchemaValidation(() => promise),
      promise
    );
    assert.equal(await promise, 'original result');
    await withRevisionSchemaValidation(async () => {
      assert.equal(validateRevisionProposal(first), first);
      await Promise.resolve();
      assert.equal(validateRevisionProposal(copy), copy);
    });
    assert.equal(reads, 2);
    const marker = new Error('original scope throw');
    assert.throws(
      () =>
        withRevisionSchemaValidation(() => {
          assert.equal(validateRevisionProposal(first), first);
          throw marker;
        }),
      (error) => error === marker
    );
    assert.equal(reads, 3);
    assert.equal(validateRevisionProposal(first), first);
    assert.equal(reads, 4);
    withRevisionSchemaValidation(() => {
      assert.equal(validateRevisionProposal(first), first);
      assert.throws(
        () =>
          withRevisionSchemaValidation(() => {
            throw marker;
          }),
        (error) => error === marker
      );
      assert.equal(validateRevisionProposal(copy), copy);
    });
    assert.equal(reads, 5);
    assert.equal(validateRevisionProposal(first), first);
    assert.equal(reads, 6);
    assert.equal(thenReads, 0);
  } finally {
    Object.defineProperty(prototype, 'update', original);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'update'), original);
});
test('warm request validation refuses changed missing and foreign complete archived DATA', () => {
  const f = makeLegacyRevisionFixture();
  const cases = [
    [
      'changed bytes',
      (r) => {
        r.proposal.archive.observation.revisionRecords.records[0].bytes += ' ';
      },
      'criteria-revision:event-envelope',
    ],
    [
      'missing record',
      (r) => {
        r.proposal.archive.observation.revisionRecords.records = [];
      },
      'criteria-revision:prior-reference',
    ],
    [
      'foreign binding',
      (r) => {
        r.proposal.archive.observation.revisionRecords.records[0].operationId = 'foreign-operation';
      },
      'criteria-revision:recovery-record-binding',
    ],
  ];
  const failure = (input, expected) => {
    let error;
    try {
      validateRevisionRequest(input);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    assert.equal(Object.getPrototypeOf(error), TypeError.prototype);
    assert.equal(error.message, expected);
    assert.equal(error.code, undefined);
    return error.message;
  };
  for (const [name, mutate, expected] of cases) {
    const cold = structuredClone(f.resumeRequest);
    mutate(cold);
    reseal(cold.proposal);
    const oldFailure = failure(cold, expected);
    withRevisionValidation(() => {
      const warm = structuredClone(f.resumeRequest);
      assert.equal(validateRevisionRequest(warm), warm);
      mutate(warm);
      reseal(warm.proposal);
      assert.deepEqual(failure(warm, expected), oldFailure, name);
    });
  }
});

const schemaHashPrototype = Object.getPrototypeOf(createHash('sha256'));
const schemaHashDescriptor = Object.getOwnPropertyDescriptor(schemaHashPrototype, 'update');
after(() => {
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(schemaHashPrototype, 'update'),
    schemaHashDescriptor
  );
});
