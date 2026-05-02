// ─────────────────────────────────────────────────────────────────────────────
// useLayout — Responsive scaling for all screen sizes
//
// Reference device: 375pt wide (iPhone SE 2 / most budget Androids).
// All font and size constants in design.ts are authored at this reference.
//
// Usage:
//   const { scale, fontScale, isSmallPhone } = useLayout();
//   style={{ fontSize: fontScale(16), padding: scale(16) }}
// ─────────────────────────────────────────────────────────────────────────────

import { useWindowDimensions } from 'react-native';

/** Reference design width — iPhone SE 2 / budget Android baseline */
const BASE_WIDTH = 375;

/** Cap the scale factor so tablets don't go wild */
const MAX_SCALE = 1.35;

export function useLayout() {
  const { width, height } = useWindowDimensions();

  // Raw width scale factor, capped
  const wScale = Math.min(width / BASE_WIDTH, MAX_SCALE);

  /**
   * scale(size) — Linear scale for layout dimensions:
   * padding, margin, icon sizes, border radii, fixed heights.
   * Grows 1:1 with screen width.
   */
  const scale = (size: number): number => Math.round(size * wScale);

  /**
   * fontScale(size) — Moderate (dampened) scale for typography.
   * Grows at ~45% of the linear rate so text stays readable on large
   * phones without becoming overwhelming. Smaller phones get slightly
   * reduced sizes (by the same factor, below BASE_WIDTH).
   */
  const fontScale = (size: number): number =>
    Math.round(size + (size * wScale - size) * 0.45);

  /** < 380pt — Redmi 10, Galaxy A13, older iPhones */
  const isSmallPhone = width < 380;

  /** ≥ 410pt — Pixel 8 Pro, iPhone 15 Plus, Samsung S23+ */
  const isLargePhone = width >= 410;

  return {
    /** Screen pixel width */
    width,
    /** Screen pixel height */
    height,
    /** Linear scale function for layout dimensions */
    scale,
    /** Moderate scale function for font sizes */
    fontScale,
    /** true if device is a small phone (< 380pt) */
    isSmallPhone,
    /** true if device is a large phone (≥ 410pt) */
    isLargePhone,
    /** Raw width scale factor (for advanced use) */
    wScale,
  };
}
