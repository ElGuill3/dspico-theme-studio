import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: [
        "apps/studio/src/**/*.{ts,tsx}",
        "packages/dspico-contract/src/**/*.ts",
        "packages/theme-core/src/**/*.ts",
      ],
      exclude: ["**/*.{test,spec}.{ts,tsx}", "**/*.d.ts"],
    },
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    server: { deps: { inline: ["@material/material-color-utilities"] } },
  },
});
