import { computeDoseUg, getMaskFactor } from '../server/core/exposure';

export function runExposureTests() {
  console.log('Running Exposure Tests...');

  // 15 minutes of 100 ug/m3 PM2.5 at 20 L/min (walking)
  // Vol in m3 = (20 / 1000) * 15 = 0.3 m3
  // Dose = 100 * 0.3 = 30 ug
  const dose15mWalk = computeDoseUg([100.0], 'walking', false);
  if (dose15mWalk !== 30.0) {
    throw new Error(`Expected dose15mWalk to be 30.0, got ${dose15mWalk}`);
  }

  // 30 minutes (two 15-min steps) of 100 ug/m3 at 20 L/min: dose should double to 60 ug
  const dose30mWalk = computeDoseUg([100.0, 100.0], 'walking', false);
  if (dose30mWalk !== 60.0) {
    throw new Error(`Expected dose30mWalk to be 60.0, got ${dose30mWalk}`);
  }
  if (dose30mWalk !== 2 * dose15mWalk) {
    throw new Error(`Expected dose30mWalk to be 2 * dose15mWalk`);
  }

  // Running breathing rate is 40 L/min (2x walking)
  const dose15mRun = computeDoseUg([100.0], 'running', false);
  if (dose15mRun !== 60.0) {
    throw new Error(`Expected dose15mRun to be 60.0, got ${dose15mRun}`);
  }
  if (dose15mRun !== 2 * dose15mWalk) {
    throw new Error(`Expected dose15mRun to be 2 * dose15mWalk`);
  }

  // Mask lowers dose
  const pm25Series = [100.0, 100.0];
  const doseUnmasked = computeDoseUg(pm25Series, 'running', false);
  const doseMasked = computeDoseUg(pm25Series, 'running', true);
  const maskFactor = getMaskFactor();

  if (!(maskFactor < 1.0)) {
    throw new Error(`Expected maskFactor < 1.0`);
  }
  if (!(doseMasked < doseUnmasked)) {
    throw new Error(`Expected doseMasked < doseUnmasked`);
  }
  if (Math.round(doseMasked * 10) / 10 !== Math.round(doseUnmasked * maskFactor * 10) / 10) {
    throw new Error(`Expected doseMasked to match doseUnmasked * maskFactor`);
  }

  console.log('✓ Exposure Tests Passed');
}
