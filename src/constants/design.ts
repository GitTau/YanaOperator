// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — YanaOperator v3 (Style Guide Aligned)
// Palette: Slate + Vibrant Brand Cyan. Premium mobile operations tool aesthetic.
// Import everywhere. Never hardcode hex values in components.
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  brandTeal:       '#00eaff',   // Primary Action — vibrant cyan
  brandTealDim:    '#0891b2',   // Pressed / darker shade (Cyan-600)
  brandTealSubtle: 'rgba(0, 234, 255, 0.1)', // Cyan tint (hover/info states)
  brandNavy:       '#0F1C2E',   // Deep navy for high-contrast text on cyan

  // ── Semantic / Status ──────────────────────────────────────────────────────
  statusActive:    '#059669',   // Emerald-600
  statusWarning:   '#D97706',   // Amber-600
  statusError:     '#E11D48',   // Rose-600
  statusInfo:      '#2563EB',   // Blue-600

  // ── Status Surface Tints (Lighter badges & KPI card tints) ────────────────
  surfaceGreen:    '#ECFDF5',   // emerald-50 bg
  surfaceAmber:    '#FFFBEB',   // amber-50 bg
  surfaceRed:      '#FFF1F2',   // rose-50 bg
  surfaceTeal:     'rgba(0, 234, 255, 0.05)', // brand cyan super dim
  surfaceBlue:     '#EFF6FF',   // blue-50 bg

  // ── App Surface ────────────────────────────────────────────────────────────
  bgApp:           '#f8fafc',   // Page background (slate-50)
  surfaceCard:     '#FFFFFF',   // Card / modal background (white)
  surfaceElevated: '#FAFBFC',   // Slightly off-white for nested surfaces

  // ── Borders ────────────────────────────────────────────────────────────────
  borderLight:     '#f1f5f9',   // Standard divider (slate-100)
  borderInput:     '#e2e8f0',   // Input border (slate-200)
  borderFocus:     '#00eaff',   // Focused input border (brand cyan)

  // ── Typography ─────────────────────────────────────────────────────────────
  textPrimary:     '#0f172a',   // slate-900 (main headers & text)
  textSecondary:   '#475569',   // slate-600 (body & text)
  textMuted:       '#94a3b8',   // slate-400 (muted text & labels)
  textTeal:        '#0891b2',   // dark cyan accent
  textError:       '#BE123C',   // rose-700
  textWarning:     '#B45309',   // amber-700
  textSuccess:     '#047857',   // emerald-700
  textOrange:      '#B45309',   // amber-700 (payments & money)

  // ── Backwards compatibility aliases ──────────────────────────────────────
  brandCyan:          '#00eaff',
  brandCyanDark:      '#0891b2',
  textSecondaryAlias: '#475569',
  statusOverdue:      '#E11D48',
  statusNotClear:     '#E11D48',
  statusAvailableBg:  '#ECFDF5',
  statusInactiveBg:   '#FFF1F2',
  overdueCardBg:      '#FFF1F2',
  textCyan:           '#0891b2',
  orangeBg:           '#FFFBEB',
  orangeIcon:         '#D97706',
  brandWhite:         '#FFFFFF',
  amber:              '#D97706',
  amberBg:            '#FFFBEB',
  blueBg:             '#EFF6FF',
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
 * Radius — Aligned with style guide.
 * Buttons use rounded-rectangle (12), cards use (12), modals use (16).
 */
export const Radius = {
  card:   12,   // rounded-xl
  button: 12,   // rounded-xl
  badge:  100,  // pill-shaped badges (rounded-full)
  modal:  16,   // rounded-2xl
  sm:     8,    // small elements
  xs:     4,    // extra small
  input:  12,   // rounded-xl inputs
  pill:   100,  // pill when explicit
} as const;

/**
 * Typography System - Mapped to loaded Nunito font weights.
 */
export const Typography = {
  h1Screen:       { fontSize: 22, fontFamily: 'Nunito-Bold', fontWeight: '700' as const },
  h2Metric:       { fontSize: 32, fontFamily: 'Nunito-ExtraBold', fontWeight: '800' as const },    // KPI values
  /** @deprecated use h2Metric */
  h2Card:         { fontSize: 32, fontFamily: 'Nunito-ExtraBold', fontWeight: '800' as const },
  labelCaps:      { fontSize: 11, fontFamily: 'Nunito-ExtraBold', fontWeight: '800' as const, letterSpacing: 1.2 },
  bodyPrimary:    { fontSize: 14, fontFamily: 'Nunito-Medium', fontWeight: '500' as const },
  bodySecondary:  { fontSize: 12, fontFamily: 'Nunito-Medium', fontWeight: '500' as const },
  badgeText:      { fontSize: 11, fontFamily: 'Nunito-Black', fontWeight: '900' as const, letterSpacing: 0.3 },
  buttonPrimary:  { fontSize: 14, fontFamily: 'Nunito-Black', fontWeight: '900' as const, letterSpacing: 0.4 },
  buttonSecondary:{ fontSize: 13, fontFamily: 'Nunito-Bold', fontWeight: '700' as const },
  overline:       { fontSize: 10, fontFamily: 'Nunito-Medium', fontWeight: '500' as const, letterSpacing: 1.5 },
  caption:        { fontSize: 11, fontFamily: 'Nunito-Medium', fontWeight: '500' as const },
} as const;

// Booking status display config — style guide emerald/amber/rose/slate badges
export const BookingStatusConfig = {
  Draft:     { bg: '#F1F5F9', text: '#475569', label: 'DRAFT'     },
  Active:    { bg: '#ECFDF5', text: '#047857', label: 'ACTIVE'    },
  Paused:    { bg: '#FFFBEB', text: '#B45309', label: 'PAUSED'    },
  Completed: { bg: '#EFF6FF', text: '#2563EB', label: 'COMPLETED' },
  Cancelled: { bg: '#F1F5F9', text: '#94A3B8', label: 'CANCELLED' },
} as const;

export type BookingStatusKey = keyof typeof BookingStatusConfig;

