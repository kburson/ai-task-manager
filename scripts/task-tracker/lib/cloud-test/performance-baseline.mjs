import { createHash } from 'node:crypto';

const LANES = Object.freeze(['unit', 'integration', 'slow']);
const SHA_RE = /^[0-9a-f]{40,64}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`cloud-test-baseline: ${message}`);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function sortedUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => !String(value || '').trim())) {
    fail(`${label} must be a non-empty path array`);
  }
  const sorted = values.map(String).sort();
  if (new Set(sorted).size !== sorted.length) fail(`${label} contains duplicates`);
  return sorted;
}

function sameList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateProfile(profile, lane) {
  if (
    !profile ||
    !String(profile.label || '').trim() ||
    !String(profile.platform || '').trim() ||
    !String(profile.arch || '').trim() ||
    !String(profile.nodeVersion || '').trim() ||
    !Number.isInteger(profile.logicalCpuCount) ||
    profile.logicalCpuCount <= 0
  ) {
    fail(`${lane} runner profile is incomplete`);
  }
  return canonicalValue(profile);
}

function validateArtifact({ artifact, lane, expectedHeadSha, discovered }) {
  if (!artifact || artifact.schema !== 5) fail(`${lane} artifact must use schema 5`);
  if (artifact.lane !== lane) fail(`${lane} lane does not match its artifact`);
  if (!Number.isFinite(Date.parse(artifact.generatedAt || ''))) {
    fail(`${lane} generated timestamp is missing or invalid`);
  }
  if (!String(artifact.command || '').trim()) fail(`${lane} command is missing`);
  if (artifact.commit !== expectedHeadSha) fail(`${lane} commit does not match measured head`);
  const runnerProfile = validateProfile(artifact.runnerProfile, lane);
  const inventory = sortedUniqueStrings(artifact.discoveryInventory, `${lane} discovery inventory`);
  if (!sameList(inventory, discovered)) {
    fail(`${lane} discovery inventory does not match the canonical lane`);
  }
  const files = artifact.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    fail(`${lane} files are missing`);
  }
  const filePaths = Object.keys(files).sort();
  if (!sameList(filePaths, discovered) || artifact.count !== discovered.length) {
    fail(`${lane} file count or measured files do not match discovery inventory`);
  }
  for (const file of filePaths) {
    const record = files[file];
    if (!record || !Number.isFinite(record.wallMs) || record.wallMs < 0) {
      fail(`${lane} ${file} wallMs must be finite and non-negative`);
    }
    if (record.inProcMs !== null && !Number.isFinite(record.inProcMs)) {
      fail(`${lane} ${file} inProcMs must be finite or null`);
    }
    if (record.status !== 0) fail(`${lane} ${file} did not pass`);
  }
  return { inventory, filePaths, runnerProfile };
}

export function calibrationInputSha256({
  discoveredByLane,
  testBlobIds,
  dependencyLockSha256,
} = {}) {
  if (!discoveredByLane || typeof discoveredByLane !== 'object') {
    fail('canonical lane discovery is required');
  }
  if (!testBlobIds || typeof testBlobIds !== 'object' || Array.isArray(testBlobIds)) {
    fail('test blob ids are required');
  }
  if (!DIGEST_RE.test(String(dependencyLockSha256 || ''))) {
    fail('dependency lock SHA-256 is invalid');
  }
  const lanes = {};
  const blobs = {};
  for (const lane of LANES) {
    lanes[lane] = sortedUniqueStrings(
      discoveredByLane[lane],
      `${lane} canonical discovery inventory`
    );
    for (const file of lanes[lane]) {
      const blobId = testBlobIds[file];
      if (!SHA_RE.test(String(blobId || ''))) fail(`blob id is missing or invalid for ${file}`);
      blobs[file] = blobId;
    }
  }
  const extraBlobs = Object.keys(testBlobIds).filter((file) => !Object.hasOwn(blobs, file));
  if (extraBlobs.length) fail(`unexpected blob id for ${extraBlobs.sort()[0]}`);
  return sha256({ lanes, blobs, dependencyLockSha256 });
}

