import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/studio/src/renderer",
  base: "./",
  plugins: [react()],
  build: { assetsInlineLimit: 0, outDir: path.resolve("dist/apps/studio/renderer/main_window"), emptyOutDir: true },
});
