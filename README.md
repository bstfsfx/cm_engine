# Stage A — Build a JavaScript Color Science Engine

Let's start with the foundation: developing a reusable **JavaScript Color Science Engine** that can eventually become the core of a browser-based professional color management system.

The objective is not just to create a color picker. We want to implement the mathematical foundations used in professional color measurement, digital printing, color reproduction, and quality control.

I recommend developing this as a standalone JavaScript module first, then integrating it into React or Next.js later.

> **Status:** the engine, the print workflow and the quality-control module are implemented and tested. The browser workbench is in `index.html`. See [Implementation status](#implementation-status) for what is done and what is next.

## Quick start

```bash
npm install
npm test     # 45 deterministic engine, print and QC tests
npm run dev  # Vite dev server on http://localhost:3000
```

Production build:

```bash
npm run build
npm run preview
```

## Deployment

Deployed to Vercel as the project **`chromatic_color_engine`**:

| | |
| --- | --- |
| Production URL | https://chromaticcolorengine.vercel.app |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 (`.nvmrc`) |

Deploy manually with:

```bash
npm run deploy          # production
npm run deploy:preview  # preview deployment
```

### Git integration

The project is linked to `bstfsfx/cm_engine` on GitHub, with `main` as the production branch.

> **Note on repository access:** the Vercel GitHub App must be granted access to the `cm_engine` repository for push-triggered builds to run. Git-connected deployments appear with the status `BLOCKED` until the App has access, because Vercel resolves the source commit through the App. The working repositories linked to this Vercel account (`comtw`, `comhk`, `Floral_Boutique`) are public; `cm_engine` is private and was created after the App was installed.

To grant access: **GitHub → Settings → Applications → Installed GitHub Apps → Vercel → Configure → Repository access**, then either add `cm_engine` individually or switch to **All repositories**.

Until then, `npm run deploy` publishes the current state.

## 1. Development objectives

**Stage A · Foundation**

Our first engine will support these color spaces and calculations:

| Module      | Function                      | Priority   |
| ----------- | ----------------------------- | ---------- |
| RGB         | sRGB to linear RGB            | Essential  |
| XYZ         | RGB to CIE XYZ                | Essential  |
| Lab         | XYZ to CIELAB                 | Essential  |
| LCh         | Lab to cylindrical LCh        | Essential  |
| RGB         | Lab to sRGB                   | Essential  |
| ΔE76        | Basic color difference        | Essential  |
| ΔE2000      | Professional color difference | Essential  |
| Gamma       | Transfer function handling    | Essential  |
| White point | D50 / D65 support             | Essential  |
| Gamut       | Detect out-of-gamut RGB       | Next stage |

> **Important:** We will explicitly handle reference white points. For example, sRGB uses D65, while many printing-related ICC workflows use D50. Incorrect white-point handling can produce misleading Lab values.

## 2. Architecture

The project structure as built:

```text
color_engine/
│
├── index.html            — the workbench (semantic HTML, no framework)
├── styles.css            — the console design system
├── package.json
├── vite.config.js
│
├── src/
│   ├── color/
│   │   ├── rgb.js         — sRGB transfer function, RGB ↔ XYZ, hex
│   │   ├── lab.js         — XYZ ↔ CIELAB
│   │   ├── lch.js         — CIELAB ↔ CIELCh
│   │   ├── deltaE.js      — ΔE76 and CIEDE2000
│   │   ├── whitepoints.js — D65/D50, Bradford chromatic adaptation
│   │   ├── gamut.js       — out-of-sRGB detection
│   │   └── color.js       — the stable core API
│   │
│   ├── print/
│   │   ├── icc-adapter.js — LittleCMS/WASM integration, transforms, intents
│   │   └── print-workflow.js — CMYK/TAC and production-condition logic
│   │
│   ├── qc/
│   │   └── qc-report.js   — CSV parsing and the ΔE report model
│   │
│   ├── utils/
│   │   └── validation.js  — input validation only, no formulas
│   │
│   └── main.js            — DOM wiring and rendering only
│
├── scripts/
│   └── serve.js           — dependency-free static server
│
├── public/
│   └── manus-routes.json  — single-page route manifest
│
└── tests/
    ├── color.test.js      — conversions, ΔE, CAT, gamut
    └── qc-print.test.js   — CSV, QC report, TAC, validation
```

We will use ES Modules, which makes the engine reusable in:

- Vanilla JavaScript applications.
- React and Next.js.
- Node.js backend services.
- Future WebAssembly integrations.

## 3. Establish the mathematical conventions

Before writing code, we need consistent data conventions.

| Parameter           | Convention                     |
| ------------------- | ------------------------------ |
| RGB input           | sRGB, 0–255                    |
| Linear RGB          | 0–1                            |
| XYZ                 | CIE XYZ, Y normalized to 0–1   |
| Lab                 | CIELAB, L\* 0–100              |
| LCh                 | L\* 0–100, C\* ≥ 0, hue 0–360° |
| Default illuminant  | D65                            |
| Lab reference white | D65 initially                  |
| Color difference    | ΔE76 and ΔE00                  |

We will initially use the sRGB/D65 colorimetric pipeline. Later, we will add Bradford chromatic adaptation to support D50 printing workflows.

## 4. The color science engine

The engine lives in `src/color/`, split into focused modules, with `src/color/color.js` exposing the stable public API.

### Public API

```js
import {
  rgbToLab, labToRgb, rgbToLch, lchToRgb,
  rgbToXyz, xyzToRgb, rgbToHex, hexToRgb,
  srgbToLinear, linearToSrgb,
  deltaE76, deltaE2000, deltaE00,
  adaptXyz, bradfordMatrix, getWhitePoint,
  checkXyzGamut, checkRgbGamut,
  WHITE_POINTS, DEFAULT_WHITE_POINT, DEFAULT_OBSERVER
} from "./src/color/color.js";
```

### Conventions in force

- **Reference white is explicit.** Every conversion takes a white point, defaulting to D65. Passing `"D50"` adapts the colour and measures it against D50 rather than silently mislabelling D65 values.
- **Bradford adaptation uses the standard CAT matrix form** — `ConeInv · diag(dstCone / srcCone) · Cone` — which maps the source white exactly onto the target white.
- **Out-of-gamut colours are reported, not hidden.** `xyzToLinearRgb` returns unclipped values; `checkXyzGamut` reports which channels fall outside 0–1. Clipping happens only where a display value is explicitly requested.
- **The core is DOM-free.** `src/color` imports nothing from the browser, so it runs unchanged in Node, React, Next.js or a worker.

### A note on white-point handling

CIELAB `L*` depends only on `Y`, and both D65 and D50 have `Y = 1`, so `L*` is unchanged by a change of reference white — only `a*` and `b*` shift. Conversely, the Bradford CAT is a von Kries-style approximation in three cone channels rather than a perfect transform for arbitrary colours, so an adapted colour can differ from the original by a small amount (of the order of 1–3 ΔE for highly saturated colours). Both behaviours are covered by tests.

## 5. The browser workbench

`index.html` is a semantic, framework-free workbench with four panels: **Conversion**, **Print**, **Quality control** and **References**.

The Conversion panel provides:

- RGB/HEX, Lab and LCh entry, switchable without loss
- A live swatch with gamut status
- Synchronised results in sRGB, HEX, XYZ, CIELAB and CIELCh, each labelled with its reference white and observer
- A second colour with ΔE76 and ΔE00
- Copy actions for plain text, CSV and JSON

The Print panel provides:

- Local ICC profile loading from file, with metadata inspection
- Source and output profile selection, rendering intent, and optional black-point compensation
- The CMYK separation and total ink coverage as a calculated sum
- A print-condition workspace (stock, process, finishing, measurement condition, backing, instrument, job notes)

The Quality control panel provides:

- Pasted or imported CSV of target and measured Lab values
- Per-patch ΔE76 and ΔE00, a user-set tolerance, and summary statistics

### Running it

Vite is the supported path, because it resolves and fingerprints the LittleCMS WebAssembly asset:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

A dependency-free static server is also available for quick iteration without the bundler:

```bash
npm run serve
```

## 6. Validating the mathematical results

The test suite uses Node's built-in test runner:

```bash
npm test
```

It covers:

| Area                | Checks                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Gamma               | sRGB breakpoints at 0.04045 and 0.0031308, and encode/decode round-trips |
| Conversions        | sRGB → Lab against the reference values in section 7 of this document     |
| Round trips         | Lab → RGB within one 8-bit step; Lab → XYZ → Lab exactly                 |
| ΔE76                | Euclidean Lab distance                                                   |
| ΔE2000              | The full Sharma, Wu and Dalal (2005) reference dataset, 34 pairs         |
| Bradford CAT        | White-point mapping, round-trip, matrix/point-wise equivalence           |
| Gamut               | Out-of-gamut detection and that clipping is not hidden                   |
| QC                  | CSV parsing, malformed rows, tolerance verdicts, summary statistics      |
| Print               | Total ink coverage, limit comparison, print-condition defaults           |

### Reference values

Expected approximate results for sRGB under D65:

| sRGB input      | CIELAB (D65)            |
| --------------- | ----------------------- |
| (255, 0, 0)     | (53.24, 80.09, 67.20)   |
| (0, 255, 0)     | (87.73, -86.18, 83.18)  |
| (0, 0, 255)     | (32.30, 79.19, -107.86) |
| (255, 255, 255) | (100, 0, 0)             |
| (0, 0, 0)       | (0, 0, 0)               |

These values provide useful sanity checks for our implementation.

One important distinction: these are theoretical sRGB/D65 values, not measurements from a physical printing device.

## 7. Implementation status

### Engine v0.1.0 — complete

- sRGB gamma decoding and encoding
- sRGB → XYZ (D65) and back, with an explicit white-point parameter
- XYZ → CIELAB and back
- Lab → LCh and back
- ΔE76 and full CIEDE2000 (ΔE00)
- D50 and D65 support with Bradford chromatic adaptation
- Out-of-sRGB gamut detection that does not hide clipping
- Hex conversion
- Browser workbench with live swatches, comparison and export

### Print workflow v0.1.0 — complete

- LittleCMS via `lcms-wasm`, isolated behind `src/print/icc-adapter.js`
- Local profile loading and metadata inspection; profile bytes never leave the browser
- Rendering intent and optional black-point compensation
- CMYK separation with total ink coverage as a calculated sum
- Total ink coverage compared only against an operator-supplied limit
- Print-condition workspace with M0/M1 measurement conditions
- Soft-proof transform support

### Quality control v0.1.0 — complete

- CSV parsing with validation and reported bad rows
- Per-patch ΔE76 and ΔE00, user-set tolerance, summary statistics

## 8. Next milestone: v0.2.0

1. **D50 as a first-class pipeline.** D50 is currently supported as an explicit parameter; a dedicated D50 print pipeline with its own primaries matrix is still to come.
2. **Visible-profile workflow.** A guided path for FOGRA51/PSO Coated v3 and FOGRA52/PSO Uncoated v3, linked to their authoritative profile and characterisation-data sources, with clear labelling that these are informative examples and not substitutes for the actual job profile.
3. **Print-condition persistence.** Print conditions are recorded in the session but not yet saved between visits.
4. **Extended ICC fixture tests.** Adapter checks run against known profiles when a redistributable fixture is available; the current suite covers the engine and the workflow logic.

Eventually, we should be able to use the same engine to analyze your spectrophotometer data, AS7341 measurements, printer characterization data, and ICC-related workflows.

> **The long-term objective:** Build your own reusable JavaScript color science library, rather than just a standalone color calculator.

## Limitations and known issues

- **Colourimetric math and ICC profile conversions are distinct paths.** They are labelled separately throughout the interface, because they answer different questions.
- **CMYK is not a universal colour space.** Every separation is defined by the profiles, rendering intent, CMM and options in force.
- **A soft proof is not a contract proof.** Browser rendering cannot certify a display or a print process.
- **FOGRA51/52 are informative examples**, not substitutes for the actual job profile or a press contract.
- **No universal total ink coverage limit is assumed.** Coverage is compared only against a limit you set or documented profile and process data.
- **Raw measurement claims are out of scope.** ChromaLab does not take measurements; spectral measurement claims require spectral data plus the relevant measurement geometry and observer inputs.
- **Dependency advisory.** `picomatch` (transitively via Vite's `fdir` and `tinyglobby`) is affected by CVE-2026-112366, a ReDoS issue with **no patched release available** at the time of writing — every published version through 4.0.7 is affected. It is a development-time dependency only, is not shipped in the built output, and is not reachable from the application code. Re-check for a fix before the next dependency update.

## Dependencies and licences

| Dependency    | Purpose                                    | Licence |
| ------------- | ------------------------------------------ | ------- |
| `lcms-wasm`   | LittleCMS colour-management module (WASM)  | MIT     |
| `vite`        | Build tool and dev server                 | MIT     |

LittleCMS itself is MIT licensed. ICC output profiles are **not** distributed with this project: profiles for FOGRA51/PSO Coated v3 and FOGRA52/PSO Uncoated v3 remain the property of their rights holders, and Fogra's characterisation data must remain unmodified with Fogra identified as the source.

## Privacy

There is no login, server, database or cloud upload. ICC profile bytes are read from local files, held in memory for the browser session, and discarded on reload. Nothing is persisted and nothing leaves the page.
