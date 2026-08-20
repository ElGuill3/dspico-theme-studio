export const ELECTRON_CLOSE_GRACE_MS = 5_000;

type ElectronChildProcess = {
  pid?: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
};

export type ElectronApplicationForCleanup = {
  close(): Promise<void>;
  process(): ElectronChildProcess;
};

type CleanupOutcome = "close-rejected" | "deadline-expired";
type KillResult = "sent" | "failed" | "already-exited" | "pid-unavailable" | "status-unavailable";

export type ElectronCleanupDiagnostic = {
  event: "electron-cleanup";
  outcome: CleanupOutcome;
  pid: number | null;
  exitCode: number | null;
  signalCode: string | null;
  killTarget: number | null;
  killResult: KillResult;
  errorClass: string | null;
  errorCode: string | null;
};

type CleanupDependencies = {
  kill?: (pid: number, signal: NodeJS.Signals) => boolean;
  platform?: NodeJS.Platform;
  report?: (diagnostic: ElectronCleanupDiagnostic) => void;
};

type CloseResult = { outcome: "graceful" } | { outcome: "close-rejected"; error: unknown };
const SAFE_ERROR_TOKEN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeErrorToken = (value: unknown): string | null =>
  typeof value === "string" && SAFE_ERROR_TOKEN.test(value) ? value : null;

const errorIdentity = (error: unknown): Pick<ElectronCleanupDiagnostic, "errorClass" | "errorCode"> => {
  if (!error || (typeof error !== "object" && typeof error !== "function"))
    return { errorClass: null, errorCode: null };
  try {
    const candidate = error as { name?: unknown; code?: unknown; constructor?: { name?: unknown } };
    return {
      errorClass: safeErrorToken(candidate.name) ?? safeErrorToken(candidate.constructor?.name),
      errorCode: safeErrorToken(candidate.code),
    };
  } catch {
    return { errorClass: null, errorCode: null };
  }
};

const defaultReport = (diagnostic: ElectronCleanupDiagnostic): void => {
  console.error(JSON.stringify(diagnostic));
};

export const closeElectronApp = async (
  electronApp: ElectronApplicationForCleanup,
  dependencies: CleanupDependencies = {},
): Promise<void> => {
  const kill = dependencies.kill ?? process.kill;
  const platform = dependencies.platform ?? process.platform;
  const report = dependencies.report ?? defaultReport;
  let timer: NodeJS.Timeout | undefined;

  try {
    let closeResult: Promise<CloseResult>;
    try {
      closeResult = Promise.resolve(electronApp.close()).then<CloseResult, CloseResult>(
        () => ({ outcome: "graceful" }),
        (error: unknown) => ({ outcome: "close-rejected", error }),
      );
    } catch (error) {
      closeResult = Promise.resolve({ outcome: "close-rejected", error });
    }

    const result = await Promise.race<CloseResult | { outcome: "deadline-expired" }>([
      closeResult,
      new Promise<{ outcome: "deadline-expired" }>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: "deadline-expired" }), ELECTRON_CLOSE_GRACE_MS);
      }),
    ]);
    if (result.outcome === "graceful") return;

    let pid: number | null = null;
    let exitCode: number | null = null;
    let signalCode: string | null = null;
    let killTarget: number | null = null;
    let killResult: KillResult = "status-unavailable";
    let cleanupError: unknown = result.outcome === "close-rejected" ? result.error : undefined;

    try {
      const child = electronApp.process();
      pid = typeof child.pid === "number" && Number.isSafeInteger(child.pid) ? child.pid : null;
      exitCode = child.exitCode;
      signalCode = child.signalCode;
      if (child.exitCode !== null || child.signalCode !== null) {
        killResult = "already-exited";
      } else if (pid === null || pid <= 0) {
        killResult = "pid-unavailable";
      } else {
        killTarget = platform === "win32" ? pid : -pid;
        try {
          kill(killTarget, "SIGKILL");
          killResult = "sent";
        } catch (error) {
          killResult = "failed";
          cleanupError = error;
        }
      }
    } catch (error) {
      cleanupError = error;
    }

    try {
      report({
        event: "electron-cleanup",
        outcome: result.outcome,
        pid,
        exitCode,
        signalCode,
        killTarget,
        killResult,
        ...errorIdentity(cleanupError),
      });
    } catch {
      // Cleanup diagnostics must not replace the original test failure.
    }
  } catch {
    // Cleanup must not replace the original test failure.
  } finally {
    if (timer) clearTimeout(timer);
  }
};
