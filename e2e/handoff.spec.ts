import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import {
  CODEC_POLICY_V1,
  CUSTOM_VISUAL_SLOTS_V1,
  compositeProfileSha256V1,
} from "../packages/dspico-contract/src/index.js";
import { LAUNCHER_V1_PROFILE } from "../packages/dspico-contract/src/profile-v1-3.js";
import { compileCustomPublicationV3 } from "../apps/studio/src/custom-authoring-v3.js";
import { PortableProjectStore } from "../apps/studio/src/portable-project-store.js";

const HANDOFF_LABEL = "NOT READY — CARTRIDGE TEST ONLY";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const testWav = () =>
  Buffer.from(
    "524946462800000057415645666d742010000000010001002256000044ac00000200100064617461040000000000e803",
    "hex",
  );

test("creates a complete physical-test handoff through the Electron writer", async () => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-handoff-e2e-"));
  const projectRoot = path.join(root, "project");
  await mkdir(projectRoot);
  await mkdir(path.join(root, "export"));
  await writeFile(path.join(root, "project-selection.txt"), projectRoot);
  await writeFile(path.join(root, "input.wav"), testWav());
  await copyFile(
    path.resolve("apps/studio/src/renderer/assets/launcher-preview/coverflow-bottom.png"),
    path.join(root, "input.png"),
  );
  const app = await electron.launch({
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      path.resolve("dist/apps/studio/src/main.js"),
    ],
    env: { ...process.env, DSPICO_STUDIO_E2E_ROOT: root, ELECTRON_DISABLE_SANDBOX: "1" },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(5_000);
    const onboarding = page.getByRole("dialog", { name: "Build a theme in seven documents" });
    if (await onboarding.isVisible()) await onboarding.getByRole("button", { name: "Close help" }).click();
    await page.getByRole("button", { name: "New Custom" }).click();
    const drawer = page.getByRole("dialog", { name: "Project" });
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await drawer.getByRole("tab", { name: "Assets" }).click();
    for (const role of [
      "top-background",
      "bottom-background",
      "grid-cell",
      "grid-cell-selected",
      "banner-cell",
      "banner-cell-selected",
      "scrim",
    ])
      await drawer.getByRole("button", { name: `Assign ${role} PNG` }).click();
    await drawer.getByRole("tab", { name: "Audio" }).click();
    await drawer.locator('input[accept=".wav,audio/wav"]').first().setInputFiles(path.join(root, "input.wav"));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".status")).toHaveText("Project saved.");

    const store = await PortableProjectStore.openRoot(projectRoot);
    let expected: Awaited<ReturnType<typeof compileCustomPublicationV3>>;
    try {
      const { state, media } = await store.openV3();
      expected = compileCustomPublicationV3(state.project, media, { requireVisualReceipt: false });
    } finally {
      await store.close();
    }

    await page.getByRole("button", { name: "Open project" }).click();

    const result = await page.evaluate(async () => {
      const studio = (
        globalThis as typeof globalThis & {
          studio: {
            handoff(): Promise<{ handoff?: { destination: string; files: string[]; label: string; zip: boolean } }>;
            export(target: "custom"): Promise<{ canExport?: boolean; diagnostics?: unknown[] }>;
          };
        }
      ).studio;
      return { handoff: await studio.handoff(), blockedExport: await studio.export("custom") };
    });
    const handoff = result.handoff.handoff!;
    const handoffRoot = path.join(root, "handoff", HANDOFF_LABEL);
    const metadata = JSON.parse(await readFile(path.join(handoffRoot, "handoff.json"), "utf8")) as {
      label: string;
      ready: boolean;
      compatibilityClaimed: boolean;
      profile: { id: string; tag: string; commit: string; sha256: string };
      codecPolicy: string;
      instructions: string;
      files: { path: string; bytes: number; sha256: string }[];
    };

    expect(handoff).toEqual({
      destination: handoffRoot,
      files: ["README.md", "handoff.json", ...expected.files.map(({ path: filePath }) => filePath)].map((filePath) =>
        path.join(HANDOFF_LABEL, filePath),
      ),
      label: HANDOFF_LABEL,
      zip: false,
    });
    expect(metadata).toMatchObject({
      label: HANDOFF_LABEL,
      ready: false,
      compatibilityClaimed: false,
      profile: {
        id: LAUNCHER_V1_PROFILE.profileId,
        tag: LAUNCHER_V1_PROFILE.tag,
        commit: LAUNCHER_V1_PROFILE.launcherCommit,
        sha256: compositeProfileSha256V1(),
      },
      codecPolicy: CODEC_POLICY_V1,
      instructions:
        "Test these candidate bytes on the observed target and record the physical test results separately.",
    });
    expect(metadata.files).toEqual(
      expected.files.map(({ path: filePath, bytes }) => ({
        path: filePath,
        bytes: bytes.length,
        sha256: sha256(bytes),
      })),
    );
    expect(
      metadata.files.filter(({ path: filePath }) => filePath.endsWith(".bin")).map(({ path: filePath }) => filePath),
    ).toEqual(CUSTOM_VISUAL_SLOTS_V1.map(({ path: filePath }) => filePath));
    expect(metadata.files.find(({ path: filePath }) => filePath === "sounds/navigation.wav")).toBeDefined();
    expect(metadata.files.find(({ path: filePath }) => filePath === "sounds/launch.wav")).toBeUndefined();
    for (const { path: filePath, bytes } of expected.files)
      expect(await readFile(path.join(handoffRoot, filePath))).toEqual(Buffer.from(bytes));
    await expect(readFile(path.join(handoffRoot, "README.md"), "utf8")).resolves.toBe(
      `${HANDOFF_LABEL}\nThis folder is a physical-test candidate only. It is not a ready export, ZIP, compatibility claim, or installation.\n`,
    );
    expect(await readdir(path.join(root, "handoff"))).toEqual([HANDOFF_LABEL]);
    expect(handoff.files.some((filePath) => filePath.endsWith(".zip"))).toBe(false);
    expect(result.blockedExport.canExport).toBe(false);
    expect(result.blockedExport.diagnostics).toHaveLength(1);
    expect(await readdir(path.join(root, "export"))).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
