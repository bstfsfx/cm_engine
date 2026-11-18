/*
 * ChromaLab — QC and print-workflow tests
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseQcCsv, buildQcReport } from "../src/qc/qc-report.js";
import {
  calculateTotalInkCoverage,
  checkTotalInkCoverage,
  formatCmyk,
  createPrintCondition,
  MEASUREMENT_CONDITIONS
} from "../src/print/print-workflow.js";
import { validateRgb, validateLab, validateLch, validateTacLimit } from "../src/utils/validation.js";

test("parses a well-formed QC CSV", () => {
  const csv = [
    "patch,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "P1,50.0,10.0,-20.0,50.5,10.2,-19.8",
    "P2,60.0,-5.0,25.0,59.8,-4.9,25.1"
  ].join("\n");

  const { rows, errors, skipped } = parseQcCsv(csv);

  assert.equal(errors.length, 0);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].patch, "P1");
  assert.equal(rows[0].target.L, 50);
  assert.equal(rows[0].measured.b, -19.8);
});

test("reports missing required columns", () => {
  const csv = "patch,target_l\nP1,50";
  const { rows, errors } = parseQcCsv(csv);

  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing required columns/);
});

test("reports unparseable rows instead of dropping them silently", () => {
  const csv = [
    "patch,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "P1,50,10,-20,50,10,not-a-number",
    "P2,60,-5,25,59,-4,25"
  ].join("\n");

  const { rows, errors, skipped } = parseQcCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Line 2/);
});

test("handles quoted CSV fields", () => {
  const csv = [
    '"patch",target_l,target_a,target_b,measured_l,measured_a,measured_b',
    '"Patch, one",50,10,-20,50,10,-20'
  ].join("\n");

  const { rows, errors } = parseQcCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].patch, "Patch, one");
});

test("accepts an alternate label column", () => {
  const csv = [
    "label,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "Solid 40,50,10,-20,50,10,-20"
  ].join("\n");

  const { rows } = parseQcCsv(csv);
  assert.equal(rows[0].patch, "Solid 40");
});

test("rejects an empty CSV", () => {
  const { errors } = parseQcCsv("   ");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /empty/);
});

test("builds a QC report with per-patch differences and summary statistics", () => {
  const csv = [
    "patch,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "P1,50,10,-20,50,10,-20",
    "P2,60,-5,25,62,-7,27"
  ].join("\n");

  const { rows } = parseQcCsv(csv);
  const report = buildQcReport(rows);

  assert.equal(report.patches.length, 2);
  assert.equal(report.patches[0].deltaE00, 0);
  assert.ok(report.patches[1].deltaE00 > 0);
  assert.equal(report.summary.patchCount, 2);
  assert.equal(report.summary.maxDeltaE00, report.patches[1].deltaE00);
  assert.ok(report.summary.meanDeltaE00 > 0);
});

test("applies a user-set tolerance to produce a pass/fail verdict", () => {
  const csv = [
    "patch,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "P1,50,10,-20,50,10,-20",
    "P2,60,-5,25,62,-7,27"
  ].join("\n");

  const { rows } = parseQcReportFixture(csv);

  const strict = buildQcReport(rows, { tolerance: 1 });
  const lenient = buildQcReport(rows, { tolerance: 10 });

  assert.equal(strict.summary.fail, undefined);
  assert.equal(strict.summary.withinToleranceCount, 1);
  assert.equal(strict.summary.failingCount, 1);
  assert.equal(strict.summary.pass, false);

  assert.equal(lenient.summary.withinToleranceCount, 2);
  assert.equal(lenient.summary.failingCount, 0);
  assert.equal(lenient.summary.pass, true);
});

test("omits the pass/fail verdict when no tolerance is set", () => {
  const csv = [
    "patch,target_l,target_a,target_b,measured_l,measured_a,measured_b",
    "P1,50,10,-20,50,10,-20"
  ].join("\n");

  const { rows } = parseQcReportFixture(csv);
  const report = buildQcReport(rows);

  assert.equal(report.summary.pass, undefined);
  assert.equal(report.summary.tolerance, undefined);
});

/** Helper to parse a QC CSV fixture. */
function parseQcReportFixture(csv) {
  return parseQcCsv(csv);
}

