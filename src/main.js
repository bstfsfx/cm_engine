/*
 * ChromaLab — browser interaction and rendering
 *
 * This module wires the DOM to the engine. It contains no colour formulas:
 * every calculation comes from src/color, src/print or src/qc.
 */

import {
  rgbToLab,
  labToRgb,
  rgbToLch,
  lchToRgb,
  rgbToHex,
  hexToRgb,
  rgbToXyz,
  checkXyzGamut,
  deltaE76,
  deltaE2000
} from "./color/color.js";
import {
  validateRgb,
  validateLab,
  validateLch,
  validateTacLimit,
  parseNumber
} from "./utils/validation.js";
import {
  parseQcCsv,
  buildQcReport
} from "./qc/qc-report.js";
import {
  calculateTotalInkCoverage,
  checkTotalInkCoverage,
  formatCmyk,
  describeSeparationProvenance,
  createPrintCondition,
  MEASUREMENT_CONDITIONS,
  PRINT_PROCESSES,
  FINISHING_OPERATIONS
} from "./print/print-workflow.js";
import {
  RENDERING_INTENTS,
  loadProfile,
  createSrgbProfile,
  transformRgbToProfile,
  softProof
} from "./print/icc-adapter.js";

/* ─────────────────────────── Element lookup ─────────────────────────── */

const $ = (id) => document.getElementById(id);

/** Update a banner chip only when that banner is present in the document. */
function setChip(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

/* ─────────────────────────── Application state ─────────────────────────── */

/**
 * All mutable workbench state. Kept in one place so the render functions
 * stay pure with respect to it.
 */
const state = {
  inputSpace: "rgb",
  /** @type {{ r: number, g: number, b: number } | null} */
  sampleRgb: { r: 255, g: 0, b: 0 },
  /** @type {{ r: number, g: number, b: number } | null} */
  compareRgb: { r: 0, g: 255, b: 0 },
  whitePoint: "D65",

  /** @type {Map<string, object>} Loaded profiles, keyed by filename. */
  profiles: new Map(),
  sourceProfileKey: "",
  destinationProfileKey: "",
  srgbProfile: null,

  intent: RENDERING_INTENTS[1].value,
  blackPointCompensation: false,

  printCondition: createPrintCondition()
};

/* ─────────────────────────── Panel navigation ─────────────────────────── */

const PANEL_TITLES = {
  conversion: "Conversion",
  print: "Print separation",
  qc: "Quality control",
  references: "Standards & limits"
};

function initTabs() {
  const links = document.querySelectorAll(".nav-link[data-panel]");
  const panels = document.querySelectorAll(".panel[data-panel]");
  const crumb = document.getElementById("crumb-current");
  const rail = document.querySelector(".rail");
  const side = document.querySelector(".side");

  function showPanel(name) {
    if (rail) rail.dataset.active = name;
    if (side) side.dataset.active = name;

    links.forEach((link) => {
      const active = link.dataset.panel === name;
      link.classList.toggle("on", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });

    if (crumb) crumb.textContent = PANEL_TITLES[name] ?? name;

    const main = document.querySelector(".main");
    if (main) main.scrollTop = 0;

    if (location.hash !== `#${name}`) {
      history.replaceState(null, "", `#${name}`);
    }
  }

  links.forEach((link) => {
    link.addEventListener("click", () => showPanel(link.dataset.panel));
  });

  window.addEventListener("hashchange", () => {
    const name = location.hash.slice(1);
    if (name in PANEL_TITLES) showPanel(name);
  });

  const initial = location.hash.slice(1);
  showPanel(initial in PANEL_TITLES ? initial : "conversion");
}

/* ─────────────────────────── Input space switch ─────────────────────────── */

function initInputSpace() {
  const chips = document.querySelectorAll("[data-input-space]");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.inputSpace = chip.dataset.inputSpace;

      chips.forEach((other) => {
        const active = other === chip;
        other.classList.toggle("chip--active", active);
        other.setAttribute("aria-checked", String(active));
      });

      document.querySelectorAll(".fields[data-space]").forEach((group) => {
        group.hidden = group.dataset.space !== state.inputSpace;
      });

      // Seed the alternate space from the current sample so switching is
      // lossless rather than starting from stale values.
      if (state.inputSpace === "lab") syncLabInputsFromSample();
      if (state.inputSpace === "lch") syncLchInputsFromSample();

      renderAll();
    });
  });
}