export function normalizeCloudTestBaseline({
  artifacts,
  expectedHeadSha,
  calibrationInputSha256,
  discoveredByLane,
} = {}) {
  if (!SHA_RE.test(String(expectedHeadSha || ''))) fail('expected head SHA is invalid');
  if (!DIGEST_RE.test(String(calibrationInputSha256 || ''))) {
    fail('calibration input SHA-256 is invalid');
  }
  if (!artifacts || typeof artifacts !== 'object') fail('artifacts are required');
  if (!discoveredByLane || typeof discoveredByLane !== 'object') {
    fail('canonical lane discovery is required');
  }

  const lanes = {};
  const weights = {};
  let commonProfile = null;
  for (const lane of LANES) {
    const discovered = sortedUniqueStrings(
      discoveredByLane[lane],
      `${lane} canonical discovery inventory`
    );
    const artifact = artifacts[lane];
    const validated = validateArtifact({ artifact, lane, expectedHeadSha, discovered });
    if (commonProfile && sha256(commonProfile) !== sha256(validated.runnerProfile)) {
      fail(`${lane} runner profile differs from the other lanes`);
    }
    commonProfile ||= validated.runnerProfile;
    const sourceSha256 = sha256(artifact);
    lanes[lane] = {
      command: artifact.command,
      generatedAt: artifact.generatedAt,
      fileCount: discovered.length,
      discoveryInventory: discovered,
      sourceSha256,
    };
    for (const file of validated.filePaths) {
      const record = artifact.files[file];
      weights[file] = {
        lane,
        wallMs: record.wallMs,
        inProcMs: record.inProcMs,
        measurement: 'measured',
      };
    }
  }

  return {
    schema: 1,
    measuredCommit: expectedHeadSha,
    calibrationInputSha256,
    runnerProfile: commonProfile,
    lanes,
    weights: Object.fromEntries(Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function longestProcessingTimeMaximum(weights, width) {
  if (!Number.isInteger(width) || width <= 0) fail('width must be a positive integer');
  if (!Array.isArray(weights)) fail('weights must be an array');
  const seen = new Set();
  const ordered = weights
    .map(({ file, weightSeconds }) => {
      const normalizedFile = String(file || '');
      if (!normalizedFile) fail('every weight requires a file');
      if (seen.has(normalizedFile)) fail(`duplicate weight for ${normalizedFile}`);
      seen.add(normalizedFile);
      if (!Number.isFinite(weightSeconds) || weightSeconds < 0) {
        fail(`${normalizedFile} weight must be finite and non-negative`);
      }
      return { file: normalizedFile, weightSeconds };
    })
    .sort((a, b) => b.weightSeconds - a.weightSeconds || a.file.localeCompare(b.file));
  const loads = Array.from({ length: width }, () => 0);
  for (const entry of ordered) {
    let target = 0;
    for (let index = 1; index < loads.length; index += 1) {
      if (loads[index] < loads[target]) target = index;
    }
    loads[target] += entry.weightSeconds;
  }
  return Math.max(0, ...loads);
}

function validateCandidate(candidate, { width, phase }) {
  if (!candidate || candidate.passed !== true) return false;
  for (const key of ['repositorySeconds', 'totalSeconds', 'executionSeconds']) {
    if (!Number.isFinite(candidate[key]) || candidate[key] < 0) {
      fail(`width ${width} ${phase} ${key} is invalid`);
    }
  }
  return candidate.repositorySeconds <= 480 && candidate.totalSeconds <= 540;
}

export function selectCanarySlowWidth({ runs, expectedHeadSha, expectedBaseline } = {}) {
  if (!Array.isArray(runs) || runs.length !== 5) {
    fail('exactly five paired canary runs are required');
  }
  if (!SHA_RE.test(String(expectedHeadSha || ''))) fail('expected canary head SHA is invalid');
  if (
    !expectedBaseline ||
    !String(expectedBaseline.path || '').trim() ||
    !DIGEST_RE.test(String(expectedBaseline.sha256 || ''))
  ) {
    fail('expected source baseline is invalid');
  }

  let widthTwoAccepted = true;
  let widthThreeAccepted = true;
  for (const run of runs) {
    if (!run || run.status !== 'completed') fail('canary cohort is incomplete');
    if (run.headSha !== expectedHeadSha) fail('canary run head does not match the immutable head');
    if (
      run.sourceBaseline?.path !== expectedBaseline.path ||
      run.sourceBaseline?.sha256 !== expectedBaseline.sha256
    ) {
      fail('canary source baseline does not match');
    }
    if (run.partitionProof?.ok !== true) fail('exact-head partition proof is missing');
    if (run.unmeasuredFallbackFileCount !== 0 || run.unmeasuredFallbackWeightSeconds !== 0) {
      fail('calibration-incomplete: unmeasured fallback evidence is nonzero or missing');
    }
    if (run.qualityPassed !== true || run.fastShardsPassed !== true) {
      fail('canary calibration lanes did not pass');
    }
    const twoCold = validateCandidate(run.candidates?.[2]?.cold, { width: 2, phase: 'cold' });
    const twoWarm = validateCandidate(run.candidates?.[2]?.warm, { width: 2, phase: 'warm' });
    widthTwoAccepted &&= twoCold && twoWarm && run.candidates[2].warm.executionSeconds <= 408;
    widthThreeAccepted &&=
      validateCandidate(run.candidates?.[3]?.cold, { width: 3, phase: 'cold' }) &&
      validateCandidate(run.candidates?.[3]?.warm, { width: 3, phase: 'warm' });
  }
  if (widthTwoAccepted) return 2;
  if (widthThreeAccepted) return 3;
  fail('no canary Slow width satisfies the required limits');
}

export function nearestRankP95(samples) {
  if (!Array.isArray(samples) || samples.length < 20) {
    fail('nearest-rank p95 requires at least 20 cycle-eligible samples');
  }
  const sorted = samples.map(Number).sort((a, b) => a - b);
  if (sorted.some((value) => !Number.isFinite(value) || value < 0)) {
    fail('p95 samples must be finite and non-negative');
  }
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

export function validationCapacity({ totalSlots, heavyJobsPerValidation, reserveSlots = 4 } = {}) {
  for (const [name, value] of Object.entries({
    totalSlots,
    heavyJobsPerValidation,
    reserveSlots,
  })) {
    if (!Number.isInteger(value) || value < (name === 'reserveSlots' ? 0 : 1)) {
      fail(`${name} must be ${name === 'reserveSlots' ? 'a non-negative' : 'a positive'} integer`);
    }
  }
  return Math.max(0, Math.floor((totalSlots - reserveSlots) / heavyJobsPerValidation));
}

export function requiredSlotsForValidations({
  validations,
  heavyJobsPerValidation,
  reserveSlots = 4,
} = {}) {
  for (const [name, value] of Object.entries({
    validations,
    heavyJobsPerValidation,
    reserveSlots,
  })) {
    if (!Number.isInteger(value) || value < (name === 'reserveSlots' ? 0 : 1)) {
      fail(`${name} must be ${name === 'reserveSlots' ? 'a non-negative' : 'a positive'} integer`);
    }
  }
  return reserveSlots + validations * heavyJobsPerValidation;
}
