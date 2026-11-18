/*
 * ChromaLab — color difference metrics
 *
 * Implements CIE76 (ΔE*ab) and CIEDE2000 (ΔE00).
 */

/**
 * CIE76 color difference.
 *
 * @param {{ L: number, a: number, b: number }} lab1 First sample.
 * @param {{ L: number, a: number, b: number }} lab2 Second sample.
 * @returns {number} The ΔE*ab value.
 */
export function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Convert degrees to radians.
 *
 * @param {number} degrees Angle in degrees.
 * @returns {number} Angle in radians.
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * CIEDE2000 color difference.
 *
 * Implements the formula from "The CIEDE2000 Color-Difference Formula:
 * Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations" (Sharma, Wu and Dalal, 2005).
 *
 * @param {{ L: number, a: number, b: number }} lab1 First sample.
 * @param {{ L: number, a: number, b: number }} lab2 Second sample.
 * @param {object} [options] Optional parameters.
 * @param {number} [options.kL=1] Lightness weighting factor.
 * @param {number} [options.kC=1] Chroma weighting factor.
 * @param {number} [options.kH=1] Hue weighting factor.
 * @returns {number} The ΔE00 value.
 */
export function deltaE2000(lab1, lab2, options = {}) {
  const { kL = 1, kC = 1, kH = 1 } = options;

  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // 1. Chroma and mean chroma.
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7

  // 2. Adjusted a* values.
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  // 3. Adjusted chroma and hue.
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const hp = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const degrees = (Math.atan2(b, a) * 180) / Math.PI;
    return degrees >= 0 ? degrees : degrees + 360;
  };

  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  // 4. Differences in lightness, chroma and hue.
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(toRadians(dhp) / 2);

  // 5. Mean values.
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  // 6. Correction terms.
  const T =
    1 -
    0.17 * Math.cos(toRadians(hbarp - 30)) +
    0.24 * Math.cos(toRadians(2 * hbarp)) +
    0.32 * Math.cos(toRadians(3 * hbarp + 6)) -
    0.2 * Math.cos(toRadians(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));

  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625)); // 25^7

  const Lbarp50 = Math.pow(Lbarp - 50, 2);
  const SL = 1 + (0.015 * Lbarp50) / Math.sqrt(20 + Lbarp50);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(toRadians(2 * dTheta)) * RC;

  // 7. Final value.
  const termL = dLp / (kL * SL);
  const termC = dCp / (kC * SC);
  const termH = dHp / (kH * SH);

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}

/**
 * CIEDE2000 color difference, alias for {@link deltaE2000}.
 *
 * @param {{ L: number, a: number, b: number }} lab1 First sample.
 * @param {{ L: number, a: number, b: number }} lab2 Second sample.
 * @returns {number} The ΔE00 value.
 */
export const deltaE00 = deltaE2000;
