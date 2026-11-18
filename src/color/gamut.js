/*
 * ChromaLab — gamut detection
 *
 * Out-of-gamut detection is reported explicitly; clipping is never applied
 * silently.
 */

import { xyzToLinearRgb, linearToSrgb } from "./rgb.js";

/**
 * A tolerance, in linear-light units, within which a channel is considered
 * in gamut.
 *
 * This absorbs the accumulated rounding error of the sRGB primaries matrix:
 * sRGB white is not bit-exactly (1, 1, 1) in linear light. A value of 1e-6
 * is roughly one part in a million of full scale, far below any perceptual
 * or measurement significance.
 *
 * @type {number}
 */
export const DEFAULT_GAMUT_TOLERANCE = 1e-6;

/**
 * Check whether a CIE XYZ color falls inside the sRGB gamut.
 *
 * The check is performed in linear light, which is where the sRGB gamut
 * boundary is physically defined.
 *
 * @param {{ X: number, Y: number, Z: number }} xyz CIE XYZ value.
 * @param {object} [options] Options.
 * @param {number} [options.tolerance=0] Linear-light tolerance per channel.
 * @param {string} [options.white="D65"] Reference white.
 * @returns {{ inGamut: boolean, linear: { r: number, g: number, b: number },
 *   clipped: { r: number, g: number, b: number }, outOfGamutChannels: string[] }}
 *   The gamut report.
 */
export function checkXyzGamut(xyz, options = {}) {
  const { tolerance = DEFAULT_GAMUT_TOLERANCE, white = "D65" } = options;
  const linear = xyzToLinearRgb(xyz, white);

  const channels = ["r", "g", "b"];
  const outOfGamutChannels = channels.filter(
    (c) => linear[c] < -tolerance || linear[c] > 1 + tolerance
  );

  const clipped = {
    r: Math.max(0, Math.min(1, linear.r)),
    g: Math.max(0, Math.min(1, linear.g)),
    b: Math.max(0, Math.min(1, linear.b))
  };

  return {
    inGamut: outOfGamutChannels.length === 0,
    linear,
    clipped,
    outOfGamutChannels
  };
}

/**
 * Check whether an sRGB color falls inside the sRGB gamut.
 *
 * By definition an in-range sRGB triplet is in gamut; this helper exists so
 * that callers can validate out-of-range input values consistently.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @returns {{ inGamut: boolean, outOfGamutChannels: string[] }} The gamut report.
 */
export function checkRgbGamut(rgb) {
  const channels = ["r", "g", "b"];
  const outOfGamutChannels = channels.filter(
    (c) => !Number.isFinite(rgb[c]) || rgb[c] < 0 || rgb[c] > 255
  );
  return { inGamut: outOfGamutChannels.length === 0, outOfGamutChannels };
}

/**
 * Clip a linear-light RGB value into the sRGB gamut.
 *
 * @param {{ r: number, g: number, b: number }} linear Linear-light values.
 * @returns {{ r: number, g: number, b: number }} Clipped 8-bit sRGB values.
 */
export function clipLinearRgbToSrgb(linear) {
  return {
    r: Math.round(Math.max(0, Math.min(1, linearToSrgb(Math.max(0, Math.min(1, linear.r))))) * 255),
    g: Math.round(Math.max(0, Math.min(1, linearToSrgb(Math.max(0, Math.min(1, linear.g))))) * 255),
    b: Math.round(Math.max(0, Math.min(1, linearToSrgb(Math.max(0, Math.min(1, linear.b))))) * 255)
  };
}
