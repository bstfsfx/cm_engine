/*
 * ChromaLab — ICC profile adapter
 *
 * Isolated browser/WASM integration with LittleCMS. This module is the only
 * place that knows about ICC profiles, LittleCMS, rendering intents and
 * black-point compensation.
 *
 * Profile bytes are held in memory for the lifetime of the browser session
 * only. Nothing is uploaded and nothing is persisted.
 */

import {
  instantiate,
  cmsInfoDescription,
  cmsInfoManufacturer,
  cmsInfoModel,
  cmsInfoCopyright,
  INTENT_PERCEPTUAL,
  INTENT_RELATIVE_COLORIMETRIC,
  INTENT_SATURATION,
  INTENT_ABSOLUTE_COLORIMETRIC,
  cmsFLAGS_BLACKPOINTCOMPENSATION,
  cmsFLAGS_GAMUTCHECK,
  cmsFLAGS_SOFTPROOFING,
  cmsFLAGS_NOOPTIMIZE,
  cmsFLAGS_HIGHRESPRECALC,
  TYPE_RGB_8,
  TYPE_CMYK_8,
  TYPE_Lab_8,
  TYPE_XYZ_DBL
} from "lcms-wasm";

/**
 * The rendering intents offered by the workbench.
 * @type {ReadonlyArray<{ value: number, label: string, description: string }>}
 */
export const RENDERING_INTENTS = Object.freeze([
  {
    value: INTENT_PERCEPTUAL,
    label: "Perceptual",
    description: "Optimises the appearance of images; may shift colours noticeably."
  },
  {
    value: INTENT_RELATIVE_COLORIMETRIC,
    label: "Relative colorimetric",
    description: "Preserves in-gamut colours; out-of-gamut colours are clipped."
  },
  {
    value: INTENT_SATURATION,
    label: "Saturation",
    description: "Preserves colourfulness; used for charts and graphics."
  },
  {
    value: INTENT_ABSOLUTE_COLORIMETRIC,
    label: "Absolute colorimetric",
    description: "Preserves absolute colorimetry between the source and destination media white points."
  }
]);

/**
 * Map a LittleCMS color space signature to a friendly label.
 *
 * `cmsGetColorSpaceASCII` returns trimmed signatures such as `RGB`, `CMYK`,
 * `GRAY`, `Lab` and `XYZ`.
 *
 * @type {Readonly<Record<string, string>>}
 */
const COLOR_SPACE_LABELS = Object.freeze({
  RGB: "RGB",
  CMYK: "CMYK",
  CMY: "CMY",
  GRAY: "Grayscale",
  Lab: "CIELAB",
  XYZ: "CIE XYZ",
  YCbr: "YCbCr",
  Yxy: "CIE Yxy",
  HSV: "HSV",
  HLS: "HLS"
});

let lcmsInstance = null;
let lcmsPromise = null;

/**
 * Lazily instantiate the LittleCMS WASM runtime.
 *
 * The instance is cached for the lifetime of the page.
 *
 * @param {object} [options] Options.
 * @param {string} [options.wasmUrl] URL of the `.wasm` asset, required in
 *   browser builds where the file is not resolved automatically.
 * @returns {Promise<object>} The LittleCMS module.
 */
export async function getLcms(options = {}) {
  if (lcmsInstance) return lcmsInstance;

  if (!lcmsPromise) {
    const config = options.wasmUrl
      ? { locateFile: () => options.wasmUrl }
      : undefined;
    lcmsPromise = instantiate(config).then((instance) => {
      lcmsInstance = instance;
      return instance;
    });
  }

  return lcmsPromise;
}

/**
 * Reset the cached runtime. Used by tests.
 *
 * @returns {void}
 */
export function resetLcms() {
  lcmsInstance = null;
  lcmsPromise = null;
}

/**
 * Read a profile's metadata.
 *
 * @param {object} lcms The LittleCMS module.
 * @param {number} profile The profile handle.
 * @returns {object} The metadata.
 */
