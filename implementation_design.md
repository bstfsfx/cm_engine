# ChromaLab — Implementation and Design Plan

## 1. Product scope

Build the README's reusable color-science engine and a responsive browser workbench, with a dedicated commercial-print workflow.

Preserve the README conventions: 8-bit sRGB input, linear RGB in 0–1, XYZ with Y normalized to 0–1, CIELAB L\* 0–100, CIELCh hue in degrees, and D65 as the default for the screen-color pipeline. Implement RGB/XYZ/Lab/LCh conversions, inverse conversion, ΔE76, full CIEDE2000 (ΔE00), explicit D50/D65 support and Bradford chromatic adaptation, and out-of-sRGB gamut detection without hiding clipping.

Print support must be profile-driven, not a generic RGB-to-CMYK formula. Integrate a browser-compatible LittleCMS/WebAssembly color-management module behind a dedicated adapter. Let the operator load ICC profiles from local files, inspect profile metadata, and transform RGB/Lab/CMYK values using the selected source and destination profiles, rendering intent and optional black-point compensation. Keep the profile bytes in the browser session only; do not upload them. Show the actual CMYK separation and total ink coverage as a calculated sum, and compare it only to a limit explicitly set by the operator or documented profile/process data — never invent a universal TAC limit. Allow a print-condition workspace to record stock, process, finishing, measurement condition (such as M0/M1), backing, instrument and job notes.

Add soft-proof preview controls for a supplied output profile and make clear that a browser display is only a soft proof: screen calibration, viewing conditions and the output profile affect the result. Include a visible-profile workflow for common print conditions such as FOGRA51/PSO Coated v3 and FOGRA52/PSO Uncoated v3, linked to their authoritative profile/characterization-data sources; do not imply ChromaLab is certified or that a profile name alone defines every press, paper or finishing condition. Include editable multi-patch quality-control comparison from pasted/imported CSV of target and measured Lab values, producing per-patch ΔE00/ΔE76, a user-set tolerance result and summary statistics. Keep raw-data measurement claims out of scope unless spectral measurements and the relevant measurement geometry/observer inputs are provided.

The web workbench will include:

- RGB/HEX and Lab/LCh entry
- Live swatches and synchronized results
- A second-color comparison
- Profile-based CMYK conversion
- Gamut and ink-coverage indicators
- Helpful copy/export actions

Explain where values come from, state white point, observer/profile, intent, and measurement assumptions next to each result, and distinguish calculated colorimetry from physical print measurement.

## 2. Implementation approach and project structure

Use semantic HTML, CSS and ES-module JavaScript, with a small Vite build to package the ICC WebAssembly runtime. Keep the core math reusable and independent from the UI or the ICC adapter. Use a local-only static client; no login, server, database, cloud profile upload or persistence is needed. Pin the package manager and dependencies, include the WASM asset in the built output, and retain Node's test runner for deterministic engine and fixture tests. Verify the selected WASM binding's browser bundle, profile loading, transform semantics and license before relying on it.

| Path                      | Responsibility                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `styles.css` | Accessible workbench layout, responsive navigation, controls, status messaging, and reduced-motion support.                                                                            |
| `src/color/`              | Gamma, RGB/XYZ matrices, Lab, LCh, white points, Bradford CAT, gamut and ΔE76/ΔE00 modules; `color.js` exposes the stable core API.                                                   |
| `src/print/icc-adapter.js` | Isolated browser/WASM CMM integration, profile metadata, transforms, rendering intent, soft-proof and profile lifecycle; `print-workflow.js` — CMYK/TAC and production-condition logic. |
| `src/qc/`                 | CSV parsing/validation and target-versus-measured Lab/ΔE report model.                                                                                                                |
| `src/utils/validation.js`, `src/main.js` | Input validation and browser interaction/rendering only; no formula logic in DOM handlers.                                                                                       |
| `tests/`                  | Numerical reference tests for conversions, round trips, gamma boundaries, CAT, ΔE and gamut; ICC adapter checks using known test profiles when a distributable fixture is available; CSV/QC tests. |
| `public/manus-routes.json` | One `/` page, synchronized with source.                                                                                                                                             |
| `README.md`, `package.json` | Development, test, profile privacy, limitations and dependency/license information; package scripts for local development, build and tests.                                          |

