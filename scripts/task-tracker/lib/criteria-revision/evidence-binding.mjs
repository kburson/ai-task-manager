// @story #1855
// A closed durable evidence binding. Shape validation does not establish authority;
// current authority is derived by policy from its private held observation.
import { exactKeys, identifier } from './schema.mjs';
export function validateRevisionEvidenceBinding(binding) {
  exactKeys(binding, ['schema', 'repository', 'issue', 'revisionId', 'semanticContractDigest', 'contractEpoch', 'authorityEpoch'], 'evidence-binding-keys');
  if (binding.schema !== 'aitm.revision-evidence-binding/v1' ||
      typeof binding.repository !== 'string' || !/^[^/ ]+[/][^/ ]+$/.test(binding.repository) ||
      !Number.isSafeInteger(binding.issue) || binding.issue <= 0 ||
      !/^sha256:[0-9a-f]{64}$/.test(binding.semanticContractDigest))
    throw new TypeError('criteria-revision:evidence-binding');
  identifier(binding.revisionId, 'evidence-revision');
  for (const key of ['contractEpoch', 'authorityEpoch'])
    if (binding[key] !== null && (!Number.isSafeInteger(binding[key]) || binding[key] < 1))
      throw new TypeError('criteria-revision:evidence-epoch');
  if ((binding.contractEpoch === null) !== (binding.authorityEpoch === null))
    throw new TypeError('criteria-revision:evidence-epoch-pair');
  return binding;
}
