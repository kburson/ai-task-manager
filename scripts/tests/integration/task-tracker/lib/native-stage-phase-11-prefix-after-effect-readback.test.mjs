// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('phase-11-prefix', import.meta.url, {
  when: 'failAfter',
  suffix: 'effect-readback',
});
