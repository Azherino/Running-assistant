import {
  equivalentTimeS,
  percentVo2Max,
  velocityAtVo2,
  vdotFromPerformance,
  vdotRequiredFor,
  vo2AtVelocity,
} from '../vdot';

describe('VDOT', () => {
  it('matches Daniels reference performances', () => {
    expect(vdotFromPerformance(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(vdotFromPerformance(5000, 25 * 60)).toBeCloseTo(38.3, 0);
    expect(vdotFromPerformance(10000, 40 * 60)).toBeCloseTo(51.9, 0);
    expect(vdotFromPerformance(42195, 3 * 60 * 60)).toBeCloseTo(53.5, 0);
  });

  it('round-trips a performance through the pace model', () => {
    const vdot = vdotFromPerformance(10000, 45 * 60);
    const back = equivalentTimeS(vdot, 10000);
    expect(back).toBeCloseTo(45 * 60, 0);
  });

  it('gets slower as the result gets slower', () => {
    expect(vdotFromPerformance(10000, 2400)).toBeGreaterThan(vdotFromPerformance(10000, 2700));
  });

  it('inverts the oxygen cost curve', () => {
    expect(velocityAtVo2(vo2AtVelocity(200))).toBeCloseTo(200, 6);
  });

  it('bounds the sustainable fraction between 0.8 and 1', () => {
    expect(percentVo2Max(10)).toBeLessThan(1.02);
    expect(percentVo2Max(10)).toBeGreaterThan(0.95);
    expect(percentVo2Max(180)).toBeGreaterThan(0.79);
    expect(percentVo2Max(180)).toBeLessThan(0.83);
  });

  it('reports the VDOT a goal time requires', () => {
    const required = vdotRequiredFor(10000, 40 * 60);
    expect(required).toBeGreaterThan(51);
    expect(required).toBeLessThan(53);
  });

  it('rejects nonsense input', () => {
    expect(() => vdotFromPerformance(100, 600)).toThrow();
    expect(() => vdotFromPerformance(5000, 5)).toThrow();
  });
});