function syncLabInputsFromSample() {
  if (!state.sampleRgb) return;
  const lab = rgbToLab(state.sampleRgb, state.whitePoint);
  $("in-l").value = lab.L.toFixed(2);
  $("in-a").value = lab.a.toFixed(2);
  $("in-b-lab").value = lab.b.toFixed(2);
}

function syncLchInputsFromSample() {
  if (!state.sampleRgb) return;
  const lch = rgbToLch(state.sampleRgb, state.whitePoint);
  $("in-lch-l").value = lch.L.toFixed(2);
  $("in-c").value = lch.C.toFixed(2);
  $("in-h").value = lch.h.toFixed(2);
}

/* ─────────────────────────── Sample input ─────────────────────────── */

function showInputError(message) {
  const element = $("input-error");
  if (!message) {
    element.hidden = true;
    element.textContent = "";
    return;
  }
  element.hidden = false;
  element.textContent = message;
}

function readSampleInput() {
  if (state.inputSpace === "rgb") {
    const rgb = {
      r: parseNumber($("in-r").value),
      g: parseNumber($("in-g").value),
      b: parseNumber($("in-b").value)
    };

    const result = validateRgb(rgb);
    if (!result.valid) {
      showInputError(result.errors.join(" "));
      return false;
    }

    showInputError("");
    state.sampleRgb = result.value;
    $("in-hex").value = rgbToHex(result.value);
    return true;
  }

  if (state.inputSpace === "lab") {
    const lab = {
      L: parseNumber($("in-l").value),
      a: parseNumber($("in-a").value),
      b: parseNumber($("in-b-lab").value)
    };

    const result = validateLab(lab);
    if (!result.valid) {
      showInputError(result.errors.join(" "));
      return false;
    }

    showInputError("");
    state.sampleRgb = labToRgb(result.value, state.whitePoint);
    return true;
  }

  const lch = {
    L: parseNumber($("in-lch-l").value),
    C: parseNumber($("in-c").value),
    h: parseNumber($("in-h").value)
  };

  const result = validateLch(lch);
  if (!result.valid) {
    showInputError(result.errors.join(" "));
    return false;
  }

  showInputError("");
  state.sampleRgb = lchToRgb(result.value, state.whitePoint);
  return true;
}

function initSampleInputs() {
  ["in-r", "in-g", "in-b", "in-l", "in-a", "in-b-lab", "in-lch-l", "in-c", "in-h"].forEach((id) => {
    $(id).addEventListener("input", () => {
      readSampleInput();
      renderAll();
    });
  });

  $("in-hex").addEventListener("input", () => {
    try {
      const rgb = hexToRgb($("in-hex").value);
      $("in-r").value = rgb.r;
      $("in-g").value = rgb.g;
      $("in-b").value = rgb.b;
      state.sampleRgb = rgb;
      showInputError("");
      renderAll();
    } catch {
      showInputError("Enter a hex colour such as #FF0000.");
    }
  });

  $("white-point").addEventListener("change", () => {
    state.whitePoint = $("white-point").value;
    renderAll();
  });

  $("compare-hex").addEventListener("input", () => {
    try {
      state.compareRgb = hexToRgb($("compare-hex").value);
      renderComparison();
    } catch {
      /* Leave the previous comparison colour in place until it parses. */
    }
  });
}

/* ─────────────────────────── Rendering ─────────────────────────── */

