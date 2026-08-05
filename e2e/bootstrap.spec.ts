import { _electron as electron } from "playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

test("launches the offline Electron bootstrap", async () => {
  const packagedExecutable = process.env.DSPICO_PACKAGED_EXECUTABLE;
  const electronApp = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      ...(packagedExecutable ? [] : [path.resolve("dist/apps/studio/src/main.js")]),
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
