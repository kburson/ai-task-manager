// @story #1859
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stampEntryMarker } from '../../task-tracker/lib/stage-entry-markers.mjs';

export function withReviewEntryHistory(body, evidenceMarker) {
  if (!body.includes(evidenceMarker)) return body;
  return ['backlog', 'refine', 'plan', 'develop', 'test'].reduce(
    (current, stage) => stampEntryMarker(current, stage, '2026-05-10T00:00:00.000Z'),
    body
  );
}

export function writeReviewConfig(sandbox, { developOption, reviewOption }) {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test',
        kanbanFieldId: 'PVTF_x',
        kanbanOptionBacklog: 'OPT_backlog',
        kanbanOptionRefine: 'OPT_groom',
        kanbanOptionPlan: 'OPT_analyze',
        kanbanOptionDevelop: developOption,
        kanbanOptionTest: 'OPT_validate',
        kanbanOptionReview: reviewOption,
        kanbanOptionDone: 'OPT_done',
        gateReviewToDone: true,
        fieldDisposition: 'F_disposition',
        preferences: { gateAssigneeMatch: false },
      },
      null,
      2
    )
  );
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });
}
