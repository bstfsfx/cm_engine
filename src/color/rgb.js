/*
 * ChromaLab — sRGB transfer function and RGB <-> XYZ conversion
 */

import { getWhitePoint, adaptXyz, DEFAULT_WHITE_POINT } from "./whitepoints.js";

/** sRGB IEC 61966-2-1 electro-optical transfer function breakpoint. */
export const SRGB_LINEAR_BREAK = 0.04045;

/** Inverse sRGB transfer function breakpoint. */
export const SRGB_GAMMA_BREAK = 0.0031308;

/** sRGB primaries -> CIE XYZ (D65) matrix. */
const RGB_TO_XYZ_D65 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041]
];

/** CIE XYZ (D65) -> sRGB primaries matrix. */
const XYZ_TO_RGB_D65 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252]
];

/**
 * Multiply a 3x3 matrix by a 3-element column vector.
 *
 * @param {number[][]} matrix Row-major 3x3 matrix.
 * @param {number[]} vector Column vector.
 * @returns {number[]} The product.
 */
function multiplyMatrixVector(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
  ];
}

/**
 * Decode an 8-bit sRGB channel to linear light.
 *
 * @param {number} value Channel value, 0-255.
 * @returns {number} Linear-light value, 0-1.
 */
export function srgbToLinear(value) {
  const c = value / 255;
  return c <= SRGB_LINEAR_BREAK ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Encode a linear-light channel to 8-bit sRGB.
 *
 * @param {number} value Linear-light value, 0-1.
 * @returns {number} Channel value, 0-255 (not rounded).
 */
export function linearToSrgb(value) {
  return value <= SRGB_GAMMA_BREAK
    ? 12.92 * value
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * Decode all three sRGB channels to linear light.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @returns {{ r: number, g: number, b: number }} Linear-light values, 0-1.
 */
export function rgbToLinear({ r, g, b }) {
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b)
  };
}

/**
 * Convert linear-light RGB to CIE XYZ.
 *
 * @param {{ r: number, g: number, b: number }} linear Linear-light values, 0-1.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ X: number, Y: number, Z: number }} CIE XYZ with Y normalized to 0-1.
 */
export function linearRgbToXyz(linear, white = DEFAULT_WHITE_POINT) {
  const wp = getWhitePoint(white);
  const rgb = [linear.r, linear.g, linear.b];
  const [X, Y, Z] = multiplyMatrixVector(RGB_TO_XYZ_D65, rgb);

  // The matrix above is defined for D65. For other whites, adapt from D65 first.
  if (wp.X !== 0.95047 || wp.Z !== 1.08883) {
    return adaptXyz({ X, Y, Z }, "D65", wp);
  }

  return { X, Y, Z };
}

/**
 * Convert sRGB to CIE XYZ.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ X: number, Y: number, Z: number }} CIE XYZ with Y normalized to 0-1.
 */
export function rgbToXyz(rgb, white = DEFAULT_WHITE_POINT) {
  return linearRgbToXyz(rgbToLinear(rgb), white);
}

/**
 * Convert CIE XYZ to linear-light RGB.
 *
 * @param {{ X: number, Y: number, Z: number }} xyz CIE XYZ value.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ r: number, g: number, b: number }} Linear-light values. May fall
 *   outside 0-1 for out-of-gamut colors; the values are not clipped here.
 */
export function xyzToLinearRgb(xyz, white = DEFAULT_WHITE_POINT) {
  const wp = getWhitePoint(white);

  let source = xyz;
  if (wp.X !== 0.95047 || wp.Z !== 1.08883) {
    source = adaptXyz(xyz, wp, "D65");
  }

  const rgb = multiplyMatrixVector(XYZ_TO_RGB_D65, [source.X, source.Y, source.Z]);
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

/**
 * Convert CIE XYZ to sRGB, clipping out-of-gamut channels.
 *
 * Clipping is applied here explicitly rather than silently, so callers that
 * need to know about clipping should use {@link xyzToLinearRgb} and compare
 * against 0-1 themselves.
 *
 * @param {{ X: number, Y: number, Z: number }} xyz CIE XYZ value.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ r: number, g: number, b: number }} sRGB values, 0-255, rounded.
 */
export function xyzToRgb(xyz, white = DEFAULT_WHITE_POINT) {
  const linear = xyzToLinearRgb(xyz, white);
  return {
    r: Math.round(Math.max(0, Math.min(1, linearToSrgb(linear.r))) * 255),
    g: Math.round(Math.max(0, Math.min(1, linearToSrgb(linear.g))) * 255),
    b: Math.round(Math.max(0, Math.min(1, linearToSrgb(linear.b))) * 255)
  };
}

/**
 * Convert sRGB to a hexadecimal color string.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @returns {string} Uppercase `#RRGGBB`.
 */
export function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Parse a hexadecimal color string into sRGB values.
 *
 * Accepts `#RGB`, `#RRGGBB`, `#RRGGBBAA` and the same forms without the `#`.
 *
 * @param {string} hex The hex string.
 * @returns {{ r: number, g: number, b: number }} sRGB values, 0-255.
 * @throws {Error} If the string is not a valid hex color.
 */
export function hexToRgb(hex) {
  const cleaned = String(hex).trim().replace(/^#/, "");

  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error(`Invalid hex color "${hex}".`);
  }

  let expanded;
  if (cleaned.length === 3 || cleaned.length === 4) {
    expanded = cleaned
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (cleaned.length === 6 || cleaned.length === 8) {
    expanded = cleaned.slice(0, 6);
  } else {
    throw new Error(`Invalid hex color "${hex}". Expected 3, 4, 6 or 8 hex digits.`);
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16)
  };
}
