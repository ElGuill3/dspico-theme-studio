import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: path.resolve("dist/apps/studio/src"),
    emptyOutDir: true,
    rollupOptions: {
      input: { main: "apps/studio/src/main.ts", preload: "apps/studio/src/preload.ts" },
      external: ["electron"],
      output: { format: "cjs", entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js" },
    },
  },
});
