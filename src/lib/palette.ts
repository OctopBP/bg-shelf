// Pure bright colors used across the UI for the "rulebook" look —
// cards, chips and tags cycle through these against the black canvas.
export const PALETTE = [
  "#ff5a1f", // orange
  "#21b24c", // green
  "#2f9be0", // blue
  "#ec5fa6", // pink
  "#ffc400", // yellow
  "#9b5de5", // purple
  "#ec2b2b", // red
] as const;

/** Deterministic color for an item by index or by a string key. */
export function colorAt(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return colorAt(Math.abs(h));
}
