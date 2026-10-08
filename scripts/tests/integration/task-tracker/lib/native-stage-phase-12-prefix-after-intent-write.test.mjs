// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('phase-12-prefix', import.meta.url, {
  when: 'failAfter',
  suffix: 'intent-write',
});
