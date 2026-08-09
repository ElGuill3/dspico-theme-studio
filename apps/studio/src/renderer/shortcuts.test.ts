import { describe, expect, it } from "vitest";
import {
  dismissOnboarding,
  onboardingDismissed,
  SHORTCUTS,
  shortcutTitle,
  suppressGlobalShortcut,
} from "./shortcuts.js";

describe("help registry", () => {
  it("has unique shortcut identities and all required control families", () => {
    expect(new Set(SHORTCUTS.map(({ id }) => id)).size).toBe(SHORTCUTS.length);
    for (const id of [
      "select-add",
      "move",
      "undo",
      "redo",
      "duplicate",
      "copy",
      "paste",
      "group",
      "ungroup",
      "lock",
      "crop",
      "rotate",
      "zoom",
      "fit",
      "pan",
      "guides",
      "delete",
      "escape",
    ])
      expect(shortcutTitle(id), id).not.toBe("");
  });

  it("stores onboarding dismissal only in the supplied local preference store", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(onboardingDismissed(storage)).toBe(false);
    dismissOnboarding(storage);
    expect(onboardingDismissed(storage)).toBe(true);
  });

  it("suppresses every global shortcut in editable targets", () => {
    const target = (selector: string, editable = false) =>
      ({
        isContentEditable: editable,
        matches: (query: string) => query.split(", ").includes(selector),
      }) as unknown as EventTarget;
    for (const selector of ["input", "textarea", "select", "[contenteditable]"])
      expect(suppressGlobalShortcut(target(selector))).toBe(true);
    expect(suppressGlobalShortcut(target("button"))).toBe(false);
    expect(suppressGlobalShortcut(target("div", true))).toBe(true);
  });
});
