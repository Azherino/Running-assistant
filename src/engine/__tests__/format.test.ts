import { describeStep, describeWorkout, formatMinutes } from '../format';
import { buildPaceZones } from '../paces';
import { easyRun, raceDay } from '../plan/sessions';
import { vdotFromPerformance } from '../vdot';

const paces = buildPaceZones(vdotFromPerformance(10000, 45 * 60));

describe('workout formatting', () => {
  it('keeps decimals that matter on race distances', () => {
    const half = raceDay(21.0975, paces, 100 * 60);
    expect(describeStep(half.steps[0]!)).toContain('21.1 km');
    expect(half.title).toBe('Race day: Half marathon');
    expect(half.note).toContain('1:40:00');
  });

  it('renders strides in seconds, not as 0:20', () => {
    const easy = easyRun(6, paces, true);
    expect(easy.title).toBe('Easy run + strides');
    const strides = easy.steps.find((step) => step.kind === 'strides');
    expect(strides).toBeDefined();
    expect(describeStep(strides!)).toContain('4 x 20 s');
    expect(easy.targetDistanceM).toBeCloseTo(6000, -2);
  });

  it('marks strides as part of the overall session duration', () => {
    const plain = easyRun(6, paces);
    const withStrides = easyRun(6, paces, true);
    expect(plain.targetDistanceM).toBe(6000);
    expect(Math.abs(withStrides.targetDistanceM - 6000)).toBeLessThan(50);
    expect(describeWorkout(withStrides)[0]).toContain('Easy running');
  });

  it('formats totals for the UI', () => {
    expect(formatMinutes(52 * 60)).toBe('52 min');
    expect(formatMinutes(72 * 60)).toBe('1 h 12 min');
    expect(formatMinutes(2 * 3600)).toBe('2 h');
  });
});
