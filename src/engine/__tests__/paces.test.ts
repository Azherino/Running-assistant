import {
  bandMidpoint,
  buildPaceZones,
  formatDuration,
  formatPace,
  paceSPerKm,
  racePaceForVdot,
  zoneBand,
} from '../paces';
import { vdotFromPerformance } from '../vdot';

const VDOT_5K_20 = vdotFromPerformance(5000, 20 * 60);
const paces = buildPaceZones(VDOT_5K_20);

describe('pace zones', () => {
  it('orders zones from easy to repetition', () => {
    const order = [
      paces.easy.maxSPerKm,
      bandMidpoint(paces.marathon),
      bandMidpoint(paces.threshold),
      bandMidpoint(paces.interval),
      bandMidpoint(paces.repetition),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeLessThan(order[i - 1] as number);
    }
  });

  it('treats easy as a range and the rest as narrow bands', () => {
    expect(paces.easy.maxSPerKm - paces.easy.minSPerKm).toBeGreaterThan(15);
    for (const zone of ['marathon', 'threshold', 'interval', 'repetition'] as const) {
      const band = zoneBand(paces, zone);
      expect(band.maxSPerKm - band.minSPerKm).toBeLessThanOrEqual(8);
      expect(band.minSPerKm).toBeLessThan(band.maxSPerKm);
    }
  });

  it('puts threshold near one-hour race effort for a 20:00 5K runner', () => {
    // Daniels: ~4:15/km for VDOT 49.8.
    expect(bandMidpoint(paces.threshold)).toBeGreaterThan(250);
    expect(bandMidpoint(paces.threshold)).toBeLessThan(262);
    // Classic 5K race pace is 4:00/km.
    expect(bandMidpoint(paces.interval)).toBeLessThan(240);
    expect(bandMidpoint(paces.interval)).toBeGreaterThan(225);
  });

  it('is internally consistent with the race model', () => {
    expect(racePaceForVdot(VDOT_5K_20, 5)).toBeCloseTo(240, 0);
    // Running at 100% of VDOT is slightly faster than 5K race pace.
    expect(paceSPerKm(VDOT_5K_20, 1)).toBeLessThan(240);
    expect(paceSPerKm(VDOT_5K_20, 1)).toBeGreaterThan(225);
  });

  it('formats pace and duration', () => {
    expect(formatPace(272)).toBe('4:32');
    expect(formatPace(305.6)).toBe('5:06');
    expect(formatDuration(1500)).toBe('25:00');
    expect(formatDuration(4025)).toBe('1:07:05');
  });

  it('gets faster as VDOT rises', () => {
    const fitter = buildPaceZones(VDOT_5K_20 + 5);
    expect(fitter.threshold.minSPerKm).toBeLessThan(paces.threshold.minSPerKm);
    expect(fitter.easy.maxSPerKm).toBeLessThan(paces.easy.maxSPerKm);
  });
});
