// Browser-compatible deterministic SVG avatar generator.
// Mirrors makeAvatarSvg() in server.ts (uses btoa instead of Buffer).
// Stable: no external requests, no CDN dependency.
const PALETTE = [
  "0078D4","107C10","D83B01","8764B8","038387",
  "CA5010","C239B3","10893E","005A9E","7B3F00"
];

export function makeAvatarSvg(name: string): string {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] ?? "") + (words[words.length - 1][0] ?? "")
    : name.slice(0, 2);
  const upper = initials.toUpperCase() || "?";
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">`,
    `<rect width="40" height="40" rx="20" fill="#${PALETTE[idx]}"/>`,
    `<text x="20" y="27" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">${upper}</text>`,
    `</svg>`
  ].join("");
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