test("total ink coverage is the calculated sum of the separation", () => {
  assert.equal(calculateTotalInkCoverage({ c: 0, m: 100, y: 100, k: 0 }), 200);
  assert.equal(calculateTotalInkCoverage({ c: 25, m: 25, y: 25, k: 25 }), 100);
  assert.equal(calculateTotalInkCoverage({ c: 0, m: 0, y: 0, k: 0 }), 0);
});

test("total ink coverage ignores non-numeric channels", () => {
  assert.equal(calculateTotalInkCoverage({ c: 10, m: NaN, y: 10, k: undefined }), 20);
});

test("ink coverage is only compared against an explicit limit", () => {
  const withoutLimit = checkTotalInkCoverage(320, null);
  assert.equal(withoutLimit.hasLimit, false);
  assert.equal(withoutLimit.withinLimit, null);

  const withLimit = checkTotalInkCoverage(320, 300);
  assert.equal(withLimit.hasLimit, true);
  assert.equal(withLimit.withinLimit, false);
  assert.equal(withLimit.excess, 20);

  const underLimit = checkTotalInkCoverage(280, 300);
  assert.equal(underLimit.withinLimit, true);
  assert.equal(underLimit.excess, 0);
});

test("formats a CMYK separation", () => {
  assert.equal(formatCmyk({ c: 0, m: 91, y: 76, k: 5 }), "0% 91% 76% 5%");
});

test("a new print condition has safe defaults", () => {
  const condition = createPrintCondition();
  assert.equal(condition.measurementCondition, "M0");
  assert.equal(condition.finishing, "None");
  assert.equal(condition.name, "");
});

test("measurement conditions include M0 and M1", () => {
  const values = MEASUREMENT_CONDITIONS.map((entry) => entry.value);
  assert.ok(values.includes("M0"));
  assert.ok(values.includes("M1"));
});

test("RGB validation rejects out-of-range and non-integer channels", () => {
  assert.equal(validateRgb({ r: 0, g: 128, b: 255 }).valid, true);
  assert.equal(validateRgb({ r: 300, g: 0, b: 0 }).valid, false);
  assert.equal(validateRgb({ r: -1, g: 0, b: 0 }).valid, false);
  assert.equal(validateRgb({ r: 12.5, g: 0, b: 0 }).valid, false);
  assert.equal(validateRgb(null).valid, false);
});

test("Lab validation enforces the L* range", () => {
  assert.equal(validateLab({ L: 50, a: 10, b: -20 }).valid, true);
  assert.equal(validateLab({ L: 150, a: 10, b: -20 }).valid, false);
  assert.equal(validateLab({ L: -1, a: 10, b: -20 }).valid, false);
  assert.equal(validateLab({ L: NaN, a: 10, b: -20 }).valid, false);
});

test("LCh validation enforces chroma and hue ranges", () => {
  assert.equal(validateLch({ L: 50, C: 30, h: 180 }).valid, true);
  assert.equal(validateLch({ L: 50, C: -1, h: 180 }).valid, false);
  assert.equal(validateLch({ L: 50, C: 30, h: 400 }).valid, false);
  assert.equal(validateLch({ L: 50, C: 30, h: 360 }).valid, false);
});

test("total ink coverage limits must be supplied by the operator", () => {
  assert.equal(validateTacLimit("300").valid, true);
  assert.equal(validateTacLimit("").valid, false);
  assert.equal(validateTacLimit("abc").valid, false);
  assert.equal(validateTacLimit("-5").valid, false);
  assert.equal(validateTacLimit("0").valid, false);
});
