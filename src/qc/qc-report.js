/*
 * ChromaLab — quality-control report model
 *
 * Handles pasted or imported CSV of target and measured Lab values, and
 * produces per-patch difference values plus summary statistics.
 */

import { deltaE76, deltaE00 } from "../color/deltaE.js";

/**
 * The column headers recognised in a QC CSV.
 * @type {ReadonlyArray<string>}
 */
export const SUPPORTED_HEADERS = Object.freeze([
  "patch",
  "label",
  "target_l",
  "target_a",
  "target_b",
  "measured_l",
  "measured_a",
  "measured_b"
]);

/**
 * Split a CSV line into fields, honouring quoted values.
 *
 * @param {string} line The line to split.
 * @returns {string[]} The fields.
 */
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Normalise a header cell to a comparable key.
 *
 * @param {string} header The raw header.
 * @returns {string} The normalised key.
 */
function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * Parse a QC CSV into structured rows.
 *
 * Recognised headers are `patch` (or `label`), `target_l`, `target_a`,
 * `target_b`, `measured_l`, `measured_a`, `measured_b`. Extra columns are
 * ignored. Rows with unparseable numbers are reported rather than silently
 * dropped.
 *
 * @param {string} text The CSV text.
 * @returns {{ rows: object[], errors: string[], skipped: number }} The parse result.
 */
export function parseQcCsv(text) {
  const errors = [];
  const rows = [];
  let skipped = 0;

  if (typeof text !== "string" || text.trim() === "") {
    return { rows, errors: ["The CSV is empty."], skipped };
  }

  const lines = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length < 2) {
    return { rows, errors: ["The CSV needs a header row and at least one data row."], skipped };
  }

  const headerCells = splitCsvLine(lines[0]).map(normalizeHeader);
  const columnIndex = new Map();
  headerCells.forEach((cell, index) => {
    if (cell && !columnIndex.has(cell)) columnIndex.set(cell, index);
  });

  const required = ["target_l", "target_a", "target_b", "measured_l", "measured_a", "measured_b"];
  const missing = required.filter((column) => !columnIndex.has(column));

  if (missing.length > 0) {
    return {
      rows,
      errors: [`The CSV is missing required columns: ${missing.join(", ")}.`],
      skipped
    };
  }

  const labelColumn = columnIndex.has("patch")
    ? columnIndex.get("patch")
    : columnIndex.has("label")
      ? columnIndex.get("label")
      : null;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex]);
    const read = (column) => {
      const index = columnIndex.get(column);
      if (index === undefined || index >= cells.length) return NaN;
      return Number(cells[index]);
    };

    const target = { L: read("target_l"), a: read("target_a"), b: read("target_b") };
    const measured = { L: read("measured_l"), a: read("measured_a"), b: read("measured_b") };

    const values = [target.L, target.a, target.b, measured.L, measured.a, measured.b];

    if (values.some((value) => !Number.isFinite(value))) {
      skipped += 1;
      errors.push(`Line ${lineIndex + 1}: could not read all six Lab values.`);
      continue;
    }

    const label =
      labelColumn !== null && labelColumn < cells.length && cells[labelColumn] !== ""
        ? cells[labelColumn]
        : `Patch ${lineIndex}`;

    rows.push({ patch: label, target, measured });
  }

  return { rows, errors, skipped };
}

/**
 * Build a quality-control report from parsed rows.
 *
 * @param {object[]} rows Rows as produced by {@link parseQcCsv}.
 * @param {object} [options] Options.
 * @param {number} [options.tolerance] The user-set pass/fail tolerance. When
 *   omitted no pass/fail verdict is produced.
 * @returns {object} The report.
 */
export function buildQcReport(rows, options = {}) {
  const { tolerance } = options;

  const patches = rows.map((row) => {
    const dE76 = deltaE76(row.target, row.measured);
    const dE00Value = deltaE00(row.target, row.measured);

    const patch = {
      patch: row.patch,
      target: row.target,
      measured: row.measured,
      deltaE76: dE76,
      deltaE00: dE00Value
    };

    if (Number.isFinite(tolerance)) {
      patch.withinTolerance = dE00Value <= tolerance;
    }

    return patch;
  });

  const differences = patches.map((patch) => patch.deltaE00);

  const summary = {
    patchCount: patches.length,
    meanDeltaE00: 0,
    maxDeltaE00: 0,
    minDeltaE00: 0,
    meanDeltaE76: 0,
    maxDeltaE76: 0
  };

  if (patches.length > 0) {
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

    summary.meanDeltaE00 = mean(differences);
    summary.maxDeltaE00 = Math.max(...differences);
    summary.minDeltaE00 = Math.min(...differences);
    summary.meanDeltaE76 = mean(patches.map((patch) => patch.deltaE76));
    summary.maxDeltaE76 = Math.max(...patches.map((patch) => patch.deltaE76));
  }

  if (Number.isFinite(tolerance)) {
    const failing = patches.filter((patch) => !patch.withinTolerance);
    summary.tolerance = tolerance;
    summary.withinToleranceCount = patches.length - failing.length;
    summary.failingCount = failing.length;
    summary.pass = failing.length === 0;
  }

  return { patches, summary };
}
