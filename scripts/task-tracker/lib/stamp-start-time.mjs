// Stamps the "Start time" TEXT field on the project board (#147).
//
// Called from `verbPromote` on the backlog→refine success path, before the
// refine→plan gate runs. Idempotent: if Start time is already set, the helper
// is a no-op. The value is the current ISO timestamp by default.
//
// Pure-ish: I/O injectable via deps for tests.

import { splitRepo, gql, writeProjectFieldValue } from '../../gh/lib/github-projects.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { warnMissingFieldId } from './field-config-warn.mjs';

// Exported for unit coverage: the GraphQL I/O seams (`gql` / `splitRepo`) are
// injectable via `deps` so the query-build + project-item filtering can be
// tested without a live call. The real CLI path passes `deps = {}`, so the
// injected fns default to the imported ones — behaviour is identical.
export async function defaultResolveItem({ cfg, issueNumber, deps = {} }) {
  const gqlFn = deps.gql || gql;
  const splitRepoFn = deps.splitRepo || splitRepo;
  const { owner, repoName } = splitRepoFn(cfg.repo);
  const data = await gqlFn(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 20) {
            nodes {
              id
              project { id }
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const items = data?.repository?.issue?.projectItems?.nodes ?? [];
  return items.find((n) => n.project?.id === cfg.projectId) ?? null;
}

function formatStartTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const ah = pad(Math.floor(Math.abs(offsetMin) / 60));
  const am = pad(Math.abs(offsetMin) % 60);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} ${sign}${ah}${am}`;
}

export async function stampStartTime({ cfg, issueNumber, now = () => new Date(), deps = {} } = {}) {
  if (!cfg) throw new Error('stampStartTime: cfg is required');
  if (!issueNumber) throw new Error('stampStartTime: issueNumber is required');
  const startTimeFieldId = cfg.fieldStartTime || fieldIdFor(cfg, 'startTime');
  if (!startTimeFieldId) {
    warnMissingFieldId({ cfgKey: 'fieldStartTime', context: 'board stamp skipped' });
    return { status: 'skipped', reason: 'no-field-configured' };
  }
  const resolveItem = deps.resolveItem || defaultResolveItem;
  const writeField = deps.writeProjectFieldValue || writeProjectFieldValue;

  let item;
  try {
    item = await resolveItem({ cfg, issueNumber, deps });
  } catch (err) {
    return { status: 'error', message: `stamp-start-time: resolve failed: ${err.message}` };
  }
  if (!item) return { status: 'skipped', reason: 'no-project-item' };

  const existing = (item.fieldValues?.nodes || []).find(
    (n) => n?.field?.id === startTimeFieldId && n.text
  );
  if (existing && existing.text && String(existing.text).trim() !== '') {
    return { status: 'idempotent', value: existing.text };
  }

  const stamp = formatStartTime(now());
  try {
    await writeField({
      projectId: cfg.projectId,
      itemId: item.id,
      fieldId: startTimeFieldId,
      value: { text: stamp },
    });
  } catch (err) {
    return { status: 'error', message: `stamp-start-time: write failed: ${err.message}` };
  }
  return { status: 'stamped', value: stamp };
}
