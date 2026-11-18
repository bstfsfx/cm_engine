import { defineConfig } from "vite";

export default defineConfig({
  // The design plan fixes the served port.
  server: {
    port: 3000,
    strictPort: true
  },
  preview: {
    port: 3000,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true
  },
  // The LittleCMS WebAssembly binary is loaded through `?url` and must be
  // emitted as a static asset so it is present in the built output.
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["lcms-wasm"]
  }
});
