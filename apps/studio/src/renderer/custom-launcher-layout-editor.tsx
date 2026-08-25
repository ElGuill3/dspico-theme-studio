import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
  type CustomLauncherLayoutKeyV1,
  type CustomLauncherLayoutOverridesV1,
} from "../../../../packages/dspico-contract/src/custom-v1-3.js";
import type { SetCustomLauncherLayoutV3 } from "../../../../packages/theme-core/src/index.js";
import type { CustomLauncherLayoutDtoV1 } from "../studio-ipc.js";
import {
  LAUNCHER_TOP_COVER_SIZE_V1,
  resolveCustomLauncherLayoutV1,
  type EffectiveCustomLauncherLayoutV1,
  type LauncherPreviewModeV1,
} from "./launcher-preview/authority.js";

type LayoutKey = CustomLauncherLayoutKeyV1;
type LayoutValue = EffectiveCustomLauncherLayoutV1[LayoutKey];
type LayoutDraft = { key: LayoutKey; value: LayoutValue };
type InspectorDraft = { key: LayoutKey; fields: Record<string, string> };
type InspectorError = { field: string; message: string };

const labels: Record<LayoutKey, string> = {
  topIcon: "top icon",
  topBannerTextLine0: "banner line 1",
  topBannerTextLine1: "banner line 2",
  topBannerTextLine2: "banner line 3",
  topFileNameText: "file name",
  topCover: "top cover",
};
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export const customLauncherLayoutTargetV1 = (key: LayoutKey, mode: LauncherPreviewModeV1) => ({
  key,
  label: labels[key],
  unavailable: key === "topCover" && mode === "coverflow",
});

export const customLauncherLayoutBoundsV1 = (value: LayoutValue) => ({
  x: { minimum: 0, maximum: "width" in value ? 256 - value.width : 255 },
  y: { minimum: 0, maximum: 191 },
});

export const moveCustomLauncherLayoutV1 = (key: LayoutKey, value: LayoutValue, x: number, y: number): LayoutValue => {
  const bounds = customLauncherLayoutBoundsV1(value);
  return {
    ...value,
    position: {
      x: clamp(Math.round(x), bounds.x.minimum, bounds.x.maximum),
      y: clamp(Math.round(y), bounds.y.minimum, bounds.y.maximum),
    },
  } as EffectiveCustomLauncherLayoutV1[typeof key];
};

export const customLauncherLayoutHitboxV1 = (key: LayoutKey, value: LayoutValue) => ({
  width: "width" in value ? value.width : key === "topCover" ? LAUNCHER_TOP_COVER_SIZE_V1.width : 24,
  height: key === "topCover" ? LAUNCHER_TOP_COVER_SIZE_V1.height : 12,
});
const operationFor = (key: LayoutKey, value: LayoutValue) =>
  ({ version: 3, type: "set-custom-launcher-layout", element: key, value }) as SetCustomLauncherLayoutV3;

const title = (key: LayoutKey) => `${labels[key][0]!.toUpperCase()}${labels[key].slice(1)}`;
const fieldsFor = (value: LayoutValue): Record<string, string> => {
  const fields: Record<string, string> = { x: String(value.position.x), y: String(value.position.y) };
  if ("width" in value) fields.width = String(value.width);
  if ("textColor" in value) {
    fields["textColor-red"] = String(value.textColor.r);
    fields["textColor-green"] = String(value.textColor.g);
    fields["textColor-blue"] = String(value.textColor.b);
  }
  if ("blendColor" in value) {
    fields["blendColor-red"] = String(value.blendColor.r);
    fields["blendColor-green"] = String(value.blendColor.g);
    fields["blendColor-blue"] = String(value.blendColor.b);
  }
  return fields;
};
const integer = (fields: Record<string, string>, field: string, label: string): number | InspectorError => {
  const value = fields[field] ?? "";
  if (!/^-?\d+$/.test(value)) return { field, message: `${label} must be an integer.` };
  return Number(value);
};
const validationError = (field: string, label: string, minimum: number, maximum: number): InspectorError => ({
  field,
  message: `${label} must be between ${minimum} and ${maximum}.`,
});

