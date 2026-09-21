// @story #1731
// Read-only counterpart of the legacy acs-then-checkboxes Functional DoD pass.

import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { locateHousekeepingSection, locateLifecycleSection } from './lifecycle-dod.mjs';
import {
  deriveAcsStatus,
  deriveCheckboxesStatus,
  parseFunctionalDodKeys,
  stampEvidenceMarker,
} from './functional-dod-evidence.mjs';

const NORMALIZER_ID = 'functional-dod-derived/v1';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function projectFunctionalDod({ body, head, evaluatedAt } = {}) {
  if (typeof body !== 'string') throw new TypeError('projectFunctionalDod: body is required');
  if (typeof head !== 'string' || head.length === 0) {
    throw new TypeError('projectFunctionalDod: head is required');
  }
  if (typeof evaluatedAt !== 'string' || evaluatedAt.length === 0) {
    throw new TypeError('projectFunctionalDod: evaluatedAt is required');
  }

  const items = parseFunctionalDodKeys(body);
  const acsItem = items.find((item) => item.key === 'acs');
  const cbItem = items.find((item) => item.key === 'checkboxes');
  const decisions = [];
  let next = body;

  if (acsItem) {
    const acs = deriveAcsStatus(next);
    if (acs.allTicked) {
      const stamp = !acsItem.evidenceMarker;
      const tick = !acsItem.checked;
      if (stamp) {
        next = stampEvidenceMarker(next, 'acs', {
          cmd: 'derive:all-acceptance-criteria-ticked',
          sha: head,
          ts: evaluatedAt,
          exit: 0,
        });
      }
      if (tick) next = next.replace(/^(- \[) (\]\s+Acceptance criteria met\b)/m, '$1x$2');
      if (stamp || tick) {
        decisions.push({ key: 'acs', derivationRule: 'derive-acs/v1', stamp, tick });
      }
    }
  }

  if (cbItem) {
    const lifecyclePresent = Boolean(
      locateLifecycleSection(next) || locateHousekeepingSection(next)
    );
    const checkboxes = deriveCheckboxesStatus(next, { lifecyclePresent });
    if (checkboxes.allTicked) {
      const stamp = !cbItem.evidenceMarker;
      const tick = !cbItem.checked;
      if (stamp) {
        next = stampEvidenceMarker(next, 'checkboxes', {
          cmd: 'derive:all-non-self-non-lifecycle-checkboxes-ticked',
          sha: head,
          ts: evaluatedAt,
          exit: 0,
        });
      }
      if (tick) next = next.replace(/^(- \[) (\]\s+Issue body checkboxes ticked\b)/m, '$1x$2');
      if (stamp || tick) {
        decisions.push({ key: 'checkboxes', derivationRule: 'derive-checkboxes/v1', stamp, tick });
      }
    }
  }

  return {
    body: next,
    normalization:
      decisions.length === 0
        ? null
        : {
            normalizerId: NORMALIZER_ID,
            inputDigest: digest(body.replace(/\r\n?/g, '\n')),
            decisions,
            decisionDigest: digest(canonicalRecordJson({ normalizerId: NORMALIZER_ID, decisions })),
            disposition: 'persist-on-execute',
          },
  };
}
