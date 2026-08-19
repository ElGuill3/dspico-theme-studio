import { useEffect, useRef, useState } from "react";
import { THEME_SOUND_ROLES_V1 } from "../../../../packages/dspico-contract/src/theme-sounds-v1.js";
import type {
  PreparedThemeSoundV1,
  ThemeSoundRoleV1,
  WavRecipeV1,
} from "../../../../packages/dspico-contract/src/theme-sounds-v1.js";

const roles: ThemeSoundRoleV1[] = [...THEME_SOUND_ROLES_V1];
const defaults: WavRecipeV1 = { trimStartMs: 0, trimEndMs: 0, fadeInMs: 0, fadeOutMs: 0, gainPercent: 100 };
const labels: Record<keyof WavRecipeV1, string> = {
  trimStartMs: "Trim start (ms)",
  trimEndMs: "Trim end (ms)",
  fadeInMs: "Fade in (ms)",
  fadeOutMs: "Fade out (ms)",
  gainPercent: "Gain (%)",
};

function SoundEditor({
  role,
  sound,
  present,
  disabled,
  url,
  registerAudio,
  onPrepare,
  onRemove,
  onError,
  onPlay,
}: {
  role: ThemeSoundRoleV1;
  sound?: PreparedThemeSoundV1;
  present: boolean;
  disabled: boolean;
  url?: string;
  registerAudio(role: ThemeSoundRoleV1, audio: HTMLAudioElement | null): void;
  onPrepare(role: ThemeSoundRoleV1, sourceBytes: Uint8Array, originalName: string, recipe: WavRecipeV1): Promise<void>;
  onRemove(role: ThemeSoundRoleV1): Promise<void>;
  onError(error: unknown): void;
  onPlay(role: ThemeSoundRoleV1): void;
}) {
  const [recipe, setRecipe] = useState(sound?.recipe ?? defaults);
  useEffect(() => setRecipe(sound?.recipe ?? defaults), [sound]);
  const duration = sound ? Math.max(0, (sound.prepared.bytes.length - 44) / 2 / sound.format.sampleRate) : 0;
  const prepare = (sourceBytes: Uint8Array, originalName: string, nextRecipe = recipe) =>
    onPrepare(role, sourceBytes, originalName, nextRecipe);
  return (
    <article data-audio-role={role} data-state={sound ? "prepared" : present ? "invalid" : "omitted"}>
      <header>
        <strong>{role[0]!.toUpperCase() + role.slice(1)}</strong>
        <span>{sound ? "Ready" : present ? "Needs attention" : "Optional"}</span>
      </header>
      {sound ? (
        <>
          <dl className="audio-facts">
            <div>
              <dt>Duration</dt>
              <dd>{duration.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>PCM mono · 22,050 Hz · 16-bit</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{sound.prepared.bytes.length.toLocaleString()} / 16,384 bytes</dd>
            </div>
          </dl>
          <strong>Desktop audition</strong>
          <p className="audio-boundary">Useful for editing only; playback does not claim hardware parity.</p>
          <div data-waveform role="img" aria-label={`${role} waveform, Desktop audition`}>
            {sound.audition.waveform.join(" ")}
          </div>
          <audio
            ref={(audio) => registerAudio(role, audio)}
            controls
            data-audition="Desktop audition"
            preload="metadata"
            src={url}
            onPlay={() => onPlay(role)}
          />
          <fieldset className="audio-recipe">
            <legend>Committed recipe</legend>
            {(Object.keys(labels) as (keyof WavRecipeV1)[]).map((key) => (
              <label key={key}>
                <span>{labels[key]}</span>
                <input
                  type="number"
                  min={0}
                  max={key === "gainPercent" ? 400 : key.startsWith("fade") ? 10000 : 60000}
                  step={1}
                  value={recipe[key]}
                  disabled={disabled}
                  onChange={(event) => setRecipe((current) => ({ ...current, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
            <button
              type="button"
              disabled={disabled || JSON.stringify(recipe) === JSON.stringify(sound.recipe)}
              onClick={() => void prepare(sound.source.bytes, sound.source.provenance.originalName)}
            >
              Apply audio edits
            </button>
          </fieldset>
        </>
      ) : present ? (
        <p>The assigned WAV is missing or invalid. Replace it or remove it to clear its export diagnostic.</p>
      ) : (
        <p>No sound assigned. Visual export remains available without it.</p>
      )}
      <div className="audio-actions">
        <label>
          {present ? `Replace ${role} WAV` : `Assign ${role} WAV`}
          <input
            accept=".wav,audio/wav"
            disabled={disabled}
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file)
                void file
                  .arrayBuffer()
                  .then((bytes) => prepare(new Uint8Array(bytes), file.name, defaults))
                  .catch(onError);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {present && (
          <button type="button" disabled={disabled} onClick={() => void onRemove(role)}>
            Remove {role} sound
          </button>
        )}
      </div>
    </article>
  );
}

export function AudioWorkbench({
  onPrepare,
  onRemove,
  initialSounds = {},
  presentRoles = [],
  disabled = false,
  onError,
}: {
  onPrepare(role: ThemeSoundRoleV1, sourceBytes: Uint8Array, originalName: string, recipe: WavRecipeV1): Promise<void>;
  onRemove(role: ThemeSoundRoleV1): Promise<void>;
  initialSounds?: Partial<Record<ThemeSoundRoleV1, PreparedThemeSoundV1>>;
  presentRoles?: readonly ThemeSoundRoleV1[];
  disabled?: boolean;
  onError(error: unknown): void;
}) {
  const [urls, setUrls] = useState<Partial<Record<ThemeSoundRoleV1, string>>>({});
  const audio = useRef<Partial<Record<ThemeSoundRoleV1, HTMLAudioElement>>>({});
  useEffect(() => {
    const next = Object.fromEntries(
      Object.entries(initialSounds).map(([role, sound]) => [
        role,
        URL.createObjectURL(
          new Blob([new Uint8Array(sound!.prepared.bytes).buffer as ArrayBuffer], { type: "audio/wav" }),
        ),
      ]),
    ) as Partial<Record<ThemeSoundRoleV1, string>>;
    setUrls(next);
    return () => {
      Object.values(audio.current).forEach((element) => {
        element.pause();
        element.removeAttribute("src");
        element.load();
      });
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [initialSounds]);
  const onPlay = (role: ThemeSoundRoleV1) =>
    Object.entries(audio.current).forEach(([candidate, element]) => {
      if (candidate !== role) element?.pause();
    });
  return (
    <section className="audio-workbench" data-testid="audio-workbench" aria-labelledby="audio-workbench-title">
      <h2 id="audio-workbench-title">UI sounds</h2>
      <div className="audio-role-grid">
        {roles.map((role) => (
          <SoundEditor
            key={role}
            role={role}
            sound={initialSounds[role]}
            present={presentRoles.includes(role)}
            disabled={disabled}
            url={urls[role]}
            registerAudio={(candidate, element) => {
              if (element) audio.current[candidate] = element;
              else delete audio.current[candidate];
            }}
            onPrepare={onPrepare}
            onRemove={onRemove}
            onError={onError}
            onPlay={onPlay}
          />
        ))}
      </div>
      <article className="bgm-workbench" data-testid="bgm-workbench" data-state="unavailable">
        <strong>BGM</strong>
        <span>BGM import is not available in this release. Existing compatible project BGM remains preserved.</span>
      </article>
    </section>
  );
}
