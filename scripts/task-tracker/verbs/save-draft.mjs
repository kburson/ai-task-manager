// `save-draft` verb (#576) — incremental autosave of the in-progress discovery
// brainstorm to a tracked draft at `docs/plans/.drafts/<slug>.md`.
//
// Companion to `save-plan`. `save-plan` finalizes the bucket to a date-stamped
// `docs/plans/YYYYMMDD-<slug>.md`; `save-draft` flushes the CURRENT, not-yet-
// finalized bucket to a tracked, slug-keyed draft that is overwritten on every
// call. It is safe (and intended) to call repeatedly as the discovery
// accumulates — each call refreshes the same file, closing the cross-machine
// loss window for a not-yet-finalized brainstorm.
//
// The resolved slug is stamped into `discoverBucket.draftSlug` so the later
// `save-plan` finalize can clear exactly the draft this verb wrote.

import { loadState, saveState } from '../state.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveDraftSlug, saveDraftFile } from '../lib/draft-file.mjs';

export async function verbSaveDraft(ctx) {
  const { statePath, projectDir, rest } = ctx;

  const s = loadState(statePath);
  if (s.active !== 'discover' || !s.discoverBucket) {
    process.stderr.write(
      'save-draft: no-active-discover-bucket\n' +
        '  Start a discovery session first: `/task discover`\n'
    );
    process.exit(1);
  }

  let fromFile = null;
  let slugArg = null;
  let titleArg = null;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--from-file' && rest[i + 1]) {
      fromFile = path.resolve(projectDir, rest[i + 1]);
      i += 1;
    } else if (rest[i] === '--slug' && rest[i + 1]) {
      slugArg = rest[i + 1];
      i += 1;
    } else if (rest[i] === '--title' && rest[i + 1]) {
      titleArg = rest[i + 1];
      i += 1;
    }
  }

  if (!fromFile) {
    process.stderr.write(
      'save-draft: --from-file <path> is required\n' +
        '  Write your in-progress brainstorm to a file in .tmp/plan/, then autosave it:\n' +
        '  `/task save-draft --from-file .tmp/plan/<draft>.md`\n'
    );
    process.exit(1);
  }

  let content;
  try {
    content = readFileSync(fromFile, 'utf8');
  } catch (err) {
    process.stderr.write(`save-draft: cannot read --from-file: ${err.message}\n`);
    process.exit(1);
  }

  // Resolve the slug once, then keep reusing the one stamped into the bucket so
  // repeated autosaves overwrite the same file rather than fanning out.
  const slug = resolveDraftSlug({
    slug: slugArg || s.discoverBucket.draftSlug,
    title: titleArg,
    content,
    startedAt: s.discoverBucket.startedAt,
  });

  const savedPath = saveDraftFile({ projectDir, slug, content });

  saveState(
    {
      ...s,
      discoverBucket: {
        ...s.discoverBucket,
        draftSlug: slug,
        draftFile: savedPath,
      },
    },
    statePath
  );

  console.log(savedPath);
}
