import { useEffect, useRef, useState } from "react";
import {
  CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
  type CustomLauncherLayoutKeyV1,
  type CustomLauncherLayoutOverridesV1,
} from "../../../../packages/dspico-contract/src/custom-v1-3.js";
import type { SetCustomLauncherLayoutV3 } from "../../../../packages/theme-core/src/index.js";
import type { CustomLauncherLayoutDtoV1 } from "../studio-ipc.js";
import {
  resolveCustomLauncherLayoutV1,
  type EffectiveCustomLauncherLayoutV1,
  type LauncherPreviewModeV1,
} from "./launcher-preview/authority.js";

type LayoutKey = CustomLauncherLayoutKeyV1;
type LayoutValue = EffectiveCustomLauncherLayoutV1[LayoutKey];
type LayoutDraft = { key: LayoutKey; value: LayoutValue };

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

const hitbox = (key: LayoutKey, value: LayoutValue) => ({
  width: "width" in value ? value.width : key === "topCover" ? 50 : 24,
  height: key === "topCover" ? 50 : 12,
});
const operationFor = (key: LayoutKey, value: LayoutValue) =>
  ({ version: 3, type: "set-custom-launcher-layout", element: key, value }) as SetCustomLauncherLayoutV3;

export function CustomLauncherLayoutEditor({
  committedLayout,
  mode,
  disabled,
  onCommit,
}: {
  committedLayout: CustomLauncherLayoutDtoV1;
  mode: LauncherPreviewModeV1;
  disabled: boolean;
  onCommit(expectedAuthoritySha256: string, operation: SetCustomLauncherLayoutV3): Promise<boolean>;
}) {
  const [selected, setSelected] = useState<LayoutKey>();
  const [draft, setDraft] = useState<LayoutDraft>();
  const draftRef = useRef<LayoutDraft | undefined>(undefined);
  const gesture = useRef<
    { key: LayoutKey; pointerId: number; start: { x: number; y: number }; value: LayoutValue } | undefined
  >(undefined);
  const effective = resolveCustomLauncherLayoutV1(committedLayout.overrides);
  const setLayoutDraft = (next: LayoutDraft | undefined) => {
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => setLayoutDraft(undefined), [committedLayout.authoritySha256]);

  const valueFor = (key: LayoutKey): LayoutValue =>
    draft?.key === key ? draft.value : (effective[key] as LayoutValue);
  const commit = async (key: LayoutKey, value: LayoutValue) => {
    if (await onCommit(committedLayout.authoritySha256, operationFor(key, value))) setLayoutDraft(undefined);
  };
  const begin = (event: React.PointerEvent<HTMLButtonElement>, key: LayoutKey, unavailable: boolean) => {
    if (disabled || unavailable) return;
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by the Electron harness do not own a native pointer capture.
    }
    setSelected(key);
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
    void commit(key, next.value);
  };
  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, key: LayoutKey, unavailable: boolean) => {
    if (disabled || unavailable || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 1;
    const x = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
    const y = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
    const value = valueFor(key);
    void commit(key, moveCustomLauncherLayoutV1(key, value, value.position.x + x, value.position.y + y));
  };

  return (
    <section className="custom-launcher-layout-editor" aria-label="Custom launcher layout" role="group">
      {CUSTOM_LAUNCHER_LAYOUT_KEYS_V1.map((key) => {
        const target = customLauncherLayoutTargetV1(key, mode);
        const value = valueFor(key);
        const box = hitbox(key, value);
        const selectedTarget = selected === key;
        const name = target.unavailable
          ? `${labels[key][0]!.toUpperCase()}${labels[key].slice(1)} is unavailable in Coverflow`
          : `Select ${labels[key]}`;
        return (
          <button
            aria-disabled={target.unavailable || undefined}
            aria-label={name}
            aria-pressed={selectedTarget}
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
            onClick={() => !target.unavailable && setSelected(key)}
            onKeyDown={(event) => moveWithKeyboard(event, key, target.unavailable)}
            onPointerCancel={() => {
              gesture.current = undefined;
              setLayoutDraft(undefined);
            }}
            onPointerDown={(event) => begin(event, key, target.unavailable)}
            onPointerMove={(event) => move(event, key)}
            onPointerUp={(event) => finish(event, key)}
          >
            <span className="sr-only">{name}</span>
          </button>
        );
      })}
    </section>
  );
}

export const customLauncherLayoutDraftV1 = (
  overrides: CustomLauncherLayoutOverridesV1,
  key: LayoutKey,
  x: number,
  y: number,
) => moveCustomLauncherLayoutV1(key, resolveCustomLauncherLayoutV1(overrides)[key] as LayoutValue, x, y);
