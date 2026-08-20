import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content script build. Content scripts are injected as classic scripts (not
// ES modules), so this produces a single self-contained IIFE bundle.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "src/content/index.ts"),
      formats: ["iife"],
      name: "FillinContent",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});