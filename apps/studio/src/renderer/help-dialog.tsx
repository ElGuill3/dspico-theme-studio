import { useEffect, useRef } from "react";
import { SHORTCUTS } from "./shortcuts.js";

export function HelpDialog({ mode, onClose }: { mode: "onboarding" | "help"; onClose(): void }) {
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const element = panel.current;
    element?.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = [
        ...element.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'),
      ];
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      returnFocus.current?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={panel} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header>
          <div>
            <span>{mode === "onboarding" ? "First run" : "Reference"}</span>
            <h2 id="help-title">{mode === "onboarding" ? "Build a theme in seven documents" : "Help and shortcuts"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close help">
            Close
          </button>
        </header>
        {mode === "onboarding" ? (
          <div className="onboarding-content">
            <ol>
              <li>
                <strong>Create or open a project.</strong> New projects use a folder you choose; Open project accepts a
                project folder or its project.json.
              </li>
              <li>
                <strong>Choose one of seven visual documents.</strong> Edit top and bottom backgrounds, grid cells,
                banner cells, or the scrim.
              </li>
              <li>
                <strong>Add and edit layers.</strong> Use images, shapes, and text; history supports undo and redo.
              </li>
              <li>
                <strong>Work is saved as it commits.</strong> Valid field edits save on blur; explicit layer changes
                save when applied.
              </li>
              <li>
                <strong>Run diagnostics, then export.</strong> A successful export creates both a folder and ZIP.
              </li>
              <li>
                <strong>Copy to SD manually.</strong> The Studio does not write to or verify an SD card.
              </li>
            </ol>
            <p>
              Desktop previews are useful approximations. Hardware behavior remains unknown until you test the exported
              files on your own device.
            </p>
          </div>
        ) : (
          <>
            {(["Selection", "Edit", "View"] as const).map((group) => (
              <section key={group} aria-labelledby={`shortcut-${group.toLowerCase()}`}>
                <h3 id={`shortcut-${group.toLowerCase()}`}>{group}</h3>
                <dl className="shortcut-list">
                  {SHORTCUTS.filter((item) => item.group === group).map((item) => (
                    <div key={item.id}>
                      <dt>
                        <kbd>{item.keys}</kbd>
                      </dt>
                      <dd>{item.label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <section aria-labelledby="troubleshooting-title">
              <h3 id="troubleshooting-title">Troubleshooting</h3>
              <dl className="troubleshooting-list">
                <div>
                  <dt>Export is blocked</dt>
                  <dd>
                    Run diagnostics and fix or remove each item marked as an error. Missing optional sounds do not block
                    export.
                  </dd>
                </div>
                <div>
                  <dt>Project is corrupt or recovering</dt>
                  <dd>Keep the project files in place, restore a known-good backup, then reopen the project.</dd>
                </div>
                <div>
                  <dt>BGM is unsupported</dt>
                  <dd>
                    BGM authoring is unavailable. Existing compatible BGM is preserved, but invalid existing BGM can
                    block export.
                  </dd>
                </div>
                <div>
                  <dt>Copying to SD</dt>
                  <dd>
                    Export the theme, reveal the folder or ZIP, and copy it manually. Device behavior is not verified by
                    the desktop preview.
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