## 3. Design direction

Three possible visual directions were considered (small exploratory probabilities): precision optical-instrument console (0.07), chromatic field-notes notebook (0.04), and modern spectral editorial (0.02). Select **precision optical-instrument console** for the first implementation.

- **Design movement:** Contemporary scientific instrumentation, with the calm hierarchy of a calibrated lab console rather than a generic consumer color picker.
- **Core principles:** Traceable values; high legibility; explicit assumptions; compact, purposeful interaction.
- **Color philosophy:** Neutral ink-and-paper foundations let actual sampled colors remain the strongest visual signal; one cool spectral accent distinguishes controls and active measurements.
- **Layout paradigm:** A broad analysis bench — sample and profile inputs at the leading edge, a conversion/proofing path through the center, and QC data alongside or below it as screens narrow.
- **Signature elements:** A spectral tick/ruler motif; sequentially linked conversion and proof paths; restrained profile/process badges.
- **Interaction philosophy:** Edits recalculate immediately; values expose their profile, space and units; errors remain beside the source; profile handling is local and transparent; keyboard and copy feedback are first-class.
- **Animation:** Brief opacity/position transitions on updated result panels; no continuously moving spectral effects; respect reduced-motion preferences.
- **Typography system:** A system sans for explanations and monospace numerals/labels, with robust local fallbacks and no required network font.
- **Brand essence:** A transparent colorimetric and print-production workbench for designers, prepress specialists and developers; precise, candid, production-aware.
- **Brand voice:** Concise, technical and plainspoken. Example: "Follow every conversion." "Your ICC profile defines the separation."
- **Wordmark & logo:** A compact three-band spectral mark paired with a carefully spaced ChromaLab wordmark.
- **Signature brand color:** Spectral cyan, used sparingly for active states and links, not as a substitute for measured color.

## 4. Constraints and delivery

- Colorimetric math and ICC profile conversions are distinct paths and must be labeled accordingly.
- ICC outputs depend on the supplied profiles, rendering intent, CMM and options; CMYK is not a universal color space.
- FOGRA51/52 are informative standardized examples, not substitutes for the actual job profile or a press contract.
- Soft proof is not a certified contract proof, and browser rendering cannot certify a display or print process.
- Keep profile processing local and disclose any unsupported profile.
- Cite the industry sources inside the site documentation.
- Serve on the configured port **3000** and keep the single-page route manifest synchronized.
- Building is authorized only after this revised plan is approved; publication is separate and not implied.

## 5. Industry references for the site's documentation

### ICC

The ICC explains that device color management combines profiles through a Color Management Module, that output profiles can describe CMYK and other device color encodings, and that rendering intent controls how out-of-gamut colors are handled. It also identifies Bradford as a widely used D50↔D65 chromatic-adaptation approach.

> ICC color-management FAQ

### LittleCMS

LittleCMS describes itself as an ICC color-management module supporting profile transforms, soft proofing, gamut checking, black-point compensation and multicolor workflows. A browser-oriented WebAssembly binding is a plausible implementation route, subject to package verification.

> LittleCMS color engine — `lcms-wasm`

### Fogra / ECI

Fogra's characterization-data reference lists FOGRA51 for sheet-fed coated offset and FOGRA52 for uncoated stock, and explains that profile separation results may vary even when profiles use the same characterization data. Its data redistribution terms require the data to remain unmodified and Fogra to be identified as the source. ECI describes FOGRA51/52 as conditions developed for ISO 12647-2:2013 and notes the importance of D50 viewing and measurement mode M1 when optical brighteners are involved.

> Fogra characterization data · ECI offset standards · ICC profile registry: PSO Uncoated v3 / FOGRA52
