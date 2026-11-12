// Builds the extension into dist/ (load it as an unpacked extension): the side panel page, the service worker
// (background.js, at a fixed name for the manifest), the manifest from public/, and onnxruntime-web's WASM files in
// ort/, which the panel loads from the extension itself (an extension may not run code from elsewhere).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.resolve(here, "../..");
const ORT_FILES = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];

function copyOrt(): Plugin {
  return {
    name: "yomiscript-copy-ort",
    // onnxruntime loads its WASM from ort/ (wasmPaths); the copy that Vite finds in its bundle would never be used
    generateBundle(_o, bundle) {
      for (const name of Object.keys(bundle)) if (/(^|\/)ort-wasm[^/]*\.wasm$/.test(name)) delete bundle[name];
    },
    writeBundle(o) {
      const out = path.join(o.dir ?? path.join(here, "dist"), "ort");
      fs.mkdirSync(out, { recursive: true });
      for (const f of ORT_FILES) fs.copyFileSync(path.join(repo, "node_modules/onnxruntime-web/dist", f), path.join(out, f));
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  plugins: [copyOrt()],
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  build: {
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
    target: "chrome116",
    // the panel's own code is small; the size is onnxruntime and the SDK
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { sidepanel: path.join(here, "sidepanel.html"), background: path.join(here, "src/background.ts") },
      output: { entryFileNames: (c) => (c.name === "background" ? "background.js" : "assets/[name]-[hash].js") },
    },
  },
});
