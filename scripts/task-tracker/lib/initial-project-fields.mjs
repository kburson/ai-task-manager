// @story #1988 — initial values copy existing issue-body facts, never admission.
import { withIssueLock, currentIssueLockOwner } from '../issue-mutator-lock.mjs';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import { getProjectDir } from '../paths.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { projectValuesForIssue, gh } from '../../gh/lib/github-projects.mjs';
import { ceilEstimateHours } from './estimation/estimate-granularity.mjs';
import { readDecompositionRecords } from './decomposition-records.mjs';
export async function withInitialProjectFields(
  { cfg, issueNumber, estimate, size, status, deps = {} },
  operation
) {
  const projectDir = deps.projectDir ?? getProjectDir(),
    main = (deps.decomposition?.findMainWorktreePath ?? findMainWorktreePath)(projectDir);
  const readBody = async () => {
    const value = deps.fetchIssueBody
      ? await deps.fetchIssueBody({ cfg, issueNumber })
      : JSON.parse(
          await gh(['issue', 'view', String(issueNumber), '--repo', cfg.repo, '--json', 'body'])
        );
    return typeof value === 'string' ? value : value.body;
  };
  return withIssueLock(
    { issue: issueNumber, verb: 'initial-project-fields', projDir: main },
    async () => {
      if (!currentIssueLockOwner(issueNumber))
        throw new Error('initial-project-fields:in-process-owner-required');
      const before = await readBody(),
        parsed = parseIssueFieldDb(before);
      readDecompositionRecords(before);
      if (!parsed.ok) throw new Error('initial-project-fields:body-fields');
      const wanted = { estimate: parsed.values.estimate ?? null, size: parsed.values.size ?? null };
      if (
        (estimate !== undefined && ceilEstimateHours(Number(estimate)) !== wanted.estimate) ||
        (size !== undefined && String(size).toUpperCase() !== wanted.size)
      )
        throw new Error('initial-project-fields:requested-revision');
      const state = readLastKnownState(before).state;
      if (state && status && String(status).toLowerCase() !== state)
        throw new Error('initial-project-fields:state-revision');
      const readFields = () =>
        (deps.projectValuesForIssue ?? projectValuesForIssue)({
          cfg,
          issueNumber,
          fieldDefs: (deps.loadProjectFieldDefs ?? loadProjectFieldDefs)(),
        });
      const assert = async (itemId) => {
        if (!currentIssueLockOwner(issueNumber))
          throw new Error('initial-project-fields:in-process-owner-required');
        const current = parseIssueFieldDb(await readBody());
        if (
          !current.ok ||
          ['estimate', 'size'].some((key) => (current.values[key] ?? null) !== wanted[key])
        )
          throw new Error('initial-project-fields:body-drift');
        if (itemId) {
          const fields = await readFields();
          if (
            ['estimate', 'size'].some((key) => fields[key] != null && fields[key] !== wanted[key])
          )
            throw new Error('initial-project-fields:existing-revision');
        }
      };
      const result = await operation(Object.freeze({ ...wanted, assert }));
      await assert(result.itemId);
      const actual = await readFields();
      if (['estimate', 'size'].some((key) => (actual[key] ?? null) !== wanted[key]))
        throw new Error('initial-project-fields:unconfirmed');
      return result;
    }
  );
}
