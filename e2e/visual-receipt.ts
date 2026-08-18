import { expect, type Page } from "@playwright/test";
import { CODEC_POLICY_V1, codecPolicySha256V1 } from "../packages/dspico-contract/src/index.js";
import { LAUNCHER_V1_PROFILE } from "../packages/dspico-contract/src/profile-v1-3.js";
import { applyOperationV3 } from "../packages/theme-core/src/index.js";
import { PortableProjectStore } from "../apps/studio/src/portable-project-store.js";
import { compileCustomPublicationV3 } from "../apps/studio/src/custom-authoring-v3.js";

export async function certifyCurrentVisual(page: Page, projectRoot: string): Promise<void> {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".status")).toHaveText("Project saved.");
  const store = await PortableProjectStore.openRoot(projectRoot);
  try {
    const { state, media } = await store.openV3();
    const expectation = compileCustomPublicationV3(state.project, media, { requireVisualReceipt: false }).expectation;
    // prettier-ignore
    const receipt = { version: 1, schema: "dspico-visual-receipt-v1" as const, component: "visual" as const, tester: "E2E", device: "DSi", cartridge: "fixture", launcherBuild: "fixture", testedAt: "2026-08-11T00:00:00.000Z", profile: { id: LAUNCHER_V1_PROFILE.profileId, tag: LAUNCHER_V1_PROFILE.tag, commit: LAUNCHER_V1_PROFILE.launcherCommit, sha256: expectation.profileSha256 }, codecPolicy: { id: CODEC_POLICY_V1, sha256: codecPolicySha256V1() }, themeJsonSha256: expectation.themeJsonSha256, manifest: expectation.manifest, observations: ["Physical-test fixture recorded."], pass: true };
    // prettier-ignore
    await store.saveV3(
      applyOperationV3(state, { version: 3, type: "set-component-evidence", component: "visual", receipt }), [...media].map(([sha256, bytes]) => ({ sha256, bytes })),
    );
  } finally {
    await store.close();
  }
  await page.getByRole("button", { name: "Open project" }).click();
}
