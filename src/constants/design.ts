// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — single source of truth from DESIGN_OPS.md
// Import these everywhere. Never hardcode hex values in components.
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  brandCyan: '#00E5FF',
  brandCyanDark: '#00C4D4', // text-cyan (slightly darker for readability)
  brandNavy: '#0D1B2A',
  brandWhite: '#FFFFFF',

  // Semantic / Status
  statusActive: '#00C853',
  statusPending: '#9E9E9E',
  statusOverdue: '#FF1744',
  statusWarning: '#FF6D00',
  statusNotClear: '#FF1744',
  statusAvailableBg: '#E8F5E9',
  statusInactiveBg: '#FFEBEE',
  overdueCardBg: '#FFF0F0',

  // Surface
  bgApp: '#F2F4F7',
  surfaceCard: '#FFFFFF',
  borderLight: '#E0E0E0',
  borderInput: '#D0D0D0',

  // Typography
  textPrimary: '#1A1A2E',
  textSecondary: '#757575',
  textCyan: '#00C4D4',
  textOverdue: '#FF1744',
  textOrange: '#FF6D00',
  textNavyWhite: '#FFFFFF',

  // Extra utility
  amber: '#FF8F00',
  amberBg: '#FFF8E1',
  blueBg: '#E3F2FD',
  blueText: '#1565C0',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  card: 12,
  button: 32,
  badge: 4,
  modal: 16,
  sm: 8,
  xs: 4,
} as const;

export const Typography = {
  h1Screen: { fontSize: 24, fontWeight: '700' as const },
  h2Card: { fontSize: 40, fontWeight: '800' as const },
  labelCaps: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.8 },
  bodyPrimary: { fontSize: 14, fontWeight: '400' as const },
  bodySecondary: { fontSize: 12, fontWeight: '400' as const },
  badgeText: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5 },
  buttonPrimary: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 1.2 },
  buttonSecondary: { fontSize: 13, fontWeight: '500' as const },
  overline: { fontSize: 10, fontWeight: '500' as const, letterSpacing: 1.5 },
} as const;

// Booking status display config
export const BookingStatusConfig = {
  Draft: { bg: '#EEEEEE', text: '#616161', label: 'DRAFT' },
  Active: { bg: '#E8F5E9', text: '#00C853', label: 'ACTIVE' },
  Paused: { bg: '#FFF8E1', text: '#FF8F00', label: 'PAUSED' },
  Completed: { bg: '#E3F2FD', text: '#1565C0', label: 'COMPLETED' },
  Cancelled: { bg: '#FAFAFA', text: '#9E9E9E', label: 'CANCELLED' },
} as const;

export type BookingStatusKey = keyof typeof BookingStatusConfig;