function renderSwatch() {
  if (!state.sampleRgb) return;

  const hex = rgbToHex(state.sampleRgb);
  $("swatch").style.backgroundColor = hex;
  $("swatch-hex").textContent = hex;

  const gamut = checkXyzGamut(rgbToXyz(state.sampleRgb, state.whitePoint));
  const badge = $("gamut-badge");

  if (gamut.inGamut) {
    badge.textContent = "In gamut";
    badge.className = "badge badge--ok";
  } else {
    const channels = gamut.outOfGamutChannels.map((c) => c.toUpperCase()).join(", ");
    badge.textContent = `Clipped: ${channels}`;
    badge.className = "badge badge--warn";
  }
}

function renderResults() {
  if (!state.sampleRgb) return;

  const rgb = state.sampleRgb;
  const xyz = rgbToXyz(rgb, state.whitePoint);
  const lab = rgbToLab(rgb, state.whitePoint);
  const lch = rgbToLch(rgb, state.whitePoint);

  const rows = [
    {
      space: "sRGB",
      values: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      reference: "8-bit, D65"
    },
    {
      space: "HEX",
      values: rgbToHex(rgb),
      reference: "8-bit, D65"
    },
    {
      space: "CIE XYZ",
      values: `${xyz.X.toFixed(4)}, ${xyz.Y.toFixed(4)}, ${xyz.Z.toFixed(4)}`,
      reference: `Y normalised, ${state.whitePoint}`
    },
    {
      space: "CIELAB",
      values: `${lab.L.toFixed(2)}, ${lab.a.toFixed(2)}, ${lab.b.toFixed(2)}`,
      reference: `${state.whitePoint}, 2° observer`
    },
    {
      space: "CIELCh",
      values: `${lch.L.toFixed(2)}, ${lch.C.toFixed(2)}, ${lch.h.toFixed(2)}°`,
      reference: `${state.whitePoint}, 2° observer`
    }
  ];

  $("results-body").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.space}</td>
          <td class="values">${row.values}</td>
          <td class="reference">${row.reference}</td>
        </tr>`
    )
    .join("");
}

function renderComparison() {
  if (!state.sampleRgb || !state.compareRgb) return;

  const a = state.sampleRgb;
  const b = state.compareRgb;

  $("swatch-a").style.backgroundColor = rgbToHex(a);
  $("swatch-b").style.backgroundColor = rgbToHex(b);
  $("compare-a-label").textContent = `A ${rgbToHex(a)}`;
  $("compare-b-label").textContent = `B ${rgbToHex(b)}`;

  const labA = rgbToLab(a, state.whitePoint);
  const labB = rgbToLab(b, state.whitePoint);

  const dE76 = deltaE76(labA, labB);
  const dE00 = deltaE2000(labA, labB);

  $("delta-list").innerHTML = `
    <div><dt>ΔE76</dt><dd>${dE76.toFixed(3)}</dd></div>
    <div><dt>ΔE00</dt><dd>${dE00.toFixed(3)}</dd></div>
    <div><dt>Reference</dt><dd>${state.whitePoint}</dd></div>
  `;
}

/** Keep the banner chips and status bar in step with the workbench state. */
function updateChrome() {
  if (state.sampleRgb) {
    setChip("hero-white", state.whitePoint);
    setChip("hero-sample", rgbToHex(state.sampleRgb));
    setChip("status-white", `${state.whitePoint} / 2°`);
  }

  const source = getSourceProfile();
  const destination = state.profiles.get(state.destinationProfileKey) ?? null;

  setChip("hero-source", source?.label ?? "Not loaded");
  setChip("hero-destination", destination?.label ?? "Not loaded");
  setChip(
    "hero-intent",
    RENDERING_INTENTS.find((entry) => entry.value === state.intent)?.label ?? "—"
  );

  const tacBlock = $("tac-block");
  setChip("hero-tac", tacBlock && !tacBlock.hidden ? $("tac-value").textContent : "—");

  const sourceSelect = $("source-profile");
  setChip("status-profile", sourceSelect?.selectedOptions[0]?.textContent ?? "Built-in sRGB");
}

function renderAll() {
  renderSwatch();
  renderResults();
  renderComparison();
  renderPrint();
  updateChrome();
}

/* ─────────────────────────── Copy actions ─────────────────────────── */

function buildResultsPayload() {
  const rgb = state.sampleRgb;
  const xyz = rgbToXyz(rgb, state.whitePoint);
  const lab = rgbToLab(rgb, state.whitePoint);
  const lch = rgbToLch(rgb, state.whitePoint);

  return {
    sRGB: rgb,
    hex: rgbToHex(rgb),
    XYZ: xyz,
    CIELAB: lab,
    CIELCh: lch,
    assumptions: {
      referenceWhite: state.whitePoint,
      observer: "CIE 1931 2° standard observer",
      adaptation: "Bradford CAT",
      note: "Calculated colorimetry, not a physical measurement."
    }
  };
}

async function copyToClipboard(text, label) {
  const feedback = $("copy-feedback");
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = `${label} copied`;
  } catch {
    feedback.textContent = "Could not access the clipboard";
  }
  setTimeout(() => {
    feedback.textContent = "";
  }, 2200);
}

function initCopyActions() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const payload = buildResultsPayload();
      const mode = button.dataset.copy;

      if (mode === "csv") {
        const { sRGB, hex, XYZ, CIELAB, CIELCh } = payload;
        const csv = [
          "space,values,reference_white",
          `"sRGB","${sRGB.r} ${sRGB.g} ${sRGB.b}",${state.whitePoint}`,
          `"HEX","${hex}",${state.whitePoint}`,
          `"XYZ","${XYZ.X.toFixed(6)} ${XYZ.Y.toFixed(6)} ${XYZ.Z.toFixed(6)}",${state.whitePoint}`,
          `"CIELAB","${CIELAB.L.toFixed(4)} ${CIELAB.a.toFixed(4)} ${CIELAB.b.toFixed(4)}",${state.whitePoint}`,
          `"CIELCh","${CIELCh.L.toFixed(4)} ${CIELCh.C.toFixed(4)} ${CIELCh.h.toFixed(4)}",${state.whitePoint}`
        ].join("\n");
        copyToClipboard(csv, "CSV");
        return;
      }

      if (mode === "json") {
        copyToClipboard(JSON.stringify(payload, null, 2), "JSON");
        return;
      }

      const lines = [
        `sRGB      ${payload.sRGB.r}, ${payload.sRGB.g}, ${payload.sRGB.b}`,
        `HEX       ${payload.hex}`,
        `XYZ       ${payload.XYZ.X.toFixed(6)}, ${payload.XYZ.Y.toFixed(6)}, ${payload.XYZ.Z.toFixed(6)}`,
        `CIELAB    ${payload.CIELAB.L.toFixed(3)}, ${payload.CIELAB.a.toFixed(3)}, ${payload.CIELAB.b.toFixed(3)}`,
        `CIELCh    ${payload.CIELCh.L.toFixed(3)}, ${payload.CIELCh.C.toFixed(3)}, ${payload.CIELCh.h.toFixed(3)}`,
        `Reference ${state.whitePoint}, CIE 1931 2° observer, Bradford CAT`,
        `Note      Calculated colorimetry, not a physical measurement.`
      ];
      copyToClipboard(lines.join("\n"), "Results");
    });
  });
}

/* ─────────────────────────── Print panel ─────────────────────────── */

function initPrintControls() {
  const intentSelect = $("rendering-intent");
  RENDERING_INTENTS.forEach((intent) => {
    const option = document.createElement("option");
    option.value = String(intent.value);
    option.textContent = intent.label;
    intentSelect.append(option);
  });
  intentSelect.value = String(state.intent);
  updateIntentHint();

  intentSelect.addEventListener("change", () => {
    state.intent = Number(intentSelect.value);
    updateIntentHint();
    renderPrint();
  });

  $("bpc").addEventListener("change", () => {
    state.blackPointCompensation = $("bpc").checked;
    renderPrint();
  });

  $("tac-limit").addEventListener("input", () => renderPrint());

  $("source-profile").addEventListener("change", () => {
    state.sourceProfileKey = $("source-profile").value;
    renderPrint();
  });

  $("destination-profile").addEventListener("change", () => {
    state.destinationProfileKey = $("destination-profile").value;
    renderPrint();
    renderProfileMetadata();
  });

  $("profile-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const status = $("profile-status");
    status.textContent = `Reading ${file.name}…`;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const profile = await loadProfile(bytes, file.name);
      state.profiles.set(file.name, profile);
      refreshProfileSelectors();
      status.textContent = `Loaded ${file.name}. The profile stays in this browser session only.`;
      renderProfileMetadata();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      event.target.value = "";
    }
  });

  const processSelect = $("condition-process");
  PRINT_PROCESSES.forEach((process) => {
    const option = document.createElement("option");
    option.value = process;
    option.textContent = process;
    processSelect.append(option);
  });

  const finishingSelect = $("condition-finishing");
  FINISHING_OPERATIONS.forEach((finishing) => {
    const option = document.createElement("option");
    option.value = finishing;
    option.textContent = finishing;
    finishingSelect.append(option);
  });

  const measurementSelect = $("condition-measurement");
  MEASUREMENT_CONDITIONS.forEach((condition) => {
    const option = document.createElement("option");
    option.value = condition.value;
    option.textContent = condition.label;
    measurementSelect.append(option);
  });
}

function updateIntentHint() {
  const intent = RENDERING_INTENTS.find((entry) => entry.value === state.intent);
  $("intent-hint").textContent = intent ? intent.description : "";
}

function refreshProfileSelectors() {
  const source = $("source-profile");
  const destination = $("destination-profile");

  const previousSource = state.sourceProfileKey;
  const previousDestination = state.destinationProfileKey;

  source.innerHTML = "";
  destination.innerHTML = "";

  const sourceOption = document.createElement("option");
  sourceOption.value = "";
  sourceOption.textContent = state.srgbProfile ? "Built-in sRGB" : "None loaded";
  source.append(sourceOption);

  const destinationOption = document.createElement("option");
  destinationOption.value = "";
  destinationOption.textContent = "None loaded";
  destination.append(destinationOption);

  for (const [key, profile] of state.profiles) {
    const label = `${profile.label} (${profile.metadata.colorSpaceLabel ?? "?"})`;

    const sourceEntry = document.createElement("option");
    sourceEntry.value = key;
    sourceEntry.textContent = label;
    source.append(sourceEntry);

    const destinationEntry = document.createElement("option");
    destinationEntry.value = key;
    destinationEntry.textContent = label;
    destination.append(destinationEntry);
  }

  state.sourceProfileKey = source.querySelector(`option[value="${previousSource}"]`)
    ? previousSource
    : "";
  state.destinationProfileKey = destination.querySelector(`option[value="${previousDestination}"]`)
    ? previousDestination
    : "";

  source.value = state.sourceProfileKey;
  destination.value = state.destinationProfileKey;
}

function renderProfileMetadata() {
  const key = state.destinationProfileKey || state.sourceProfileKey;
  const profile = state.profiles.get(key);
  const container = $("profile-meta");

  if (!profile) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  const entries = [
    ["Description", profile.metadata.description],
    ["Colour space", profile.metadata.colorSpaceLabel],
    ["Manufacturer", profile.metadata.manufacturer],
    ["Model", profile.metadata.model],
    ["Copyright", profile.metadata.copyright]
  ].filter(([, value]) => value);

  $("profile-meta-list").innerHTML = entries
    .map(
      ([label, value]) => `
        <div>
          <dt>${label}</dt>
          <dd>${escapeHtml(String(value))}</dd>
        </div>`
    )
    .join("");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSourceProfile() {
  if (state.sourceProfileKey) {
    return state.profiles.get(state.sourceProfileKey) ?? null;
  }
  return state.srgbProfile;
}

function renderPrintCore() {
  const separation = $("separation");
  const tacBlock = $("tac-block");
  const provenance = $("provenance");
  const source = getSourceProfile();
  const destination = state.profiles.get(state.destinationProfileKey) ?? null;

  if (!state.sampleRgb) return;

  if (!source || !destination) {
    separation.hidden = true;
    tacBlock.hidden = true;
    provenance.textContent = source
      ? "Load an output profile to see a separation. The built-in sRGB source is active."
      : "Load a source profile and an output profile to see a separation.";
    return;
  }

  let result;
  try {
    result = transformRgbToProfile({
      source,
      destination,
      rgb: state.sampleRgb,
      intent: state.intent,
      blackPointCompensation: state.blackPointCompensation
    });
  } catch (error) {
    separation.hidden = true;
    tacBlock.hidden = true;
    provenance.textContent = error.message;
    return;
  }

  if (result.colorSpace !== "CMYK") {
    separation.hidden = true;
    tacBlock.hidden = true;
    provenance.textContent = `The output profile describes a ${result.colorSpace} space. Total ink coverage applies to CMYK separations.`;
    return;
  }

  const cmyk = result.values;
  separation.hidden = false;
  tacBlock.hidden = false;

  $("separation-source").textContent = `${formatCmyk(cmyk)} — calculated separation`;

  // Scale the bars against the total ink coverage so that channels above
  // 100% remain distinguishable from each other. A channel bar is always
  // relative to the whole separation.
  const total = calculateTotalInkCoverage(cmyk);
  const scale = total > 0 ? total : 1;

  ["c", "m", "y", "k"].forEach((channel) => {
    const value = cmyk[channel];
    $(`ink-${channel}`).style.width = `${(value / scale) * 100}%`;
    $(`ink-${channel}-value`).textContent = `${Math.round(value)}%`;
  });

  $("tac-value").textContent = `${total.toFixed(1)}%`;

  const limitResult = validateTacLimit($("tac-limit").value);
  const verdict = $("tac-verdict");

  if (!limitResult.valid && $("tac-limit").value.trim() !== "") {
    verdict.textContent = limitResult.errors.join(" ");
    verdict.className = "tac__value tac__value--fail";
  } else {
    const comparison = checkTotalInkCoverage(total, limitResult.valid ? limitResult.value : null);
    verdict.textContent = comparison.hasLimit
      ? `${comparison.withinLimit ? "Within" : "Over"} your ${comparison.limit}% limit`
      : "No limit set";
    verdict.className = comparison.hasLimit
      ? `tac__value tac__value--${comparison.withinLimit ? "pass" : "fail"}`
      : "tac__value";
  }

  const intentLabel =
    RENDERING_INTENTS.find((entry) => entry.value === state.intent)?.label ?? "Unknown";

  provenance.textContent = describeSeparationProvenance({
    sourceProfile: source.label,
    destinationProfile: destination.label,
    intent: intentLabel,
    blackPointCompensation: state.blackPointCompensation
  });
}

function renderPrint() {
  renderPrintCore();
  updateChrome();
}

/* ─────────────────────────── QC panel ─────────────────────────── */

const QC_SAMPLE = `patch,target_l,target_a,target_b,measured_l,measured_a,measured_b
P1,50.0,10.0,-20.0,50.4,10.3,-19.9
P2,60.0,-5.0,25.0,60.3,-5.2,25.1
P3,42.0,35.0,12.0,43.6,37.2,14.9
P4,90.0,-2.0,-3.0,90.2,-2.1,-3.1
P5,25.0,55.0,-60.0,25.4,56.3,-61.2`;

function initQc() {
  $("qc-sample").addEventListener("click", () => {
    $("qc-csv").value = QC_SAMPLE;
    runQc();
  });

  $("qc-run").addEventListener("click", runQc);
}

function updateQcHero(report) {
  setChip("hero-patches", report ? String(report.summary.patchCount) : "—");
  setChip("hero-mean", report ? report.summary.meanDeltaE00.toFixed(3) : "—");
  setChip("hero-max", report ? report.summary.maxDeltaE00.toFixed(3) : "—");

  const tolerance = $("qc-tolerance").value.trim();
  setChip("hero-tolerance", tolerance === "" ? "Not set" : tolerance);
}

function runQc() {
  const errorElement = $("qc-error");
  const text = $("qc-csv").value;
  updateQcHero(null);

  if (!text.trim()) {
    errorElement.hidden = false;
    errorElement.textContent = "Paste or import some patch data first.";
    $("qc-empty").hidden = false;
    $("qc-table").hidden = true;
    $("qc-summary").hidden = true;
    return;
  }

  const { rows, errors, skipped } = parseQcCsv(text);

  if (rows.length === 0) {
    errorElement.hidden = false;
    errorElement.textContent = errors.join(" ") || "No usable rows were found.";
    $("qc-empty").hidden = false;
    $("qc-table").hidden = true;
    $("qc-summary").hidden = true;
    return;
  }

  const toleranceResult = validateTacLimit($("qc-tolerance").value);
  const tolerance =
    $("qc-tolerance").value.trim() === ""
      ? undefined
      : Number.isFinite(toleranceResult.value)
        ? toleranceResult.value
        : undefined;

  const report = buildQcReport(rows, { tolerance });

  if (errors.length > 0) {
    errorElement.hidden = false;
    errorElement.textContent = `${skipped} row(s) skipped. ${errors.join(" ")}`;
  } else {
    errorElement.hidden = true;
  }

  $("qc-empty").hidden = true;
  $("qc-table").hidden = false;
  $("qc-summary").hidden = false;

  $("qc-count").textContent = String(report.summary.patchCount);
  $("qc-mean").textContent = report.summary.meanDeltaE00.toFixed(3);
  $("qc-max").textContent = report.summary.maxDeltaE00.toFixed(3);
  updateQcHero(report);

  const verdict = $("qc-verdict");
  if (report.summary.pass === undefined) {
    verdict.textContent = "No tolerance set";
    verdict.className = "stat__value";
  } else {
    verdict.textContent = report.summary.pass ? "Pass" : `${report.summary.failingCount} outside`;
    verdict.className = `stat__value stat__value--${report.summary.pass ? "pass" : "fail"}`;
  }

  $("qc-body").innerHTML = report.patches
    .map((patch) => {
      const result =
        patch.withinTolerance === undefined
          ? "—"
          : patch.withinTolerance
            ? "Within"
            : "Outside";
      const rowClass =
        patch.withinTolerance === undefined
          ? ""
          : patch.withinTolerance
            ? "row--pass"
            : "row--fail";

      return `
        <tr class="${rowClass}">
          <td>${escapeHtml(patch.patch)}</td>
          <td>${patch.target.L.toFixed(2)} ${patch.target.a.toFixed(2)} ${patch.target.b.toFixed(2)}</td>
          <td>${patch.measured.L.toFixed(2)} ${patch.measured.a.toFixed(2)} ${patch.measured.b.toFixed(2)}</td>
          <td>${patch.deltaE76.toFixed(3)}</td>
          <td>${patch.deltaE00.toFixed(3)}</td>
          <td>${result}</td>
        </tr>`;
    })
    .join("");
}

/* ─────────────────────────── Boot ─────────────────────────── */

async function boot() {
  initTabs();
  initInputSpace();
  initSampleInputs();
  initCopyActions();
  initPrintControls();
  initQc();

  readSampleInput();
  renderAll();

  // The built-in sRGB profile powers the default source, so the print panel
  // is usable without the user supplying anything.
  try {
    state.srgbProfile = await createSrgbProfile();
    refreshProfileSelectors();
    renderPrint();
  } catch {
    $("profile-status").textContent =
      "The colour-management module could not start. Conversion still works; profile transforms are unavailable.";
  }
}

boot();
