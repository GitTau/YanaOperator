// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — YanaOperator v2
// Palette: Slate + Deep Teal. Premium B2B ops tool aesthetic.
// Muted, professional — no neon, no oversaturation.
// Import everywhere. Never hardcode hex values in components.
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  brandTeal:       '#06B6D4',   // Primary — vibrant cyan (Yana brand)
  brandTealDim:    '#0891B2',   // Pressed / darker shade
  brandTealSubtle: '#ECFEFF',   // Cyan-tinted surface
  brandNavy:       '#0F1C2E',   // Deep navy for high-contrast text on cyan

  // ── Semantic / Status ──────────────────────────────────────────────────────
  statusActive:    '#10B981',   // Emerald green
  statusWarning:   '#F59E0B',   // Amber/orange for payments & warnings
  statusError:     '#EF4444',   // Red for overdue/errors
  statusInfo:      '#2563EB',   // Blue for info

  // ── Status Surface Tints (for coloured KPI cards) ──────────────────────────
  surfaceGreen:    '#ECFDF5',   // Available — light green card bg
  surfaceAmber:    '#FFF7ED',   // Payments/warning — light orange card bg
  surfaceRed:      '#FFF5F5',   // Overdue/error — light pink card bg
  surfaceTeal:     '#ECFEFF',   // Brand — light cyan card bg
  surfaceBlue:     '#EFF6FF',   // Info state tint

  // ── App Surface ────────────────────────────────────────────────────────────
  bgApp:           '#F5F6FA',   // Page background
  surfaceCard:     '#FFFFFF',   // Card / modal background
  surfaceElevated: '#FAFBFC',   // Slightly off-white for nested surfaces

  // ── Borders ────────────────────────────────────────────────────────────────
  borderLight:     '#E4E7EE',   // Standard divider
  borderInput:     '#CBD2E0',   // Input border
  borderFocus:     '#0891B2',   // Focused input border (brand teal)

  // ── Typography ─────────────────────────────────────────────────────────────
  textPrimary:     '#111827',   // Near-black body text
  textSecondary:   '#6B7280',   // Secondary / label text
  textMuted:       '#9CA3AF',   // Placeholder / disabled
  textTeal:        '#06B6D4',   // Brand-coloured text
  textError:       '#EF4444',
  textWarning:     '#F59E0B',
  textSuccess:     '#10B981',
  textOrange:      '#F59E0B',   // Payments / money emphasis

  // ── Backwards compatibility aliases ──────────────────────────────────────
  brandCyan:          '#06B6D4',
  brandCyanDark:      '#0891B2',
  textSecondaryAlias: '#6B7280',
  statusOverdue:      '#EF4444',
  statusNotClear:     '#EF4444',
  statusAvailableBg:  '#ECFDF5',
  statusInactiveBg:   '#FFF5F5',
  overdueCardBg:      '#FFF5F5',
  textCyan:           '#06B6D4',
  orangeBg:           '#FFF7ED',
  orangeIcon:         '#F59E0B',
  /** @deprecated */
  brandWhite:         '#FFFFFF',
  /** @deprecated */
  amber:              '#D97706',
  /** @deprecated */
  amberBg:            '#FFFBEB',
  /** @deprecated */
  blueBg:             '#EFF6FF',
  /** @deprecated */
  blueText:           '#2563EB',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Radius — increased ~15% from v1 for a more premium feel.
 * Buttons use rounded-rectangle (14), not pill (32) — professional, not playful.
 */
export const Radius = {
  card:   16,   // was 12
  button: 14,   // was 32 — rounded rect, not pill
  badge:  6,    // was 4
  modal:  20,   // was 16
  sm:     10,   // was 8
  xs:     6,    // was 4
  input:  12,   // new — for text inputs
  pill:   100,  // explicit pill when intentional (chips, status dots)
} as const;

export const Typography = {
  h1Screen:       { fontSize: 22, fontWeight: '700' as const },
  h2Metric:       { fontSize: 32, fontWeight: '800' as const },    // KPI values
  /** @deprecated use h2Metric */
  h2Card:         { fontSize: 32, fontWeight: '800' as const },
  labelCaps:      { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.2 },
  bodyPrimary:    { fontSize: 14, fontWeight: '400' as const },
  bodySecondary:  { fontSize: 12, fontWeight: '400' as const },
  badgeText:      { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
  buttonPrimary:  { fontSize: 14, fontWeight: '700' as const, letterSpacing: 0.4 },
  buttonSecondary:{ fontSize: 13, fontWeight: '500' as const },
  overline:       { fontSize: 10, fontWeight: '500' as const, letterSpacing: 1.5 },
  caption:        { fontSize: 11, fontWeight: '400' as const },
} as const;

// Booking status display config — muted palette
export const BookingStatusConfig = {
  Draft:     { bg: '#F3F4F6', text: '#6B7280',  label: 'DRAFT'     },
  Active:    { bg: '#F0FDF4', text: '#059669',  label: 'ACTIVE'    },
  Paused:    { bg: '#FFFBEB', text: '#D97706',  label: 'PAUSED'    },
  Completed: { bg: '#EFF6FF', text: '#2563EB',  label: 'COMPLETED' },
  Cancelled: { bg: '#F9FAFB', text: '#9CA3AF',  label: 'CANCELLED' },
} as const;

export type BookingStatusKey = keyof typeof BookingStatusConfig;
