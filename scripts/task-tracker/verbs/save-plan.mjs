import { loadState, saveState } from '../state.mjs';
import { savePlanFile, validatePlanContent, extractTitle } from '../lib/plan-file.mjs';
import { clearDraftFile, resolveDraftSlug } from '../lib/draft-file.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export async function verbSavePlan(ctx) {
  const { statePath, projectDir, rest } = ctx;

  const s = loadState(statePath);
  if (s.active !== 'discover' || !s.discoverBucket) {
    process.stderr.write(
      'save-plan: no-active-discover-bucket\n' +
        '  Start a discovery session first: `/task discover`\n'
    );
    process.exit(1);
  }

  // Parse --from-file and --title from rest args
  let fromFile = null;
  let titleOverride = null;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--from-file' && rest[i + 1]) {
      fromFile = path.resolve(projectDir, rest[i + 1]);
      i += 1;
    } else if (rest[i] === '--title' && rest[i + 1]) {
      titleOverride = rest[i + 1];
      i += 1;
    }
  }

  let content;
  if (fromFile) {
    try {
      content = readFileSync(fromFile, 'utf8');
    } catch (err) {
      process.stderr.write(`save-plan: cannot read --from-file: ${err.message}\n`);
      process.exit(1);
    }
  } else {
    // No --from-file: require it (the AI must compose the plan before calling save-plan)
    process.stderr.write(
      'save-plan: --from-file <path> is required\n' +
        '  Compose your discovery plan to a file in .scratch/plan/, then pass it here:\n' +
        '  `/task save-plan --from-file .scratch/plan/<draft>.md`\n'
    );
    process.exit(1);
  }

  const validation = validatePlanContent(content);
  if (!validation.ok) {
    process.stderr.write(`save-plan: invalid plan file — ${validation.reason}\n`);
    process.exit(1);
  }

  const title =
    titleOverride ||
    extractTitle(content) ||
    `discover-${s.discoverBucket.startedAt.slice(0, 10).replace(/-/g, '')}`;
  const savedPath = savePlanFile({ title, content, projectDir });

  // AC4 (#576) — finalizing clears the matching interim draft. The draft is
  // insurance for the not-yet-finalized bucket; once a finalized plan exists it
  // is redundant and would only linger as version-control noise. Best-effort:
  // a missing draft is a no-op, so the finalize path above is unchanged. Prefer
  // the slug `save-draft` stamped into the bucket; fall back to the finalized
  // title's slug so a draft autosaved under the same title is still cleared.
  const draftSlug = resolveDraftSlug({
    slug: s.discoverBucket.draftSlug,
    title,
    startedAt: s.discoverBucket.startedAt,
  });
  clearDraftFile({ projectDir, slug: draftSlug });

  // Stamp savedPlanFile into the bucket so /task new can find it
  saveState(
    {
      ...s,
      discoverBucket: {
        ...s.discoverBucket,
        savedPlanFile: savedPath,
        draftSlug: null,
        draftFile: null,
      },
    },
    statePath
  );

  console.log(savedPath);
}
