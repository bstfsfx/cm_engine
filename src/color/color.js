/*
 * ChromaLab — Color Science Engine
 * Version: 0.1.0
 *
 * Color pipeline:
 * sRGB -> Linear RGB -> XYZ -> CIELAB -> LCh
 *
 * Reference white: D65 (default)
 *
 * This module is the stable core API. It is deliberately free of any DOM or
 * browser dependency so it can be reused in Node, React, Next.js or a worker.
 */

import {
  rgbToLinear,
  linearToSrgb,
  srgbToLinear,
  rgbToXyz,
  xyzToRgb,
  rgbToHex,
  hexToRgb
} from "./rgb.js";
import { xyzToLab, labToXyz } from "./lab.js";
import { labToLch, lchToLab } from "./lch.js";
import { deltaE76, deltaE2000, deltaE00 } from "./deltaE.js";
import {
  WHITE_POINTS,
  DEFAULT_WHITE_POINT,
  DEFAULT_OBSERVER,
  getWhitePoint,
  adaptXyz,
  bradfordMatrix
} from "./whitepoints.js";
import { checkXyzGamut, checkRgbGamut, clipLinearRgbToSrgb } from "./gamut.js";

export {
  WHITE_POINTS,
  DEFAULT_WHITE_POINT,
  DEFAULT_OBSERVER,
  getWhitePoint,
  adaptXyz,
  bradfordMatrix,
  rgbToLinear,
  linearToSrgb,
  srgbToLinear,
  rgbToXyz,
  xyzToRgb,
  rgbToHex,
  hexToRgb,
  xyzToLab,
  labToXyz,
  labToLch,
  lchToLab,
  deltaE76,
  deltaE2000,
  deltaE00,
  checkXyzGamut,
  checkRgbGamut,
  clipLinearRgbToSrgb
};

/**
 * Convert sRGB to CIELAB.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ L: number, a: number, b: number }} CIELAB values.
 */
export function rgbToLab(rgb, white = DEFAULT_WHITE_POINT) {
  return xyzToLab(rgbToXyz(rgb, white), white);
}

/**
 * Convert CIELAB to sRGB, clipping out-of-gamut channels.
 *
 * @param {{ L: number, a: number, b: number }} lab CIELAB values.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ r: number, g: number, b: number }} sRGB values, 0-255, rounded.
 */
export function labToRgb(lab, white = DEFAULT_WHITE_POINT) {
  return xyzToRgb(labToXyz(lab, white), white);
}

/**
 * Convert sRGB to CIELCh.
 *
 * @param {{ r: number, g: number, b: number }} rgb sRGB values, 0-255.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ L: number, C: number, h: number }} CIELCh values.
 */
export function rgbToLch(rgb, white = DEFAULT_WHITE_POINT) {
  return labToLch(rgbToLab(rgb, white));
}

/**
 * Convert CIELCh to sRGB, clipping out-of-gamut channels.
 *
 * @param {{ L: number, C: number, h: number }} lch CIELCh values.
 * @param {string | { X: number, Y: number, Z: number }} [white] Reference white.
 * @returns {{ r: number, g: number, b: number }} sRGB values, 0-255, rounded.
 */
export function lchToRgb(lch, white = DEFAULT_WHITE_POINT) {
  return labToRgb(lchToLab(lch), white);
}
