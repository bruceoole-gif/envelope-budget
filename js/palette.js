// A clean, vivid categorical palette used consistently for folder accents and chart segments
// across the app. Colors are assigned by position so a given folder keeps the same color
// everywhere as long as folder order is stable.
export const PALETTE = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#14b8a6', // teal
  '#ec4899', // pink
];

export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}
