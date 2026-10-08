import { withRevisionConsumer, RevisionPolicyError } from '../criteria-revision/policy.mjs';
// @story #1732
// Execution-only Functional DoD persistence. A projection is never write authority.

import { projectFunctionalDod } from '../functional-dod-project.mjs';
import { parseFunctionalDodKeys } from '../functional-dod-evidence.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import { completeGuardResult } from './evaluate.mjs';

export class NormalizationRefusalError extends Error {
  constructor(code, cause) {
    super(`${code}${cause ? `: ${cause.message ?? String(cause)}` : ''}`, { cause });
    this.name = 'NormalizationRefusalError';
    this.code = code;
  }
}

// Internal control-flow carrier: only a complete, fresh non-ready evaluation
// can abort a versioned attempt without being mislabeled as authority drift.
class NonReadyNormalization extends Error {
  constructor({ decision, body, persisted, warnings }) {
    super('normalization is not ready');
    this.name = 'NonReadyNormalization';
    Object.assign(this, { decision, body, persisted, warnings });
  }
}

function validateDecision(decision) {
  if (!completeGuardResult(decision)) {
    throw new NormalizationRefusalError('normalization-decision-invalid');
  }
  return decision;
}

function verifiedProjection(body, normalization, head, evaluatedAt) {
  const items = parseFunctionalDodKeys(body);
  for (const change of normalization.decisions) {
    const item = items.find(({ key }) => key === change.key);
    if (!item?.checked) return false;
    if (change.stamp) {
      const evidence = item.evidenceMarker;
      if (
        !evidence ||
        evidence.exit !== 0 ||
        evidence.sha !== head ||
        evidence.ts !== evaluatedAt
      ) {
        return false;
      }
    }
  }
  return true;
}

export async function persistReadyNormalizations(input = {}) {
  return withRevisionConsumer(
    {
      repository: input.repo,
      issue: input.issueNumber,
      activity: 'body-write',
      backend: input.deps?.revisionBackend,
      projectDir: input.projectDir,
    },
    () => persistReadyNormalizationsAdmitted(input)
  );
}

async function persistReadyNormalizationsAdmitted({
  issueNumber,
  repo,
  head,
  evaluatedAt,
  refreshAndEvaluate,
  mutateBody = mutateIssueBody,
  readBack,
  deps = {},
} = {}) {
  if (!Number.isInteger(Number(issueNumber)) || !repo) {
    throw new TypeError('persistReadyNormalizations: issueNumber and repo are required');
  }
  if (typeof head !== 'string' || !/^[0-9a-f]{7,40}$/i.test(head)) {
    throw new TypeError('persistReadyNormalizations: execution head is required');
  }
  if (typeof evaluatedAt !== 'string' || !evaluatedAt) {
    throw new TypeError('persistReadyNormalizations: execution timestamp is required');
  }
  if (typeof refreshAndEvaluate !== 'function' || typeof readBack !== 'function') {
    throw new TypeError('persistReadyNormalizations: fresh evaluation and readback are required');
  }
  const evaluateCurrent = async ({ body, projection }) => {
    try {
      return validateDecision(await refreshAndEvaluate({ body, projection, head, evaluatedAt }));
    } catch (cause) {
      if (cause instanceof RevisionPolicyError) throw cause;
      if (cause instanceof NormalizationRefusalError) throw cause;
      throw new NormalizationRefusalError('normalization-authority-drift', cause);
    }
  };

  let initial;
  try {
    initial = await readBack();
  } catch (cause) {
    if (cause instanceof RevisionPolicyError) throw cause;
    throw new NormalizationRefusalError('normalization-readback-failed', cause);
  }
  if (typeof initial?.body !== 'string' || initial.body.length === 0) {
    throw new NormalizationRefusalError('normalization-readback-failed');
  }
  if (initial.head !== head) {
    throw new NormalizationRefusalError('normalization-authority-drift');
  }
  const initialProjection = projectFunctionalDod({ body: initial.body, head, evaluatedAt });
  let decision = await evaluateCurrent({
    body: initial.body,
    projection: initialProjection,
  });
  if (decision.status !== 'ready' || !initialProjection.normalization) {
    return { decision, persisted: false, warnings: [], body: initial.body };
  }

  let writeProjection;
  let write;
  try {
    write = await mutateBody({
      issueNumber,
      repo,
      deps,
      evidenceStamp: true,
      // The versioned writer invokes this on its fresh base. A conflict cannot
      // replay explanation-time bytes: every callback must re-evaluate.
      mutate: (base) => {
        const projection = projectFunctionalDod({ body: base, head, evaluatedAt });
        writeProjection = projection;
        return projection.body;
      },
      validateFreshBaseAsync: async (base, next) => {
        // A body-version retry may outlive the checkout captured at entry.
        // Recheck the execution HEAD immediately before each attempted push.
        let current;
        try {
          current = await readBack();
        } catch (cause) {
          if (cause instanceof RevisionPolicyError) throw cause;
          throw new NormalizationRefusalError('normalization-authority-drift', cause);
        }
        if (current?.head !== head) {
          throw new NormalizationRefusalError('normalization-authority-drift');
        }
        const projection = projectFunctionalDod({ body: base, head, evaluatedAt });
        if (next !== projection.body) {
          throw new NormalizationRefusalError('normalization-authority-drift');
        }
        const freshDecision = await evaluateCurrent({ body: base, projection });
        if (freshDecision.status !== 'ready') {
          throw new NonReadyNormalization({
            decision: freshDecision,
            body: base,
            persisted: false,
            warnings: [],
          });
        }
        writeProjection = projection;
      },
    });
  } catch (cause) {
    if (cause instanceof RevisionPolicyError) throw cause;
    if (cause instanceof NonReadyNormalization) {
      return {
        decision: cause.decision,
        body: cause.body,
        persisted: cause.persisted,
        warnings: cause.warnings,
      };
    }
    if (cause instanceof NormalizationRefusalError) throw cause;
    throw new NormalizationRefusalError('normalization-persist-failed', cause);
  }

  let observed;
  try {
    observed = await readBack();
  } catch (cause) {
    if (cause instanceof RevisionPolicyError) throw cause;
    throw new NormalizationRefusalError('normalization-readback-failed', cause);
  }
  if (typeof observed?.body !== 'string' || observed.body.length === 0) {
    throw new NormalizationRefusalError('normalization-readback-failed');
  }
  if (observed.head !== head) {
    throw new NormalizationRefusalError('normalization-authority-drift');
  }
  const effective = writeProjection?.normalization;
  if (effective && !verifiedProjection(observed.body, effective, head, evaluatedAt)) {
    throw new NormalizationRefusalError('normalization-authority-drift');
  }
  const remaining = projectFunctionalDod({ body: observed.body, head, evaluatedAt });
  if (remaining.normalization) {
    throw new NormalizationRefusalError('normalization-authority-drift');
  }
  decision = await evaluateCurrent({ body: observed.body, projection: remaining });
  return { decision, persisted: write?.status === 'ok', warnings: [], body: observed.body };
}
