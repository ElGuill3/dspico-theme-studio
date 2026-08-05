import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";
import { fileURLToPath, URL } from "node:url";

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require("@electron/asar");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const productName = "dspico-theme-studio";
const suffix = `-${process.platform}-${process.arch}`;
const candidates = readdirSync(path.join(root, "out"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
  .map((entry) => path.join(root, "out", entry.name));
assert.equal(candidates.length, 1, `Expected one Forge package for ${process.platform}-${process.arch}`);

const packageRoot = candidates[0];
const executable =
  process.platform === "darwin"
    ? path.join(packageRoot, `${productName}.app`, "Contents", "MacOS", productName)
    : path.join(packageRoot, process.platform === "win32" ? `${productName}.exe` : productName);
const resources =
  process.platform === "darwin"
    ? path.join(packageRoot, `${productName}.app`, "Contents", "Resources")
    : path.join(packageRoot, "resources");
const archive = path.join(resources, "app.asar");
assert.ok(existsSync(executable), `Packaged executable is missing: ${executable}`);
assert.ok(existsSync(archive), `ASAR archive is missing: ${archive}`);

const files = listPackage(archive, { isPack: false });
for (const required of [
  "/.vite/build/main.js",
  "/.vite/build/preload.js",
  "/.vite/renderer/main_window/index.html",
  "/package.json",
])
  assert.ok(files.includes(required), `ASAR is missing ${required}`);
assert.ok(
  files.some((file) => /^\/.vite\/renderer\/main_window\/assets\/index-[\w-]+\.js$/.test(file)),
  "ASAR is missing the renderer JavaScript bundle",
);
for (const excluded of ["/apps/", "/e2e/", "/packages/test-fixtures/", "/scripts/", "/node_modules/"])
  assert.ok(!files.some((file) => file.startsWith(excluded)), `ASAR contains excluded path ${excluded}`);
const bundledSource = files
  .filter((file) => file.endsWith(".js"))
  .map((file) => extractFile(archive, file.slice(1)).toString())
  .join("\n");
for (const excluded of ["captureLauncherFixtures", "node:child_process", "electron-updater", "openai", "anthropic"])
  assert.ok(
    !bundledSource.toLowerCase().includes(excluded.toLowerCase()),
    `ASAR contains excluded capability ${excluded}`,
  );
assert.doesNotMatch(bundledSource, /webviewTag:(?:!0|true)/, "Packaged BrowserWindow enables webviews");
assert.match(
  bundledSource,
  /contextIsolation:(?:!0|true),nodeIntegration:(?:!1|false),sandbox:(?:!0|true),webSecurity:(?:!0|true)/,
  "Packaged BrowserWindow security preferences are missing",
);

const metadata = JSON.parse(extractFile(archive, "package.json").toString());
assert.equal(metadata.main, ".vite/build/main.js");
const index = extractFile(archive, ".vite/renderer/main_window/index.html").toString();
for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
])
  assert.ok(index.includes(directive), `Packaged CSP is missing ${directive}`);

const playwrightCli = require.resolve("@playwright/test/cli");
const acceptance = spawnSync(process.execPath, [playwrightCli, "test", "e2e"], {
  cwd: root,
  env: { ...process.env, DSPICO_PACKAGED_EXECUTABLE: executable },
  shell: false,
  stdio: "inherit",
});
assert.equal(acceptance.error, undefined, acceptance.error?.message);
assert.equal(acceptance.status, 0, `Packaged acceptance exited with ${acceptance.status}`);
console.log(`Verified ASAR contents and packaged runtime: ${packageRoot}`);
