// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('phase-12-prefix', import.meta.url, {
  when: 'failBefore',
  suffix: 'intent-write',
});