export const customLauncherLayoutInspectorValueV1 = (
  value: LayoutValue,
  fields: Record<string, string>,
): { value: LayoutValue } | { error: InspectorError } => {
  const width = "width" in value ? integer(fields, "width", "Width") : undefined;
  if (typeof width === "object") return { error: width };
  if (width !== undefined && (width < 1 || width > 256)) return { error: validationError("width", "Width", 1, 256) };
  const x = integer(fields, "x", "X"),
    y = integer(fields, "y", "Y");
  if (typeof x === "object") return { error: x };
  if (typeof y === "object") return { error: y };
  const maximumX = width === undefined ? 255 : 256 - width;
  if (x < 0 || x > maximumX) return { error: validationError("x", "X", 0, maximumX) };
  if (y < 0 || y > 191) return { error: validationError("y", "Y", 0, 191) };
  if (width !== undefined && width > 256 - x) return { error: validationError("width", "Width", 1, 256 - x) };
  const next = { ...value, position: { x, y } } as LayoutValue;
  if (width !== undefined) (next as { width: number }).width = width;
  for (const color of ["textColor", "blendColor"] as const) {
    if (!(color in value)) continue;
    const channels = ["red", "green", "blue"] as const;
    const values = channels.map((channel) => integer(fields, `${color}-${channel}`, `${color} ${channel}`));
    const invalid = values.find((candidate): candidate is InspectorError => typeof candidate === "object");
    if (invalid) return { error: invalid };
    const [red, green, blue] = values as number[];
    if ([red, green, blue].some((candidate) => candidate < 0 || candidate > 255))
      return { error: validationError(`${color}-red`, `${color} channels`, 0, 255) };
    (next as Record<string, unknown>)[color] = { r: red, g: green, b: blue };
  }
  return { value: next };
};

