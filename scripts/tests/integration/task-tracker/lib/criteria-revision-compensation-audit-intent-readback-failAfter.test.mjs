// @story #1916
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('compensation-audit', import.meta.url, {
  when: 'failAfter',
  suffix: 'audit-intent-readback',
});
