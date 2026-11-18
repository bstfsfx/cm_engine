/*
 * ChromaLab — reference white points and chromatic adaptation
 *
 * White point values are the CIE 1931 2-degree standard observer
 * tristimulus values of the illuminant, normalized to Y = 1.
 */

/**
 * Reference white points (CIE XYZ, Y = 1).
 * @type {Readonly<Record<string, { X: number, Y: number, Z: number }>>}
 */
export const WHITE_POINTS = Object.freeze({
  D65: Object.freeze({ X: 0.95047, Y: 1.0, Z: 1.08883 }),
  D50: Object.freeze({ X: 0.96422, Y: 1.0, Z: 0.82521 })
});

/**
 * The default illuminant for the screen-color (sRGB) pipeline.
 * @type {string}
 */
export const DEFAULT_WHITE_POINT = "D65";

/**
 * The default observer used throughout the engine.
 * @type {string}
 */
export const DEFAULT_OBSERVER = "CIE 1931 2° standard observer";

/**
 * Resolve a white point by name.
 *
 * @param {string | { X: number, Y: number, Z: number }} [white] Either a name
 *   from {@link WHITE_POINTS} or an explicit XYZ white point.
 * @returns {{ X: number, Y: number, Z: number }} The resolved white point.
 */
export function getWhitePoint(white = DEFAULT_WHITE_POINT) {
  if (typeof white === "string") {
    const found = WHITE_POINTS[white];
    if (!found) {
      throw new Error(
        `Unknown white point "${white}". Known: ${Object.keys(WHITE_POINTS).join(", ")}.`
      );
    }
    return found;
  }
  if (!white || typeof white.X !== "number" || typeof white.Y !== "number" || typeof white.Z !== "number") {
    throw new Error("A white point must be a name or an object with numeric X, Y and Z.");
  }
  return white;
}

/*
 * Bradford chromatic adaptation.
 *
 * The Bradford cone-response matrix is used to convert between
 * chromaticities under different illuminants. Used to move XYZ values
 * between D65 (screen) and D50 (print) reference whites.
 */

/** Bradford cone-response matrix (CIEXYZ -> cone responses). */
const BRADFORD_CONE = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296]
];

/** Inverse Bradford cone-response matrix (cone responses -> CIEXYZ). */
const BRADFORD_CONE_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867]
];

/**
 * Multiply a 3x3 matrix by a 3-element column vector.
 *
 * @param {number[][]} matrix A 3x3 matrix, row-major.
 * @param {number[]} vector A 3-element column vector.
 * @returns {number[]} The 3-element product.
 */
function multiplyMatrixVector(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
  ];
}

/**
 * Multiply two 3x3 matrices.
 *
 * @param {number[][]} a Left matrix, row-major.
 * @param {number[][]} b Right matrix, row-major.
 * @returns {number[][]} The product.
 */
function multiplyMatrixMatrix(a, b) {
  const result = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += a[row][k] * b[k][col];
      }
      result[row][col] = sum;
    }
  }

  return result;
}

/**
 * Adapt an XYZ color from one reference white to another using the
 * Bradford chromatic adaptation transform.
 *
 * Uses the standard Bradford CAT matrix form:
 * `M = ConeInv * diag(dstCone / srcCone) * Cone`, applied directly to the
 * absolute XYZ values. This is the formulation used by ICC color-management
 * pipelines, and it maps the source white exactly onto the target white.
 *
 * @param {{ X: number, Y: number, Z: number }} xyz Source color.
 * @param {string | { X: number, Y: number, Z: number }} [sourceWhite] Source white point.
 * @param {string | { X: number, Y: number, Z: number }} [targetWhite] Target white point.
 * @returns {{ X: number, Y: number, Z: number }} The adapted color.
 */
export function adaptXyz(
  xyz,
  sourceWhite = DEFAULT_WHITE_POINT,
  targetWhite = DEFAULT_WHITE_POINT
) {
  const src = getWhitePoint(sourceWhite);
  const dst = getWhitePoint(targetWhite);

  if (src === dst) {
    return { X: xyz.X, Y: xyz.Y, Z: xyz.Z };
  }

  const matrix = bradfordMatrix(src, dst);

  return {
    X: matrix[0][0] * xyz.X + matrix[0][1] * xyz.Y + matrix[0][2] * xyz.Z,
    Y: matrix[1][0] * xyz.X + matrix[1][1] * xyz.Y + matrix[1][2] * xyz.Z,
    Z: matrix[2][0] * xyz.X + matrix[2][1] * xyz.Y + matrix[2][2] * xyz.Z
  };
}

/**
 * Compute the Bradford adaptation matrix for a source/target white pair.
 *
 * The matrix is `ConeInv * diag(dstCone / srcCone) * Cone`, where the cone
 * responses are those of the source and target white points. Applying it to
 * an XYZ value is equivalent to calling {@link adaptXyz}.
 *
 * @param {string | { X: number, Y: number, Z: number }} [sourceWhite] Source white point.
 * @param {string | { X: number, Y: number, Z: number }} [targetWhite] Target white point.
 * @returns {number[][]} The 3x3 adaptation matrix.
 */
export function bradfordMatrix(sourceWhite = DEFAULT_WHITE_POINT, targetWhite = DEFAULT_WHITE_POINT) {
  const src = getWhitePoint(sourceWhite);
  const dst = getWhitePoint(targetWhite);

  const srcCone = multiplyMatrixVector(BRADFORD_CONE, [src.X, src.Y, src.Z]);
  const dstCone = multiplyMatrixVector(BRADFORD_CONE, [dst.X, dst.Y, dst.Z]);

  const scale = [
    [dstCone[0] / srcCone[0], 0, 0],
    [0, dstCone[1] / srcCone[1], 0],
    [0, 0, dstCone[2] / srcCone[2]]
  ];

  return multiplyMatrixMatrix(
    multiplyMatrixMatrix(BRADFORD_CONE_INV, scale),
    BRADFORD_CONE
  );
}
