import { colors, MIN_TOUCH_TARGET, radii, spacing } from "@1mm/ui";

/** Mobile theme derived from the shared design tokens. */
export const theme = {
  colors,
  radii,
  spacing,
  minTouchTarget: MIN_TOUCH_TARGET,
} as const;
