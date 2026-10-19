// @story #1915 #1918
import test from 'node:test';
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
import { reportingPartition } from '../../../helpers/criteria-revision-reporting-partition.mjs';

const { a } = reportingPartition(discoverOriginalCases());
test(
  'complete original reporting group A retains genuine native assertions',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(a, t)
);
