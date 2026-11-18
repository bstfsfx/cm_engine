/*
 * ChromaLab — input validation
 *
 * Validation only. No color formulas live here.
 */

/**
 * Validate an 8-bit sRGB triplet.
 *
 * @param {{ r: number, g: number, b: number }} rgb Candidate values.
 * @returns {{ valid: boolean, errors: string[], value?: { r: number, g: number, b: number } }}
 *   The validation result.
 */
export function validateRgb(rgb) {
  const errors = [];
  const channels = ["r", "g", "b"];

  if (!rgb || typeof rgb !== "object") {
    return { valid: false, errors: ["RGB value must be an object."] };
  }

  for (const channel of channels) {
    const value = rgb[channel];
    if (!Number.isInteger(value)) {
      errors.push(`Channel ${channel.toUpperCase()} must be a whole number.`);
    } else if (value < 0 || value > 255) {
      errors.push(`Channel ${channel.toUpperCase()} must be between 0 and 255.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], value: { r: rgb.r, g: rgb.g, b: rgb.b } };
}

/**
 * Validate a CIELAB triplet.
 *
 * @param {{ L: number, a: number, b: number }} lab Candidate values.
 * @returns {{ valid: boolean, errors: string[], value?: { L: number, a: number, b: number } }}
 *   The validation result.
 */
export function validateLab(lab) {
  const errors = [];

  if (!lab || typeof lab !== "object") {
    return { valid: false, errors: ["Lab value must be an object."] };
  }

  for (const channel of ["L", "a", "b"]) {
    if (!Number.isFinite(lab[channel])) {
      errors.push(`Component ${channel}* must be a finite number.`);
    }
  }

  if (Number.isFinite(lab.L) && (lab.L < 0 || lab.L > 100)) {
    errors.push("L* must be between 0 and 100.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], value: { L: lab.L, a: lab.a, b: lab.b } };
}

/**
 * Validate a CIELCh triplet.
 *
 * @param {{ L: number, C: number, h: number }} lch Candidate values.
 * @returns {{ valid: boolean, errors: string[], value?: { L: number, C: number, h: number } }}
 *   The validation result.
 */
export function validateLch(lch) {
  const errors = [];

  if (!lch || typeof lch !== "object") {
    return { valid: false, errors: ["LCh value must be an object."] };
  }

  for (const channel of ["L", "C", "h"]) {
    if (!Number.isFinite(lch[channel])) {
      errors.push(`Component ${channel} must be a finite number.`);
    }
  }

  if (Number.isFinite(lch.L) && (lch.L < 0 || lch.L > 100)) {
    errors.push("L* must be between 0 and 100.");
  }

  if (Number.isFinite(lch.C) && lch.C < 0) {
    errors.push("C* cannot be negative.");
  }

  if (Number.isFinite(lch.h) && (lch.h < 0 || lch.h >= 360)) {
    errors.push("Hue must be between 0 and 360 degrees.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], value: { L: lch.L, C: lch.C, h: lch.h } };
}

/**
 * Parse a user-entered number.
 *
 * @param {string | number} raw The raw input.
 * @returns {number | null} The parsed number, or null if unparseable.
 */
export function parseNumber(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Validate a total ink coverage limit.
 *
 * The limit is expressed as a percentage and must be supplied by the
 * operator. There is no default, because no universal TAC limit exists.
 *
 * @param {string | number} raw The raw limit.
 * @returns {{ valid: boolean, errors: string[], value?: number }} The result.
 */
export function validateTacLimit(raw) {
  const value = parseNumber(raw);

  if (value === null) {
    return { valid: false, errors: ["Enter a total ink coverage limit in percent."] };
  }

  if (value <= 0 || value > 400) {
    return { valid: false, errors: ["The limit must be between 0 and 400 percent."] };
  }

  return { valid: true, errors: [], value };
}
