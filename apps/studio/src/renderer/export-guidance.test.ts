import { describe, expect, it } from "vitest";
import { manualSdGuidance } from "./export-guidance.js";

describe("manual SD guidance", () => {
  it("uses the actual output name without claiming direct installation or hardware parity", () => {
    const guidance = manualSdGuidance("theme", "theme.zip", ["theme/theme.json"]);
    expect(guidance.steps[0]).toContain("/_pico/themes/theme/");
    expect(guidance.steps[1]).toContain("launcher");
    expect(guidance.steps[2]).toContain("Safely eject");
    expect(guidance.boundary).toContain("does not install directly");
    expect(guidance.report).toContain("hardwareParityClaimed remains false");
    expect(guidance.bgm).toBeUndefined();
  });

  it("adds the BGM path only when the export contains BGM", () => {
    expect(manualSdGuidance("theme", "theme.zip", ["theme/bgm.bcstm"]).bgm).toBe(
      "The included BGM remains at /_pico/themes/theme/bgm.bcstm.",
    );
  });
});
