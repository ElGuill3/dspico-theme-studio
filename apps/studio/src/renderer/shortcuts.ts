export type Shortcut = { id: string; keys: string; label: string; group: "Selection" | "Edit" | "View" };

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "select-add",
    keys: "Shift/Ctrl/Cmd + click",
    label: "Add or remove a layer from selection",
    group: "Selection",
  },
  { id: "move", keys: "Arrow keys", label: "Move the selection by 1 px", group: "Selection" },
  { id: "move-large", keys: "Shift + Arrow keys", label: "Move the selection by 10 px", group: "Selection" },
  { id: "undo", keys: "Ctrl/Cmd + Z", label: "Undo", group: "Edit" },
  { id: "redo", keys: "Ctrl/Cmd + Shift + Z", label: "Redo", group: "Edit" },
  { id: "duplicate", keys: "Ctrl/Cmd + D", label: "Duplicate", group: "Edit" },
  { id: "copy", keys: "Ctrl/Cmd + C", label: "Copy", group: "Edit" },
  { id: "paste", keys: "Ctrl/Cmd + V", label: "Paste", group: "Edit" },
  { id: "group", keys: "Ctrl/Cmd + G", label: "Group", group: "Edit" },
  { id: "ungroup", keys: "Ctrl/Cmd + Shift + G", label: "Ungroup", group: "Edit" },
  { id: "lock", keys: "Ctrl/Cmd + Alt + L", label: "Lock selection", group: "Edit" },
  { id: "unlock", keys: "Ctrl/Cmd + Alt + Shift + L", label: "Unlock selection", group: "Edit" },
  { id: "tools", keys: "Left tool rail", label: "Import images and add shapes or text", group: "Edit" },
  { id: "crop", keys: "Crop tool, then drag", label: "Crop the selected image", group: "Edit" },
  { id: "rotate", keys: "Rotate left / Rotate right", label: "Rotate the selection 90 degrees", group: "Edit" },
  { id: "delete", keys: "Delete / Backspace", label: "Delete the selection or active guide", group: "Edit" },
  { id: "escape", keys: "Escape", label: "Cancel the active crop, drag, or field edit", group: "Edit" },
  { id: "zoom", keys: "+ / - or Ctrl/Cmd + wheel", label: "Zoom the canvas", group: "View" },
  { id: "fit", keys: "0", label: "Fit the document; Shift + 0 resets to 100%", group: "View" },
  { id: "pan", keys: "Space + drag or middle drag", label: "Pan the canvas", group: "View" },
  { id: "guides", keys: "Rulers and guide controls", label: "Add, move, lock, or clear guides", group: "View" },
  { id: "focus", keys: "Tab", label: "Hide or restore the tool rail and dock", group: "View" },
  {
    id: "editor-focus",
    keys: "Shift + Tab",
    label: "Hide or restore the workspace dock",
    group: "View",
  },
  { id: "panels", keys: "Dock tabs", label: "Switch between Layers, Properties, and Preview", group: "View" },
  { id: "help", keys: "? or F1", label: "Open Help and shortcuts", group: "View" },
] as const;

export const shortcutTitle = (id: string): string => {
  const shortcut = SHORTCUTS.find((item) => item.id === id);
  return shortcut ? `${shortcut.label} (${shortcut.keys})` : "";
};

export const suppressGlobalShortcut = (target: EventTarget | null): boolean => {
  const element = target as
    (EventTarget & { matches?: (selector: string) => boolean; isContentEditable?: boolean }) | null;
  return Boolean(element?.isContentEditable || element?.matches?.("input, textarea, select, [contenteditable]"));
};

export const ONBOARDING_PREFERENCE = "dspico:onboarding-dismissed:v1";
export const onboardingDismissed = (storage: Pick<Storage, "getItem">): boolean =>
  storage.getItem(ONBOARDING_PREFERENCE) === "true";
export const dismissOnboarding = (storage: Pick<Storage, "setItem">): void =>
  storage.setItem(ONBOARDING_PREFERENCE, "true");
