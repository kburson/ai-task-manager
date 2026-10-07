// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('status-source-prefix', import.meta.url, {"when":"failAfter","suffix":"readback"});
