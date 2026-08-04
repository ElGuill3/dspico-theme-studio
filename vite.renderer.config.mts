import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/studio/src/renderer",
  base: "./",
  plugins: [react()],
  build: { assetsInlineLimit: 0, outDir: path.resolve(".vite/renderer/main_window") },
});
