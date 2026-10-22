// @story #2039 #2063
// Synthetic retained inputs for Task 18 publication integration; no cloud hydration.
import { bundle } from './local-estimation-evidence-fixture.mjs';
import { calculateLocalEstimate } from '../../task-tracker/lib/estimation/local-runtime.mjs';

export function retainedPlanCalculation({ repository, issue, rubricIssue, rubric, refine, input }) {
  const evidence = bundle([{ record: rubric, provenance: 'imported-local' }], {
    repository,
    issue,
    configuration: { estimationRubricIssue: rubricIssue },
    refine: {
      ...refine,
      source: { kind: 'imported-local', id: 'refine-fixture', digest: 'b'.repeat(64) },
    },
    modelPolicy: {
      modelVersion: 'aitm.forecast-model/v2',
      policyVersion: 'aitm.local-estimation/v1',
    },
  });
  const {
    schema: _schema,
    canonicalizationVersion: _canonical,
    inputs: _inputs,
    ...selection
  } = evidence.manifest;
  return calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
  });
}
