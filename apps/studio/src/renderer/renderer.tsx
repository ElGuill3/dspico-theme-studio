import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createPreviewModel, type PreviewModel } from "../../../../packages/theme-core/src/preview.js";
import type { StudioApi, StudioResult } from "../studio-ipc.js";

declare global {
  interface Window {
    studio: StudioApi;
  }
}
const defaults = { name: "My Material theme", description: "A focused theme for DSpico", author: "Theme author" };
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

function PhysicalPreview({ scene }: { scene: PreviewModel["scenes"][number] }) {
  const background = color(scene.tokens.background, scene.screen === "top" ? "#10243a" : "#eaf1f8");
  const accent = color(scene.tokens.accent, "#f4b942");
  const foreground = color(scene.tokens.foreground, scene.screen === "top" ? "#f7fafc" : "#14213d");
  return (
    <article className="physical-preview">
      <div className="screen-heading">
        <strong>{scene.screen} screen</strong>
        <span>
          {scene.width}×{scene.height}
        </span>
      </div>
      <div
        className={`ds-screen ${scene.screen}`}
        data-mode={scene.mode}
        data-screen={scene.screen}
        style={
          { "--screen-bg": background, "--screen-accent": accent, "--screen-ink": foreground } as React.CSSProperties
        }
      >
        <small>{scene.mode}</small>
        <h3>{scene.content.heading}</h3>
        <p>{scene.content.detail}</p>
        <div className="launcher-items">
          {scene.content.items.map((item) => (
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function Studio() {
  const [result, setResult] = useState<StudioResult>();
  const [status, setStatus] = useState("Create or open a local project to begin.");
  const [metadata, setMetadata] = useState(defaults);
  const [mode, setMode] = useState("home");
  const run = async (label: string, action: () => Promise<StudioResult>) => {
    try {
      const next = await action();
      setResult(next);
      setStatus(label);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The action could not be completed.");
    }
  };
  const editName = () =>
    run("Name saved atomically.", () =>
      window.studio.edit({ version: 1, type: "set-metadata", field: "name", value: metadata.name }),
    );
  // prettier-ignore
  return <main>
    <header><span className="mark">DS</span><div><p className="eyebrow">Offline Material workshop</p><h1>DSpico Theme Studio</h1></div></header>
    <nav aria-label="Project actions">
      <button onClick={() => run("Local project created.", () => window.studio.create({ projectId: "local-material", metadata }))}>New project</button>
      <button onClick={() => run("Project opened.", window.studio.open)}>Open</button><button onClick={() => run("Project saved.", window.studio.save)}>Save</button><span />
      <button onClick={() => run("Undone.", window.studio.undo)}>Undo</button><button onClick={() => run("Redone.", window.studio.redo)}>Redo</button>
    </nav>
    <section className="workbench"><article><p className="eyebrow">Project identity</p><h2>Material metadata</h2>
      {(["name", "description", "author"] as const).map((field) => <label key={field}>{field}<input value={metadata[field]} onChange={(event) => setMetadata({ ...metadata, [field]: event.target.value })} /></label>)}
      <button className="primary" disabled={!result?.project} onClick={editName}>Apply name</button>
    </article><aside><p className="eyebrow">Compatibility desk</p><h2>dspico-launcher-v1</h2><p className="status" aria-live="polite">{status}</p>
      <dl><div><dt>Project</dt><dd>{result?.project?.metadata.name ?? "Not loaded"}</dd></div><div><dt>Diagnostics</dt><dd>{result?.diagnostics?.length ?? "Not run"}</dd></div></dl>
      <div className="checks"><button onClick={() => run("Validation complete.", window.studio.validate)}>Run diagnostics</button><button className="primary" onClick={() => run("Local theme exported.", window.studio.export)}>Export theme</button></div>
      {result?.receipt && <output data-testid="export-receipt" data-report-sha256={result.receipt.reportSha256} data-zip-sha256={result.receipt.zipSha256}>
        <strong>Export receipt</strong><span>{result.receipt.files.join(" · ")}</span><code>{result.receipt.reportSha256}</code>
      </output>}
    </aside></section>
    {result?.project && (() => { const preview = createPreviewModel(result.project, mode); return <section className="preview-bench" aria-labelledby="preview-title">
      <div className="preview-title"><div><p className="eyebrow">Dual-screen workbench</p><h2 id="preview-title">Physical preview</h2></div>
        <div className="mode-switcher" aria-label="Launcher mode">{preview.modes.map((item) => <button className={item === preview.mode ? "active" : ""} aria-pressed={item === preview.mode} key={item} onClick={() => setMode(item)}>{item}</button>)}</div>
      </div>
      <div className="preview-stack">{preview.scenes.map((scene) => <PhysicalPreview key={scene.screen} scene={scene} />)}</div>
      <div className="fidelity-notes">{preview.fidelity.map(({ label, properties }) => <p key={label}><strong>{label}</strong><span>{properties.join(" · ")}</span></p>)}</div>
      <p className="preview-boundary">Preview appearance is illustrative. Compatibility and export readiness come only from validation.</p>
    </section>; })()}
    <footer>Local files only · Material authoring · No cloud or AI services</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Studio />);
