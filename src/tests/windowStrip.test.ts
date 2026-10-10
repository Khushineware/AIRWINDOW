import { parseMinutesFromTimeOrIso, computeTimelinePercent } from '../components/WindowStrip';

// Self-contained test harness for unit-testing time formatting and strip positioning
function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but received ${actual}`);
      }
    },
  };
}

function describe(suiteName: string, fn: () => void) {
  fn();
}

function it(testName: string, fn: () => void) {
  fn();
}

describe('WindowStrip Timeline Calculations', () => {
  it('parses standard HH:MM time strings into total minutes', () => {
    expect(parseMinutesFromTimeOrIso('05:00')).toBe(300);
    expect(parseMinutesFromTimeOrIso('13:30')).toBe(810);
    expect(parseMinutesFromTimeOrIso('20:00')).toBe(1200);
  });

  it('parses ISO 8601 strings into total minutes', () => {
    expect(parseMinutesFromTimeOrIso('2026-10-09T05:00:00')).toBe(300);
    expect(parseMinutesFromTimeOrIso('2026-10-09T14:15:00Z')).toBe(855);
  });

  it('computes timeline percentage across 05:00 to 20:00 span', () => {
    // 05:00 = 300 min -> 0%
    expect(computeTimelinePercent(300)).toBe(0);

    // 20:00 = 1200 min -> 100%
    expect(computeTimelinePercent(1200)).toBe(100);

    // 12:30 = 750 min -> mid point (750 - 300)/900 = 450/900 = 50%
    expect(computeTimelinePercent(750)).toBe(50);
  });

  it('clamps times before 05:00 and after 20:00', () => {
    expect(computeTimelinePercent(200)).toBe(0);
    expect(computeTimelinePercent(1300)).toBe(100);
  });
});
