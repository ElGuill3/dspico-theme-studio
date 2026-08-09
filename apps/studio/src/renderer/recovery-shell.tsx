import { Component, useEffect, useRef, useState, type ReactNode } from "react";

function RecoveryPanel({ message = "The editor stopped unexpectedly." }: { message?: string }) {
  const reloadButton = useRef<HTMLButtonElement>(null);
  useEffect(() => reloadButton.current?.focus(), []);
  const reload = (reopenProject: boolean) => window.studio.reloadEditor(reopenProject);
  return (
    <main className="recovery-panel" role="alert">
      <section>
        <span>Editor recovery</span>
        <h1>{message}</h1>
        <p>Committed work is saved in the project folder. An uncommitted field draft may need to be entered again.</p>
        <div>
          <button ref={reloadButton} className="primary" onClick={() => reload(false)}>
            Reload editor
          </button>
          <button onClick={() => reload(true)}>Reload and reopen project</button>
        </div>
      </section>
    </main>
  );
}

export class StudioErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    void error;
    /* The renderer deliberately does not expose failure internals. */
  }
  render() {
    return this.state.failed ? <RecoveryPanel /> : this.props.children;
  }
}

export function GlobalFailureCapture({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const failError = (event: ErrorEvent) => {
      if (!event.error) return;
      event.preventDefault();
      setFailed(true);
    };
    const failRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setFailed(true);
    };
    window.addEventListener("error", failError);
    window.addEventListener("unhandledrejection", failRejection);
    return () => {
      window.removeEventListener("error", failError);
      window.removeEventListener("unhandledrejection", failRejection);
    };
  }, []);
  return failed ? <RecoveryPanel /> : children;
}
