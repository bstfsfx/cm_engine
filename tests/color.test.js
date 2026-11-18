/*
 * ChromaLab — engine reference tests
 *
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  WHITE_POINTS,
  srgbToLinear,
  linearToSrgb,
  rgbToXyz,
  xyzToRgb,
  rgbToLab,
  labToRgb,
  labToXyz,
  xyzToLab,
  rgbToLch,
  lchToRgb,
  lchToLab,
  deltaE76,
  deltaE2000,
  deltaE00,
  adaptXyz,
  bradfordMatrix,
  checkXyzGamut,
  checkRgbGamut,
  rgbToHex,
  hexToRgb
} from "../src/color/color.js";

/** Assert two numbers are equal within a tolerance. */
function assertClose(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual} (tolerance ${tolerance})`
  );
}

/** Assert a Lab triplet is within tolerance of an expected triplet. */
function assertLabClose(actual, expected, tolerance, message) {
  assertClose(actual.L, expected[0], tolerance, `${message} L`);
  assertClose(actual.a, expected[1], tolerance, `${message} a`);
  assertClose(actual.b, expected[2], tolerance, `${message} b`);
}

test("white points expose D65 and D50 with Y normalized to 1", () => {
  assert.equal(WHITE_POINTS.D65.Y, 1);
  assert.equal(WHITE_POINTS.D50.Y, 1);
  assertClose(WHITE_POINTS.D65.X, 0.95047, 1e-9, "D65 X");
  assertClose(WHITE_POINTS.D65.Z, 1.08883, 1e-9, "D65 Z");
  assertClose(WHITE_POINTS.D50.X, 0.96422, 1e-9, "D50 X");
  assertClose(WHITE_POINTS.D50.Z, 0.82521, 1e-9, "D50 Z");
});

test("sRGB gamma decoding matches the sRGB specification", () => {
  assertClose(srgbToLinear(0), 0, 1e-12, "black");
  assertClose(srgbToLinear(255), 1, 1e-12, "white");
  // 10/255 = 0.039216 sits below the 0.04045 linear breakpoint.
  assertClose(srgbToLinear(10), 10 / 255 / 12.92, 1e-12, "below breakpoint");
  // 11/255 = 0.043137 sits above the breakpoint and uses the power curve.
  assertClose(srgbToLinear(11), Math.pow((11 / 255 + 0.055) / 1.055, 2.4), 1e-12, "above breakpoint");
});

test("linear-to-sRGB encoding is the inverse of sRGB decoding", () => {
  for (const value of [0, 1, 5, 10, 11, 64, 128, 200, 254, 255]) {
    assertClose(linearToSrgb(srgbToLinear(value)), value / 255, 1e-12, `round-trip ${value}`);
  }
});

test("sRGB -> Lab matches the README reference values (D65)", () => {
  assertLabClose(rgbToLab({ r: 255, g: 0, b: 0 }), [53.24, 80.09, 67.2], 0.01, "red");
  assertLabClose(rgbToLab({ r: 0, g: 255, b: 0 }), [87.73, -86.18, 83.18], 0.01, "green");
  assertLabClose(rgbToLab({ r: 0, g: 0, b: 255 }), [32.3, 79.19, -107.86], 0.01, "blue");
  assertLabClose(rgbToLab({ r: 255, g: 255, b: 255 }), [100, 0, 0], 0.01, "white");
  assertLabClose(rgbToLab({ r: 0, g: 0, b: 0 }), [0, 0, 0], 0.001, "black");
});

test("sRGB -> XYZ matches the sRGB primaries matrix (D65)", () => {
  const white = rgbToXyz({ r: 255, g: 255, b: 255 });
  assertLabClose(
    { L: 0, a: white.X, b: white.Z },
    [0, WHITE_POINTS.D65.X, WHITE_POINTS.D65.Z],
    1e-6,
    "white XYZ"
  );

  const red = rgbToXyz({ r: 255, g: 0, b: 0 });
  assertClose(red.Y, 0.2126729, 1e-6, "red Y");
  assertClose(red.X, 0.4124564, 1e-6, "red X");
  assertClose(red.Z, 0.0193339, 1e-6, "red Z");
});

test("Lab -> sRGB round-trips within one 8-bit step", () => {
  const samples = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 0, b: 0 },
    { r: 18, g: 52, b: 86 },
    { r: 200, g: 137, b: 19 },
    { r: 128, g: 128, b: 128 }
  ];

  for (const rgb of samples) {
    const result = labToRgb(rgbToLab(rgb));
    assert.ok(
      Math.abs(result.r - rgb.r) <= 1 &&
        Math.abs(result.g - rgb.g) <= 1 &&
        Math.abs(result.b - rgb.b) <= 1,
      `round-trip ${JSON.stringify(rgb)} produced ${JSON.stringify(result)}`
    );
  }
});

test("Lab -> XYZ -> Lab round-trips exactly", () => {
  const lab = { L: 55.5, a: -22.3, b: 41.7 };
  const result = xyzToLab(labToXyz(lab));
  assertLabClose(result, [lab.L, lab.a, lab.b], 1e-9, "Lab round-trip");
});

test("LCh conversion is consistent in both directions", () => {
  const lab = { L: 52.3, a: 61.2, b: -34.8 };
  const lch = rgbToLch({ r: 120, g: 40, b: 200 });
  assert.ok(lch.C >= 0, "chroma is non-negative");
  assert.ok(lch.h >= 0 && lch.h < 360, "hue is within 0-360");

  const back = lchToLab(lch);
  assertLabClose(back, [lch.L, lch.C * Math.cos((lch.h * Math.PI) / 180), lch.C * Math.sin((lch.h * Math.PI) / 180)], 1e-9, "LCh round-trip");
  void lab;
});

test("LCh -> sRGB matches the equivalent Lab -> sRGB result", () => {
  const lch = { L: 50, C: 40, h: 275 };
  const fromLch = lchToRgb(lch);
  const fromLab = labToRgb(lchToLab(lch));
  assert.deepEqual(fromLch, fromLab);
});

test("CIELCh hue for the sRGB blue primary matches the reference angle", () => {
  // sRGB blue in CIELCh under D65 is approximately (32.30, 79.19, 306.29).
  const lch = rgbToLch({ r: 0, g: 0, b: 255 });
  assertClose(lch.h, 306.29, 0.05, "blue hue");
});

test("deltaE76 matches the Euclidean Lab distance", () => {
  const lab1 = { L: 50, a: 10, b: -20 };
  const lab2 = { L: 60, a: -5, b: 25 };
  const expected = Math.sqrt(10 ** 2 + 15 ** 2 + 45 ** 2);
  assertClose(deltaE76(lab1, lab2), expected, 1e-12, "deltaE76");
});

test("deltaE76 is zero for identical colors", () => {
  const lab = { L: 42, a: -13, b: 27 };
  assertClose(deltaE76(lab, lab), 0, 1e-12, "identical colors");
});

test("CIEDE2000 matches the Sharma et al. reference dataset", () => {
  // Test pairs from "The CIEDE2000 Color-Difference Formula: Implementation
  // Notes, Supplementary Test Data, and Mathematical Observations".
  const pairs = [
    [
      { L: 50, a: 2.6772, b: -79.7751 },
      { L: 50, a: 0, b: -82.7485 },
      2.0425
    ],
    [
      { L: 50, a: 3.1571, b: -77.2803 },
      { L: 50, a: 0, b: -82.7485 },
      2.8615
    ],
    [
      { L: 50, a: 2.8361, b: -74.02 },
      { L: 50, a: 0, b: -82.7485 },
      3.4412
    ],
    [
      { L: 50, a: -1.3802, b: -84.2814 },
      { L: 50, a: 0, b: -82.7485 },
      1.0
    ],
    [
      { L: 50, a: -1.1848, b: -84.8006 },
      { L: 50, a: 0, b: -82.7485 },
      1.0
    ],
    [
      { L: 50, a: -0.9009, b: -85.5211 },
      { L: 50, a: 0, b: -82.7485 },
      1.0
    ],
    [
      { L: 50, a: 0, b: 0 },
      { L: 50, a: -1, b: 2 },
      2.3669
    ],
    [
      { L: 50, a: -1, b: 2 },
      { L: 50, a: 0, b: 0 },
      2.3669
    ],
    [
      { L: 50, a: 2.49, b: -0.001 },
      { L: 50, a: -2.49, b: 0.0009 },
      7.1792
    ],
    [
      { L: 50, a: 2.49, b: -0.001 },
      { L: 50, a: -2.49, b: 0.001 },
      7.1792
    ],
    [
      { L: 50, a: 2.49, b: -0.001 },
      { L: 50, a: -2.49, b: 0.0011 },
      7.2195
    ],
    [
      { L: 50, a: 2.49, b: -0.001 },
      { L: 50, a: -2.49, b: 0.0012 },
      7.2195
    ],
    [
      { L: 50, a: -0.001, b: 2.49 },
      { L: 50, a: 0.0009, b: -2.49 },
      4.8045
    ],
    [
      { L: 50, a: -0.001, b: 2.49 },
      { L: 50, a: 0.0011, b: -2.49 },
      4.7461
    ],
    [
      { L: 50, a: -0.001, b: 2.49 },
      { L: 50, a: 0.0012, b: -2.49 },
      4.7461
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 50, a: 0, b: -2.5 },
      4.3065
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 73, a: 25, b: -18 },
      27.1492
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 61, a: -5, b: 29 },
      22.8977
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 56, a: -27, b: -3 },
      31.903
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 58, a: 24, b: 15 },
      19.4535
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 50, a: 3.1736, b: 0.5854 },
      1.0
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 50, a: 3.2972, b: 0 },
      1.0
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 50, a: 1.8634, b: 0.5757 },
      1.0
    ],
    [
      { L: 50, a: 2.5, b: 0 },
      { L: 50, a: 3.2592, b: 0.335 },
      1.0
    ],
    [
      { L: 60.2574, a: -34.0099, b: 36.2677 },
      { L: 60.4626, a: -34.1751, b: 39.4387 },
      1.2644
    ],
    [
      { L: 63.0109, a: -31.0961, b: -5.8663 },
      { L: 62.8187, a: -29.7946, b: -4.0864 },
      1.263
    ],
    [
      { L: 61.2901, a: 3.7196, b: -5.3901 },
      { L: 61.4292, a: 2.248, b: -4.962 },
      1.8731
    ],
    [
      { L: 35.0831, a: -44.1164, b: 3.7933 },
      { L: 35.0232, a: -40.0716, b: 1.5901 },
      1.8645
    ],
    [
      { L: 22.7233, a: 20.0904, b: -46.694 },
      { L: 23.0331, a: 14.973, b: -42.5619 },
      2.0373
    ],
    [
      { L: 36.4612, a: 47.858, b: 18.3852 },
      { L: 36.2715, a: 50.5065, b: 21.2231 },
      1.4146
    ],
    [
      { L: 90.8027, a: -2.0831, b: 1.441 },
      { L: 91.1528, a: -1.6435, b: 0.0447 },
      1.4441
    ],
    [
      { L: 90.9257, a: -0.5406, b: -0.9208 },
      { L: 88.6381, a: -0.8985, b: -0.7239 },
      1.5381
    ],
    [
      { L: 6.7747, a: -0.2908, b: -2.4247 },
      { L: 5.8714, a: -0.0985, b: -2.2286 },
      0.6377
    ],
    [
      { L: 2.0776, a: 0.0795, b: -1.135 },
      { L: 0.9033, a: -0.0636, b: -0.5514 },
      0.9082
    ]
  ];

  for (const [lab1, lab2, expected] of pairs) {
    const actual = deltaE2000(lab1, lab2);
    assertClose(actual, expected, 1e-4, `CIEDE2000 ${JSON.stringify(lab1)} vs ${JSON.stringify(lab2)}`);
  }
});

test("CIEDE2000 is zero for identical colors and symmetric", () => {
  const lab1 = { L: 42, a: -13, b: 27 };
  const lab2 = { L: 44, a: -10, b: 24 };

  assertClose(deltaE2000(lab1, lab1), 0, 1e-12, "identical colors");
  assertClose(deltaE2000(lab1, lab2), deltaE2000(lab2, lab1), 1e-12, "symmetry");
});

test("deltaE00 is an alias of deltaE2000", () => {
  const lab1 = { L: 42, a: -13, b: 27 };
  const lab2 = { L: 44, a: -10, b: 24 };
  assert.equal(deltaE00, deltaE2000);
  assertClose(deltaE00(lab1, lab2), deltaE2000(lab1, lab2), 0, "alias");
});

test("Bradford adaptation round-trips D65 <-> D50", () => {
  const xyz = { X: 0.4124, Y: 0.2127, Z: 0.0193 };

  const toD50 = adaptXyz(xyz, "D65", "D50");
  const back = adaptXyz(toD50, "D50", "D65");

  // Tolerance reflects accumulated floating-point error through two
  // matrix multiplies; it is far below any colorimetric significance.
  assertClose(back.X, xyz.X, 1e-7, "round-trip X");
  assertClose(back.Y, xyz.Y, 1e-7, "round-trip Y");
  assertClose(back.Z, xyz.Z, 1e-7, "round-trip Z");
});

test("Bradford adaptation maps the source white onto the target white", () => {
  const adapted = adaptXyz(WHITE_POINTS.D65, "D65", "D50");
  assertClose(adapted.X, WHITE_POINTS.D50.X, 1e-7, "D50 X");
  assertClose(adapted.Y, WHITE_POINTS.D50.Y, 1e-7, "D50 Y");
  assertClose(adapted.Z, WHITE_POINTS.D50.Z, 1e-7, "D50 Z");
});

test("Bradford adaptation of the same white is the identity", () => {
  const xyz = { X: 0.3, Y: 0.4, Z: 0.2 };
  const adapted = adaptXyz(xyz, "D65", "D65");
  assertClose(adapted.X, xyz.X, 1e-12, "identity X");
  assertClose(adapted.Y, xyz.Y, 1e-12, "identity Y");
  assertClose(adapted.Z, xyz.Z, 1e-12, "identity Z");
});

test("the Bradford matrix reproduces the point-wise adaptation", () => {
  const matrix = bradfordMatrix("D65", "D50");
  const xyz = { X: 0.4124, Y: 0.2127, Z: 0.0193 };

  const viaMatrix = {
    X: matrix[0][0] * xyz.X + matrix[0][1] * xyz.Y + matrix[0][2] * xyz.Z,
    Y: matrix[1][0] * xyz.X + matrix[1][1] * xyz.Y + matrix[1][2] * xyz.Z,
    Z: matrix[2][0] * xyz.X + matrix[2][1] * xyz.Y + matrix[2][2] * xyz.Z
  };

  const viaAdapt = adaptXyz(xyz, "D65", "D50");

  assertClose(viaMatrix.X, viaAdapt.X, 1e-12, "matrix X");
  assertClose(viaMatrix.Y, viaAdapt.Y, 1e-12, "matrix Y");
  assertClose(viaMatrix.Z, viaAdapt.Z, 1e-12, "matrix Z");
});

test("the Bradford matrix maps D65 white onto D50 white", () => {
  const matrix = bradfordMatrix("D65", "D50");
  const w = WHITE_POINTS.D65;

  const adapted = {
    X: matrix[0][0] * w.X + matrix[0][1] * w.Y + matrix[0][2] * w.Z,
    Y: matrix[1][0] * w.X + matrix[1][1] * w.Y + matrix[1][2] * w.Z,
    Z: matrix[2][0] * w.X + matrix[2][1] * w.Y + matrix[2][2] * w.Z
  };

  assertClose(adapted.X, WHITE_POINTS.D50.X, 1e-7, "D50 X");
  assertClose(adapted.Y, WHITE_POINTS.D50.Y, 1e-7, "D50 Y");
  assertClose(adapted.Z, WHITE_POINTS.D50.Z, 1e-7, "D50 Z");
});

test("adapting a color and its reference white keeps it close to the same color", () => {
  // The Bradford CAT is a von Kries-style approximation in three cone
  // channels, not a perfect colorimetric transform for arbitrary colors.
  // It maps the source white exactly onto the target white, so the Lab
  // values of an adapted color stay close to the original. The residual
  // is largest for highly saturated colors.
  const rgb = { r: 255, g: 0, b: 0 };

  const underD65 = rgbToLab(rgb, "D65");
  const underD50 = rgbToLab(rgb, "D50");

  const difference = deltaE76(underD65, underD50);
  assert.ok(
    difference < 4,
    `adapted color should stay within 4 dE of the original, got ${difference}`
  );
});

test("the same XYZ under different white points gives different chromaticity", () => {
  // The classic white-point pitfall: identical tristimulus values measured
  // against different reference whites produce different a* and b*.
  //
  // L* is unchanged because it depends only on Y, and both D65 and D50 have
  // Y = 1. Chromaticity is what shifts.
  const xyz = rgbToXyz({ r: 255, g: 0, b: 0 }, "D65");

  const underD65 = xyzToLab(xyz, "D65");
  const underD50 = xyzToLab(xyz, "D50");

  assertClose(underD65.L, underD50.L, 1e-9, "lightness is unchanged");
  assert.ok(Math.abs(underD65.a - underD50.a) > 0.01, "a* differs");
  assert.ok(Math.abs(underD65.b - underD50.b) > 0.01, "b* differs");
});

test("gamut detection flags out-of-gamut colors and does not hide clipping", () => {
  const inGamut = checkXyzGamut(rgbToXyz({ r: 128, g: 128, b: 128 }));
  assert.equal(inGamut.inGamut, true);
  assert.deepEqual(inGamut.outOfGamutChannels, []);

  // A Lab color far outside the sRGB gamut.
  const outOfGamut = checkXyzGamut(labToXyz({ L: 50, a: 120, b: -120 }));
  assert.equal(outOfGamut.inGamut, false);
  assert.ok(outOfGamut.outOfGamutChannels.length > 0, "channels reported");
  assert.ok(
    outOfGamut.linear.r > 1 || outOfGamut.linear.g > 1 || outOfGamut.linear.b > 1,
    "the unclipped linear value is exposed"
  );
});

test("sRGB white is inside the gamut", () => {
  const report = checkXyzGamut(rgbToXyz({ r: 255, g: 255, b: 255 }));
  assert.equal(report.inGamut, true);
});

test("rgb gamut check flags out-of-range channels", () => {
  assert.equal(checkRgbGamut({ r: 0, g: 128, b: 255 }).inGamut, true);
  const bad = checkRgbGamut({ r: 300, g: -1, b: 128 });
  assert.equal(bad.inGamut, false);
  assert.deepEqual(bad.outOfGamutChannels, ["r", "g"]);
});

test("hex conversion round-trips", () => {
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), "#FF0000");
  assert.equal(rgbToHex({ r: 0, g: 128, b: 255 }), "#0080FF");
  assert.deepEqual(hexToRgb("#FF0000"), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("0080ff"), { r: 0, g: 128, b: 255 });
  assert.deepEqual(hexToRgb("#F00"), { r: 255, g: 0, b: 0 });
  assert.throws(() => hexToRgb("nope"), /Invalid hex color/);
});
