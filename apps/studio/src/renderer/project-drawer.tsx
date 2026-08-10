import { useEffect, useRef, type ReactNode } from "react";

export type ProjectDrawerTab = "details" | "assets" | "audio" | "export";

const tabs: readonly { id: ProjectDrawerTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "assets", label: "Assets" },
  { id: "audio", label: "Audio" },
  { id: "export", label: "Export" },
];

export function ProjectDrawer({
  tab,
  onTab,
  onClose,
  panels,
}: {
  tab: ProjectDrawerTab;
  onTab(tab: ProjectDrawerTab): void;
  onClose(): void;
  panels: Record<ProjectDrawerTab, ReactNode>;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const frame = requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus(),
    );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      returnTo?.focus();
    };
  }, []);

  return (
    <div className="project-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="project-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-drawer-title"
      >
        <header>
          <div>
            <span>Project administration</span>
            <h2 id="project-drawer-title">Project</h2>
          </div>
          <button type="button" data-drawer-close aria-label="Close Project drawer" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="project-drawer-tabs" role="tablist" aria-label="Project sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`project-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`project-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <section
          className="project-drawer-content"
          id={`project-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`project-tab-${tab}`}
          tabIndex={0}
        >
          {panels[tab]}
        </section>
      </div>
    </div>
  );
}