export function CustomLauncherLayoutEditor({
  committedLayout,
  commitStatus,
  inspectorHost,
  mode,
  disabled,
  onCommit,
}: {
  committedLayout: CustomLauncherLayoutDtoV1;
  commitStatus?: "committed" | "conflict";
  inspectorHost: HTMLElement | null;
  mode: LauncherPreviewModeV1;
  disabled: boolean;
  onCommit(expectedAuthoritySha256: string, operation: SetCustomLauncherLayoutV3): Promise<boolean>;
}) {
  const [selected, setSelected] = useState<LayoutKey>();
  const [draft, setDraft] = useState<LayoutDraft>();
  const [, setInspector] = useState<InspectorDraft>();
  const [error, setError] = useState<InspectorError>();
  const [announcement, setAnnouncement] = useState("");
  const draftRef = useRef<LayoutDraft | undefined>(undefined);
  const inspectorRef = useRef<InspectorDraft | undefined>(undefined);
  const commitRef = useRef<Promise<boolean> | undefined>(undefined);
  const cancelledInspectorBlur = useRef(false);
  const authority = useRef(committedLayout.authoritySha256);
  const targets = useRef(new Map<LayoutKey, HTMLButtonElement>());
  const inspectorInputs = useRef(new Map<string, HTMLInputElement>());
  const gesture = useRef<
    { key: LayoutKey; pointerId: number; start: { x: number; y: number }; value: LayoutValue } | undefined
  >(undefined);
  const effective = resolveCustomLauncherLayoutV1(committedLayout.overrides);
  const setLayoutDraft = (next: LayoutDraft | undefined) => {
    draftRef.current = next;
    setDraft(next);
  };
  const setInspectorDraft = (next: InspectorDraft | undefined) => {
    inspectorRef.current = next;
    setInspector(next);
  };

  useEffect(() => {
    if (authority.current === committedLayout.authoritySha256) return;
    authority.current = committedLayout.authoritySha256;
    gesture.current = undefined;
    setLayoutDraft(undefined);
    setInspectorDraft(undefined);
    setError(undefined);
    if (commitStatus === "conflict") {
      setAnnouncement("Layout conflict. Latest committed layout restored.");
      if (selected) queueMicrotask(() => targets.current.get(selected)?.focus());
    }
  }, [commitStatus, committedLayout.authoritySha256, selected]);

  const valueFor = (key: LayoutKey): LayoutValue =>
    draft?.key === key ? draft.value : (effective[key] as LayoutValue);
  const announceSelection = (key: LayoutKey) => {
    const target = customLauncherLayoutTargetV1(key, mode);
    setSelected(key);
    setInspectorDraft(undefined);
    setError(undefined);
    setAnnouncement(target.unavailable ? "Cover art is unavailable in Coverflow." : `${title(key)} selected.`);
  };
  const commit = async (key: LayoutKey, value: LayoutValue, message: string) => {
    if (commitRef.current) return commitRef.current;
    const saving = onCommit(committedLayout.authoritySha256, operationFor(key, value));
    commitRef.current = saving;
    try {
      if (await saving) {
        setLayoutDraft(undefined);
        setInspectorDraft(undefined);
        setError(undefined);
        setAnnouncement(message);
        return true;
      }
      return false;
    } finally {
      commitRef.current = undefined;
    }
  };
  const inputFields = (key: LayoutKey) =>
    inspectorRef.current?.key === key ? inspectorRef.current.fields : fieldsFor(valueFor(key));
  const updateInspector = (key: LayoutKey, field: string, raw: string) => {
    const fields = { ...inputFields(key), [field]: raw };
    setInspectorDraft({ key, fields });
    const candidate = customLauncherLayoutInspectorValueV1(effective[key] as LayoutValue, fields);
    if ("error" in candidate) {
      setError(candidate.error);
      return;
    }
    setError(undefined);
    setLayoutDraft({ key, value: candidate.value });
  };
  const cancelInspector = () => {
    cancelledInspectorBlur.current = true;
    gesture.current = undefined;
    setLayoutDraft(undefined);
    setInspectorDraft(undefined);
    setError(undefined);
    if (selected) setAnnouncement(`${title(selected)} edit cancelled.`);
  };
  const commitInspector = (key: LayoutKey) => {
    if (disabled || customLauncherLayoutTargetV1(key, mode).unavailable) return;
    const candidate = customLauncherLayoutInspectorValueV1(effective[key] as LayoutValue, inputFields(key));
    if ("error" in candidate) {
      setError(candidate.error);
      queueMicrotask(() => inspectorInputs.current.get(candidate.error.field)?.focus());
      return;
    }
    if (JSON.stringify(candidate.value) === JSON.stringify(effective[key])) {
      setLayoutDraft(undefined);
      setInspectorDraft(undefined);
      setError(undefined);
      return;
    }
    void commit(key, candidate.value, `${title(key)} saved.`);
  };
  const begin = (event: React.PointerEvent<HTMLButtonElement>, key: LayoutKey, unavailable: boolean) => {
    if (disabled || unavailable) return;
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by the Electron harness do not own a native pointer capture.
    }
    announceSelection(key);
    gesture.current = {
      key,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      value: valueFor(key),
    };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>, key: LayoutKey) => {
    const active = gesture.current;
    if (!active || active.key !== key || active.pointerId !== event.pointerId) return;
    const surface = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!surface?.width || !surface.height) return;
    const value = moveCustomLauncherLayoutV1(
      key,
      active.value,
      active.value.position.x + ((event.clientX - active.start.x) * 256) / surface.width,
      active.value.position.y + ((event.clientY - active.start.y) * 192) / surface.height,
    );
    setLayoutDraft({ key, value });
  };
  const finish = (event: React.PointerEvent<HTMLButtonElement>, key: LayoutKey) => {
    const active = gesture.current;
    if (!active || active.key !== key || active.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    const next = draftRef.current;
    if (!next || next.key !== key) return;
    void commit(key, next.value, `${title(key)} moved to ${next.value.position.x}, ${next.value.position.y}.`);
  };
  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, key: LayoutKey, unavailable: boolean) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInspector();
      return;
    }
    if (disabled || unavailable || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 1;
    const x = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
    const y = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
    const value = valueFor(key);
    const next = moveCustomLauncherLayoutV1(key, value, value.position.x + x, value.position.y + y);
    void commit(key, next, `${title(key)} moved to ${next.position.x}, ${next.position.y}.`);
  };
  const reset = (key: LayoutKey) => {
    if (disabled || customLauncherLayoutTargetV1(key, mode).unavailable || commitRef.current) return;
    const saving = onCommit(committedLayout.authoritySha256, {
      version: 3,
      type: "set-custom-launcher-layout",
      element: key,
    } as SetCustomLauncherLayoutV3);
    commitRef.current = saving;
    void saving
      .then((saved) => {
        if (!saved) return;
        setLayoutDraft(undefined);
        setInspectorDraft(undefined);
        setError(undefined);
        setAnnouncement(`${title(key)} reset to launcher default.`);
      })
      .finally(() => {
        commitRef.current = undefined;
      });
  };
  const selectedValue = selected ? valueFor(selected) : undefined;
  const selectedTarget = selected ? customLauncherLayoutTargetV1(selected, mode) : undefined;
  const selectedFields = selected ? inputFields(selected) : undefined;
  const selectedBounds = selectedValue ? customLauncherLayoutBoundsV1(selectedValue) : undefined;
  const inspectorPanel =
    inspectorHost && selected && selectedTarget && selectedValue && selectedFields && selectedBounds
      ? createPortal(
          <section className="custom-launcher-layout-inspector" aria-label="Launcher layout inspector" role="region">
            <header>
              <span>Launcher layout</span>
              <strong>{title(selected)}</strong>
            </header>
            <p className="custom-launcher-layout-announcement" aria-atomic="true" aria-live="polite" role="status">
              {announcement}
            </p>
            {selectedTarget.unavailable ? (
              <p className="custom-launcher-layout-unavailable">
                Cover art is unavailable in Coverflow. Choose a Grid or Banner List preview to edit it.
              </p>
            ) : (
              <>
                <div className="custom-launcher-layout-fields">
                  {(
                    [
                      ["x", "X", selectedBounds.x.minimum, selectedBounds.x.maximum],
                      ["y", "Y", selectedBounds.y.minimum, selectedBounds.y.maximum],
                      ...("width" in selectedValue
                        ? [["width", "Width", 1, 256 - Number(selectedFields.x || selectedValue.position.x)]]
                        : []),
                    ] as const
                  ).map(([field, label, minimum, maximum]) => {
                    const fieldName = String(field);
                    return (
                      <label key={fieldName}>
                        <span>{label}</span>
                        <input
                          ref={(input) => {
                            if (input) inspectorInputs.current.set(fieldName, input);
                            else inspectorInputs.current.delete(fieldName);
                          }}
                          aria-label={`${title(selected)} ${label}`}
                          disabled={disabled}
                          inputMode="numeric"
                          max={maximum}
                          min={minimum}
                          type="number"
                          value={selectedFields[fieldName] ?? ""}
                          onBlur={() => {
                            if (cancelledInspectorBlur.current) {
                              cancelledInspectorBlur.current = false;
                              return;
                            }
                            commitInspector(selected);
                          }}
                          onChange={(event) => updateInspector(selected, fieldName, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelInspector();
                            } else if (event.key === "Enter") {
                              event.preventDefault();
                              commitInspector(selected);
                            }
                          }}
                        />
                      </label>
                    );
                  })}
                  {(["textColor", "blendColor"] as const).flatMap((color) =>
                    color in selectedValue
                      ? (["red", "green", "blue"] as const).map((channel) => {
                          const field = `${color}-${channel}`;
                          const label = `${color === "textColor" ? "text color" : "blend color"} ${channel}`;
                          return (
                            <label key={field}>
                              <span>{label}</span>
                              <input
                                ref={(input) => {
                                  if (input) inspectorInputs.current.set(field, input);
                                  else inspectorInputs.current.delete(field);
                                }}
                                aria-label={`${title(selected)} ${label}`}
                                disabled={disabled}
                                inputMode="numeric"
                                max={255}
                                min={0}
                                type="number"
                                value={selectedFields[field] ?? ""}
                                onBlur={() => {
                                  if (cancelledInspectorBlur.current) {
                                    cancelledInspectorBlur.current = false;
                                    return;
                                  }
                                  commitInspector(selected);
                                }}
                                onChange={(event) => updateInspector(selected, field, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelInspector();
                                  } else if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitInspector(selected);
                                  }
                                }}
                              />
                            </label>
                          );
                        })
                      : [],
                  )}
                </div>
                {error && <p role="alert">{error.message}</p>}
                <button disabled={disabled} type="button" onClick={() => reset(selected)}>
                  Reset {labels[selected]}
                </button>
              </>
            )}
          </section>,
          inspectorHost,
        )
      : null;

  return (
    <>
      <section
        className="custom-launcher-layout-editor"
        aria-label="Custom launcher layout"
        data-layout-authority={committedLayout.authoritySha256}
        role="group"
      >
        {CUSTOM_LAUNCHER_LAYOUT_KEYS_V1.map((key) => {
          const target = customLauncherLayoutTargetV1(key, mode);
          const value = valueFor(key);
          const box = customLauncherLayoutHitboxV1(key, value);
          const name = target.unavailable ? `${title(key)} is unavailable in Coverflow` : `Select ${labels[key]}`;
          return (
            <button
              ref={(button) => {
                if (button) targets.current.set(key, button);
                else targets.current.delete(key);
              }}
              aria-disabled={target.unavailable || undefined}
              aria-label={name}
              aria-pressed={selected === key}
              className="launcher-layout-target"
              data-layout-draft={draft?.key === key || undefined}
              data-layout-target={key}
              data-unavailable={target.unavailable || undefined}
              disabled={disabled}
              key={key}
              style={{
                height: `${(box.height * 100) / 192}%`,
                left: `${(value.position.x * 100) / 256}%`,
                top: `${(value.position.y * 100) / 192}%`,
                width: `${(box.width * 100) / 256}%`,
              }}
              type="button"
              onClick={() => announceSelection(key)}
              onFocus={() => target.unavailable && announceSelection(key)}
              onKeyDown={(event) => moveWithKeyboard(event, key, target.unavailable)}
              onPointerCancel={cancelInspector}
              onPointerDown={(event) => begin(event, key, target.unavailable)}
              onPointerMove={(event) => move(event, key)}
              onPointerUp={(event) => finish(event, key)}
            >
              <span className="sr-only">{name}</span>
            </button>
          );
        })}
      </section>
      {inspectorPanel}
    </>
  );
}

export const customLauncherLayoutDraftV1 = (
  overrides: CustomLauncherLayoutOverridesV1,
  key: LayoutKey,
  x: number,
  y: number,
) => moveCustomLauncherLayoutV1(key, resolveCustomLauncherLayoutV1(overrides)[key] as LayoutValue, x, y);
