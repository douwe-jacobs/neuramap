export const ROOT_PALETTE = [
  { h: 174, s: 100, l: 72 },
  { h:  48, s: 100, l: 70 },
  { h: 320, s:  90, l: 72 },
  { h: 200, s:  95, l: 68 },
  { h: 100, s:  90, l: 68 },
  { h:  20, s:  95, l: 68 },
];

export const PALETTE = [
  { h: 190, s: 88, l: 58 },
  { h: 270, s: 75, l: 68 },
  { h: 340, s: 80, l: 65 },
  { h:  42, s: 95, l: 58 },
  { h: 210, s: 85, l: 62 },
  { h: 150, s: 75, l: 55 },
];

export function hslToRgb(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
  return `${f(0)}, ${f(8)}, ${f(4)}`;
}
