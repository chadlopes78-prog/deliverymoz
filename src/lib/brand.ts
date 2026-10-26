/** Escolhe texto branco ou escuro para garantir contraste sobre a cor da marca. */
export function contrastColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#1c1b1a" : "#ffffff";
}

export function safeHex(hex: string | null | undefined, fallback: string) {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
}
