// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('board-exception-prefix', import.meta.url, {
  when: 'failBefore',
  suffix: 'outcome-readback',
});