function readMetadata(lcms, profile) {
  const read = (info) => {
    try {
      const value = lcms.cmsGetProfileInfoASCII(profile, info, "en", "US");
      return value && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  };

  let colorSpace = null;
  try {
    colorSpace = lcms.cmsGetColorSpaceASCII(profile);
  } catch {
    colorSpace = null;
  }

  return {
    description: read(cmsInfoDescription),
    manufacturer: read(cmsInfoManufacturer),
    model: read(cmsInfoModel),
    copyright: read(cmsInfoCopyright),
    colorSpace,
    colorSpaceLabel: colorSpace ? COLOR_SPACE_LABELS[colorSpace] ?? colorSpace.trim() : null
  };
}

/**
 * A loaded ICC profile.
 */
export class IccProfile {
  /**
   * @param {object} lcms The LittleCMS module.
   * @param {number} handle The LittleCMS profile handle.
   * @param {Uint8Array} bytes The raw profile bytes.
   * @param {string} filename The originating filename.
   */
  constructor(lcms, handle, bytes, filename) {
    this.lcms = lcms;
    this.handle = handle;
    this.bytes = bytes;
    this.filename = filename;
    this.metadata = readMetadata(lcms, handle);
  }

  /**
   * A short display label for the profile.
   *
   * @returns {string} The label.
   */
  get label() {
    return (
      this.metadata.description ||
      this.metadata.colorSpaceLabel ||
      this.filename ||
      "Unnamed profile"
    );
  }

  /**
   * Release the profile handle.
   *
   * @returns {void}
   */
  close() {
    if (this.handle) {
      try {
        this.lcms.cmsCloseProfile(this.handle);
      } catch {
        // The handle may already be invalid; nothing to do.
      }
      this.handle = 0;
    }
  }
}

/**
 * Load an ICC profile from raw bytes.
 *
 * @param {Uint8Array | ArrayBuffer} data The profile bytes.
 * @param {string} [filename] The originating filename, for display.
 * @param {object} [options] Options.
 * @param {string} [options.wasmUrl] URL of the `.wasm` asset.
 * @returns {Promise<IccProfile>} The loaded profile.
 * @throws {Error} If the profile cannot be parsed.
 */
export async function loadProfile(data, filename = "profile.icc", options = {}) {
  const lcms = await getLcms(options);

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const handle = lcms.cmsOpenProfileFromMem(new Uint8Array(buffer), buffer.byteLength);

  if (!handle) {
    throw new Error(`Could not open "${filename}" as an ICC profile.`);
  }

  return new IccProfile(lcms, handle, bytes, filename);
}

/**
 * The pixel format to use for a given color space.
 *
 * `cmsGetColorSpaceASCII` returns trimmed signatures such as `RGB`, `CMYK`,
 * `Lab` and `XYZ`.
 *
 * @param {string} colorSpace The ICC color space signature.
 * @returns {number} The LittleCMS type constant.
 */
function typeForColorSpace(colorSpace) {
  switch (colorSpace) {
    case "CMYK":
      return TYPE_CMYK_8;
    case "Lab":
      return TYPE_Lab_8;
    case "XYZ":
      return TYPE_XYZ_DBL;
    case "RGB":
    default:
      return TYPE_RGB_8;
  }
}

/**
 * Build transform flags from the user's options.
 *
 * @param {object} options Options.
 * @param {boolean} [options.blackPointCompensation] Apply BPC.
 * @param {boolean} [options.gamutCheck] Perform a gamut check.
 * @returns {number} The flags.
 */
function buildFlags(options = {}) {
  let flags = cmsFLAGS_NOOPTIMIZE | cmsFLAGS_HIGHRESPRECALC;

  if (options.blackPointCompensation) flags |= cmsFLAGS_BLACKPOINTCOMPENSATION;
  if (options.gamutCheck) flags |= cmsFLAGS_GAMUTCHECK;

  return flags;
}

/**
 * Transform a single RGB colour into a destination profile.
 *
 * @param {object} params Parameters.
 * @param {IccProfile} params.source The source profile.
 * @param {IccProfile} params.destination The destination profile.
 * @param {{ r: number, g: number, b: number }} params.rgb The input colour.
 * @param {number} [params.intent] The rendering intent.
 * @param {boolean} [params.blackPointCompensation] Apply BPC.
 * @returns {object} The transformed colour and coverage figures.
 */
export function transformRgbToProfile({
  source,
  destination,
  rgb,
  intent = INTENT_RELATIVE_COLORIMETRIC,
  blackPointCompensation = false
}) {
  const lcms = source.lcms;

  const transform = lcms.cmsCreateTransform(
    source.handle,
    TYPE_RGB_8,
    destination.handle,
    typeForColorSpace(destination.metadata.colorSpace),
    intent,
    buildFlags({ blackPointCompensation })
  );

  if (!transform) {
    throw new Error("Could not create a colour transform for these profiles.");
  }

  try {
    // `cmsDoTransform(transform, input, size)` allocates its own buffers and
    // returns the output array.
    const output = lcms.cmsDoTransform(transform, new Uint8Array([rgb.r, rgb.g, rgb.b]), 1);

    const colorSpace = destination.metadata.colorSpace;

    if (colorSpace === "CMYK") {
      const [c, m, y, k] = output;
      return {
        colorSpace: "CMYK",
        values: { c, m, y, k },
        // Total ink coverage as a calculated sum of the actual separation.
        totalInkCoverage: c + m + y + k
      };
    }

    if (colorSpace === "Lab") {
      const [l, a, b] = output;
      return {
        colorSpace: "Lab",
        values: { L: l, a: a - 128, b: b - 128 }
      };
    }

    return {
      colorSpace: "RGB",
      values: { r: output[0], g: output[1], b: output[2] }
    };
  } finally {
    lcms.cmsDeleteTransform(transform);
  }
}

/**
 * Create a soft-proof transform: the source colour is converted to the
 * output (proof) profile and then rendered as the display profile would show
 * it.
 *
 * LittleCMS signature:
 * `cmsCreateProofingTransform(hInput, inputFormat, hOutput, outputFormat,
 * proofing, intent, proofingIntent, flags)`, where `proofing` is the
 * *display* profile and `proofingIntent` is the intent applied to the
 * proofing transform itself.
 *
 * @param {object} params Parameters.
 * @param {IccProfile} params.source The source profile.
 * @param {IccProfile} params.proof The output profile being proofed.
 * @param {IccProfile} params.display The display profile (usually sRGB).
 * @param {{ r: number, g: number, b: number }} params.rgb The input colour.
 * @param {number} [params.intent] The rendering intent.
 * @param {number} [params.proofingIntent] The intent for the proofing transform.
 * @param {boolean} [params.blackPointCompensation] Apply BPC.
 * @returns {{ r: number, g: number, b: number }} The proofed colour.
 */
export function softProof({
  source,
  proof,
  display,
  rgb,
  intent = INTENT_RELATIVE_COLORIMETRIC,
  proofingIntent = INTENT_RELATIVE_COLORIMETRIC,
  blackPointCompensation = false
}) {
  const lcms = source.lcms;

  const flags = buildFlags({ blackPointCompensation }) | cmsFLAGS_SOFTPROOFING;

  const transform = lcms.cmsCreateProofingTransform(
    source.handle,
    TYPE_RGB_8,
    proof.handle,
    typeForColorSpace(proof.metadata.colorSpace),
    display.handle,
    intent,
    proofingIntent,
    flags
  );

  if (!transform) {
    throw new Error("Could not create a soft-proof transform for these profiles.");
  }

  try {
    const output = lcms.cmsDoTransform(transform, new Uint8Array([rgb.r, rgb.g, rgb.b]), 1);
    return { r: output[0], g: output[1], b: output[2] };
  } finally {
    lcms.cmsDeleteTransform(transform);
  }
}

/**
 * Create a built-in sRGB profile for use as the display profile.
 *
 * @param {object} [options] Options.
 * @param {string} [options.wasmUrl] URL of the `.wasm` asset.
 * @returns {Promise<object>} A profile handle wrapper.
 */
export async function createSrgbProfile(options = {}) {
  const lcms = await getLcms(options);
  const handle = lcms.cmsCreate_sRGBProfile();

  if (!handle) {
    throw new Error("Could not create the built-in sRGB profile.");
  }

  return {
    lcms,
    handle,
    metadata: { colorSpace: "RGB", colorSpaceLabel: "RGB", description: "Built-in sRGB" },
    get label() {
      return "Built-in sRGB";
    },
    close() {
      try {
        lcms.cmsCloseProfile(handle);
      } catch {
        // Nothing to do.
      }
    }
  };
}
