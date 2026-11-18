/*
 * ChromaLab — print production workflow
 *
 * Holds the CMYK separation and total-ink-coverage logic, and the print
 * condition workspace. No ICC profile handling happens here; that lives in
 * icc-adapter.js.
 */

/**
 * The measurement condition modes defined by ISO 5-3.
 * @type {ReadonlyArray<{ value: string, label: string, description: string }>}
 */
export const MEASUREMENT_CONDITIONS = Object.freeze([
  {
    value: "M0",
    label: "M0 — unpolarized, 45/0°",
    description:
      "Standard for reflective print measurements. Applicable when optical brighteners are not a factor."
  },
  {
    value: "M1",
    label: "M1 — polarized, 45/0°",
    description:
      "Required for papers containing optical brighteners, whose fluorescence affects the measurement."
  },
  {
    value: "M2",
    label: "M2 — UV excluded, 45/0°",
    description: "UV is excluded from the measurement."
  },
  {
    value: "M3",
    label: "M3 — polarization excluded, 45/0°",
    description: "Polarization is excluded from the measurement."
  }
]);

/**
 * The printing processes the workbench can describe.
 * @type {ReadonlyArray<string>}
 */
export const PRINT_PROCESSES = Object.freeze([
  "Sheet-fed offset",
  "Web offset",
  "Flexographic",
  "Gravure",
  "Digital printing",
  "Screen printing",
  "Other"
]);

/**
 * The finishing operations the workbench can describe.
 * @type {ReadonlyArray<string>}
 */
export const FINISHING_OPERATIONS = Object.freeze([
  "None",
  "Matt lamination",
  "Gloss lamination",
  "Matt varnish",
  "Gloss varnish",
  "Soft-touch varnish",
  "Embossing",
  "Foil stamping",
  "Die-cutting"
]);

/**
 * A blank print-condition record.
 *
 * @returns {object} The record.
 */
export function createPrintCondition() {
  return {
    name: "",
    stock: "",
    process: "",
    finishing: "None",
    measurementCondition: "M0",
    backing: "",
    instrument: "",
    notes: ""
  };
}

/**
 * Calculate the total ink coverage of a CMYK separation.
 *
 * This is a straight sum of the actual separation percentages. It is a
 * calculated figure, not a limit: compare it only against a limit the
 * operator sets or against documented profile/process data.
 *
 * @param {{ c: number, m: number, y: number, k: number }} cmyk The separation.
 * @returns {number} The total ink coverage in percent.
 */
export function calculateTotalInkCoverage(cmyk) {
  const channels = ["c", "m", "y", "k"];
  return channels.reduce((sum, channel) => {
    const value = Number(cmyk[channel]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

/**
 * Compare a total ink coverage against an operator-supplied limit.
 *
 * @param {number} totalInkCoverage The calculated coverage.
 * @param {number | null | undefined} limit The operator's limit, in percent.
 * @returns {{ hasLimit: boolean, withinLimit: boolean | null, excess: number, limit: number | null }}
 *   The comparison.
 */
export function checkTotalInkCoverage(totalInkCoverage, limit) {
  if (!Number.isFinite(limit)) {
    return { hasLimit: false, withinLimit: null, excess: 0, limit: null };
  }

  return {
    hasLimit: true,
    withinLimit: totalInkCoverage <= limit,
    excess: Math.max(0, totalInkCoverage - limit),
    limit
  };
}

/**
 * Format a CMYK separation for display.
 *
 * @param {{ c: number, m: number, y: number, k: number }} cmyk The separation.
 * @returns {string} The formatted separation.
 */
export function formatCmyk(cmyk) {
  const pct = (value) => `${Math.round(value)}%`;
  return `${pct(cmyk.c)} ${pct(cmyk.m)} ${pct(cmyk.y)} ${pct(cmyk.k)}`;
}

/**
 * Describe the provenance of a CMYK result.
 *
 * The result depends on the profiles, the rendering intent, the CMM and the
 * options in force. This text is shown alongside the numbers so the values
 * are never read as intrinsic to the colour.
 *
 * @param {object} params Parameters.
 * @param {string} params.sourceProfile The source profile label.
 * @param {string} params.destinationProfile The destination profile label.
 * @param {string} params.intent The rendering intent label.
 * @param {boolean} params.blackPointCompensation Whether BPC was applied.
 * @returns {string} The description.
 */
export function describeSeparationProvenance({
  sourceProfile,
  destinationProfile,
  intent,
  blackPointCompensation
}) {
  const parts = [
    `Source profile: ${sourceProfile}`,
    `Destination profile: ${destinationProfile}`,
    `Rendering intent: ${intent}`,
    `Black-point compensation: ${blackPointCompensation ? "on" : "off"}`
  ];

  return `${parts.join(" · ")}. This separation is defined by those inputs; CMYK is not a universal colour space.`;
}
