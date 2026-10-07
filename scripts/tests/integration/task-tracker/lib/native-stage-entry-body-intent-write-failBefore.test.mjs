// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase("entry-body-prefix", import.meta.url, {"when": "failBefore", "suffix": "intent-write"});
