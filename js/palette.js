// A warm, hand-picked palette (no neon, no purple-blue-gradient cliché) used consistently for
// folder accents and chart segments across the app. Colors are assigned by position so a given
// folder keeps the same color everywhere as long as folder order is stable.
export const PALETTE = [
  '#d3a24c', // amber
  '#4f9c8f', // teal
  '#c1584a', // rust
  '#7a9b6e', // sage
  '#6b8cae', // dusty blue
  '#9c6b94', // plum
  '#b8862c', // ochre
  '#5b8072', // forest
];

export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}
