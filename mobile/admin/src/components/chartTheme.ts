import { colors } from '@mealdirect/shared';

// Data marks use the reference palette's slot-1 blue, validated against the
// white card surface (dataviz validate_palette.js: all checks pass). The brand
// red stays for actions: on a sales chart it would read as "bad".
export const chart = {
  series: '#2a78d6',
  seriesSelected: '#5598e7', // one step lighter: the tapped mark lifts
  grid: colors.border,
  axisText: colors.textMuted,
};
