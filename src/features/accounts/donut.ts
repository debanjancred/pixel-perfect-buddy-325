// Donut geometry for the category chart: pure, so it is unit-tested and needs no chart
// library (Recharts cost ~90 KB gzipped on the public accounts page for one donut).

export interface Arc {
  /** SVG path for the ring segment, in a 0..size coordinate box. */
  d: string;
  /** Angle at the middle of the segment, radians clockwise from 12 o'clock. */
  mid: number;
}

const point = (c: number, r: number, a: number) =>
  `${(c + r * Math.sin(a)).toFixed(3)} ${(c - r * Math.cos(a)).toFixed(3)}`;

/**
 * Ring segments for `values`, clockwise from 12 o'clock, with a `gap` (in px along the
 * outer edge) between neighbours — the chart surface shows through as a separator.
 */
export function donutArcs(values: number[], size: number, thickness: number, gap = 2): Arc[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (!total) return [];
  const c = size / 2;
  const ro = c;
  const ri = c - thickness;
  const live = values.filter((v) => v > 0).length;
  const pad = live > 1 ? gap / ro / 2 : 0; // half the gap on each side, as an angle
  let start = 0;
  return values.map((v) => {
    const sweep = (Math.max(0, v) / total) * Math.PI * 2;
    const a0 = start + pad;
    const a1 = start + sweep - pad;
    start += sweep;
    if (sweep <= 0 || a1 <= a0) return { d: "", mid: a0 };
    // A full circle can't be one arc: draw it as two halves.
    if (live === 1) {
      return {
        d: `M ${point(c, ro, 0)} A ${ro} ${ro} 0 1 1 ${point(c, ro, Math.PI)} A ${ro} ${ro} 0 1 1 ${point(c, ro, 0)} Z M ${point(c, ri, 0)} A ${ri} ${ri} 0 1 0 ${point(c, ri, Math.PI)} A ${ri} ${ri} 0 1 0 ${point(c, ri, 0)} Z`,
        mid: Math.PI,
      };
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return {
      d: `M ${point(c, ro, a0)} A ${ro} ${ro} 0 ${large} 1 ${point(c, ro, a1)} L ${point(c, ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${point(c, ri, a0)} Z`,
      mid: (a0 + a1) / 2,
    };
  });
}
