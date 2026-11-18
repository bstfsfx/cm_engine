/*
 * ChromaLab — CIE XYZ <-> CIELAB conversion
 */

import { getWhitePoint, DEFAULT_WHITE_POINT } from "./whitepoints.js";

/** (6/29)^3 — the t threshold used by the CIELAB nonlinearity. */
export const LAB_EPSILON = 216 / 24389;

/** (29/3)^3 — the linear-slope multiplier used by the CIELAB nonlinearity. */
export const LAB_KAPPA = 24389 / 27;

/**
 * The CIELAB forward nonlinearity.
 *
 * @param {number} t Normalized tristimulus value.
 * @returns {number} The transformed value.
 */
export function labForward(t) {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

/**
 * The CIELAB inverse nonlinearity.
 *
 * @param {number} t Transformed value.
 * @returns {number} The normalized tristimulus value.
 */
export function labInverse(t) {
  const t3 = t * t * t;
  return t3 > LAB_EPSILON ? t3 : (116 * t - 16) / LAB_KAPPA;
}

/**
 * Convert CIE XYZ to CIELAB.
 *
 * @param {{ X: number, Y: number, Z: number }} xyz CIE XYZ value.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ L: number, a: number, b: number }} CIELAB values.
 */
export function xyzToLab(xyz, white = DEFAULT_WHITE_POINT) {
  const wp = getWhitePoint(white);

  const fx = labForward(xyz.X / wp.X);
  const fy = labForward(xyz.Y / wp.Y);
  const fz = labForward(xyz.Z / wp.Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

/**
 * Convert CIELAB to CIE XYZ.
 *
 * @param {{ L: number, a: number, b: number }} lab CIELAB values.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ X: number, Y: number, Z: number }} CIE XYZ value.
 */
export function labToXyz({ L, a, b }, white = DEFAULT_WHITE_POINT) {
  const wp = getWhitePoint(white);

  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  return {
    X: wp.X * labInverse(fx),
    Y: wp.Y * labInverse(fy),
    Z: wp.Z * labInverse(fz)
  };
}
