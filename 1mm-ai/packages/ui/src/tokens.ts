/**
 * Shared design tokens for web (Tailwind theme) and mobile (StyleSheet).
 * DOM components live in apps/web; native components in apps/mobile –
 * the visual language is shared through these tokens.
 */

export const PRODUCT_NAME = "1MM AI";

export const colors = {
  background: "#0b0e14",
  surface: "#131722",
  surfaceRaised: "#1b2130",
  border: "#2a3245",
  primary: "#6366f1",
  primaryHover: "#818cf8",
  accent: "#22d3ee",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  userBubble: "#312e81",
  assistantBubble: "#1b2130",
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Minimum touch target size (a11y, mobile). */
export const MIN_TOUCH_TARGET = 44;
