/*
 * ChromaLab — CIELCh (cylindrical CIELAB) conversion
 */

/**
 * Convert CIELAB to cylindrical CIELCh.
 *
 * @param {{ L: number, a: number, b: number }} lab CIELAB values.
 * @returns {{ L: number, C: number, h: number }} CIELCh values. Hue is in
 *   degrees, 0-360.
 */
export function labToLch({ L, a, b }) {
  const C = Math.sqrt(a * a + b * b);

  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { L, C, h };
}

/**
 * Convert cylindrical CIELCh to CIELAB.
 *
 * @param {{ L: number, C: number, h: number }} lch CIELCh values. Hue in degrees.
 * @returns {{ L: number, a: number, b: number }} CIELAB values.
 */
export function lchToLab({ L, C, h }) {
  const radians = (h * Math.PI) / 180;
  return {
    L,
    a: C * Math.cos(radians),
    b: C * Math.sin(radians)
  };
}
