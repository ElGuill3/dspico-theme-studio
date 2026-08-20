import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  outputDir: "test-results",
  reporter: [["line"], ["json", { outputFile: "test-results/results.json" }]],
  retries: 0,
  use: { trace: "retain-on-failure" },
  workers: 1,
});
