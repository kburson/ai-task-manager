// @story #1732
// Execution-only Functional DoD persistence. A projection is never write authority.

import { projectFunctionalDod } from '../functional-dod-project.mjs';
import { parseFunctionalDodKeys } from '../functional-dod-evidence.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';

export class NormalizationRefusalError extends Error {
  constructor(code, cause) {
    super(`${code}${cause ? `: ${cause.message ?? String(cause)}` : ''}`, { cause });
    this.name = 'NormalizationRefusalError';
    this.code = code;
  }
}

function requireReady(decision) {
  if (
    !decision ||
    decision.status !== 'ready' ||
    decision.ok !== true ||
    !Array.isArray(decision.refusals) ||
    decision.refusals.length !== 0 ||
    !Object.hasOwn(decision, 'humanDecision')
  ) {
    throw new NormalizationRefusalError('normalization-authority-drift');
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

export async function persistReadyNormalizations({
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
      return await refreshAndEvaluate({ body, projection, head, evaluatedAt });
    } catch (cause) {
      if (cause instanceof NormalizationRefusalError) throw cause;
      throw new NormalizationRefusalError('normalization-authority-drift', cause);
    }
  };

  let initial;
  try {
    initial = await readBack();
  } catch (cause) {
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
  if (!initialProjection.normalization) {
    return { decision, persisted: false, warnings: [], body: initial.body };
  }
  decision = requireReady(decision);

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
          throw new NormalizationRefusalError('normalization-authority-drift', cause);
        }
        if (current?.head !== head) {
          throw new NormalizationRefusalError('normalization-authority-drift');
        }
        const projection = projectFunctionalDod({ body: base, head, evaluatedAt });
        requireReady(await evaluateCurrent({ body: base, projection }));
        if (next !== projection.body) {
          throw new NormalizationRefusalError('normalization-authority-drift');
        }
        writeProjection = projection;
      },
    });
  } catch (cause) {
    if (cause instanceof NormalizationRefusalError) throw cause;
    throw new NormalizationRefusalError('normalization-persist-failed', cause);
  }

  let observed;
  try {
    observed = await readBack();
  } catch (cause) {
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
  decision = requireReady(await evaluateCurrent({ body: observed.body, projection: remaining }));
  if (remaining.normalization) {
    throw new NormalizationRefusalError('normalization-authority-drift');
  }
  return { decision, persisted: write?.status === 'ok', warnings: [], body: observed.body };
}
