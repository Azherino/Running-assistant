import { Platform } from 'react-native';

export const colors = {
  bg: '#080A0C',
  surface: '#12161B',
  surfaceAlt: '#1A2027',
  border: '#232B33',
  borderStrong: '#2E3944',
  text: '#F3F6F8',
  textDim: '#C3CBD3',
  muted: '#8B97A3',
  accent: '#D7FF5F',
  accentInk: '#0C1200',
  base: '#4EA1FF',
  build: '#FFB84D',
  peak: '#FF6B6B',
  taper: '#A78BFA',
  danger: '#FF5A5F',
  warning: '#FFB020',
  success: '#4ADE80',
  rest: '#3A4653',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const phaseColors: Record<string, string> = {
  base: colors.base,
  build: colors.build,
  peak: colors.peak,
  taper: colors.taper,
};

export const phaseLabels: Record<string, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
};

export const font = {
  display: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const type = {
  hero: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5, color: colors.text },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.text },
  section: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.textDim },
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
  number: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.text },
} as const;
