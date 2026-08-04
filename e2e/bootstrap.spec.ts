import { _electron as electron } from "playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

test("launches the offline Electron bootstrap", async () => {
  const electronApp = await electron.launch({
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      path.resolve("dist/apps/studio/src/main.js"),
      "--bootstrap-check",
    ],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: "1" },
  });
  try {
    expect(await electronApp.evaluate(({ app }) => app.isReady())).toBe(true);
  } finally {
    await electronApp.close();
  }
});
