import { describe, expect, it } from "vitest";
import {
  applyOperationV3,
  createProjectV3,
  currentProjectV3,
  metadataErrorV3,
  openProjectV3,
  saveProjectV3,
} from "./index.js";

const metadata = { name: "Theme", description: "Description", author: "Author" };

describe("V3 metadata", () => {
  it("persists one bounded operation through undo, redo, and reopen", () => {
    const initial = createProjectV3({ projectId: "custom", metadata, themeKind: "custom" });
    const edited = applyOperationV3(initial, {
      version: 3,
      type: "set-metadata",
      field: "name",
      value: "Edited theme",
    });
    expect(edited.operations).toHaveLength(1);
    expect(edited.project.metadata.name).toBe("Edited theme");
    expect(currentProjectV3({ ...edited, cursor: 0 }).metadata.name).toBe("Theme");
    expect(currentProjectV3({ ...edited, cursor: 1 }).metadata.name).toBe("Edited theme");
    expect(openProjectV3(saveProjectV3(edited)).project.metadata.name).toBe("Edited theme");
  });

  it.each([
    ["name", ""],
    ["name", " padded"],
    ["author", "bad\u0000author"],
    ["description", "x".repeat(1025)],
  ] as const)("rejects non-canonical %s metadata", (field, value) => {
    expect(metadataErrorV3(field, value)).toBeTruthy();
    const state = createProjectV3({ projectId: "custom", metadata });
    expect(() => applyOperationV3(state, { version: 3, type: "set-metadata", field, value })).toThrow(
      "Invalid V3 operation",
    );
  });

  it.each([
    ["name", 128],
    ["author", 128],
    ["description", 1024],
  ] as const)("counts %s limits by Unicode code point", (field, maximum) => {
    expect(metadataErrorV3(field, "😀".repeat(maximum))).toBeUndefined();
    expect(metadataErrorV3(field, "😀".repeat(maximum + 1))).toContain(`${maximum} characters or fewer`);
  });

  it.each(["", "\u0000", "line\nfeed", "tab\tvalue", "\u007f"])(
    "rejects empty and control-bearing metadata %j",
    (value) => expect(metadataErrorV3("name", value)).toBeTruthy(),
  );

  it("rejects malformed metadata keys on open", () => {
    const persisted = JSON.parse(saveProjectV3(createProjectV3({ projectId: "custom", metadata }))) as {
      initial: { metadata: Record<string, string> };
    };
    persisted.initial.metadata.extra = "not allowed";
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
  });
});
