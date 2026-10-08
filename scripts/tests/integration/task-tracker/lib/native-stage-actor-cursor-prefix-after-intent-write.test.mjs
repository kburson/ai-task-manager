// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('actor-cursor-prefix', import.meta.url, {
  when: 'failAfter',
  suffix: 'intent-write',
});
