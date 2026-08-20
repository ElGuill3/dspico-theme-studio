import { afterEach, expect, it, vi } from "vitest";

import { closeElectronApp, ELECTRON_CLOSE_GRACE_MS, type ElectronCleanupDiagnostic } from "./electron-app-close.js";

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("closes gracefully before the deadline without inspecting or signaling the child", async () => {
  vi.useFakeTimers();
  const process = vi.fn(() => ({ pid: 321, exitCode: null, signalCode: null }));
  const kill = vi.fn(() => true);
  const report = vi.fn();

  await expect(
    closeElectronApp({ close: vi.fn(async () => {}), process }, { kill, platform: "linux", report }),
  ).resolves.toBeUndefined();

  expect(process).not.toHaveBeenCalled();
  expect(kill).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});

it("signals the Linux process group when the leader exited before the grace deadline", async () => {
  vi.useFakeTimers();
  const kill = vi.fn(() => true);
  const report = vi.fn<(diagnostic: ElectronCleanupDiagnostic) => void>();
  const cleanup = closeElectronApp(
    {
      close: vi.fn(() => new Promise<void>(() => {})),
      process: vi.fn(() => ({ pid: 321, exitCode: 0, signalCode: null })),
    },
    { kill, platform: "linux", report },
  );
  let settled = false;
  void cleanup.then(() => {
    settled = true;
  });

  await vi.advanceTimersByTimeAsync(ELECTRON_CLOSE_GRACE_MS - 1);
  expect(settled).toBe(false);
  expect(kill).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  await cleanup;

  expect(settled).toBe(true);
  expect(kill).toHaveBeenCalledOnce();
  expect(kill).toHaveBeenCalledWith(-321, "SIGKILL");
  expect(report).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledWith({
    event: "electron-cleanup",
    outcome: "deadline-expired",
    pid: 321,
    exitCode: 0,
    signalCode: null,
    killTarget: -321,
    killResult: "sent",
    errorClass: null,
    errorCode: null,
  });
});

it("handles a rejected close and cleans up the owned process without an unhandled rejection", async () => {
  vi.useFakeTimers();
  const closeError = Object.assign(new Error("private close failure"), {
    code: "ECLOSE",
  });
  const kill = vi.fn(() => true);
  const report = vi.fn<(diagnostic: ElectronCleanupDiagnostic) => void>();

  await expect(
    closeElectronApp(
      {
        close: vi.fn(() => Promise.reject(closeError)),
        process: vi.fn(() => ({ pid: 654, exitCode: null, signalCode: null })),
      },
      { kill, platform: "linux", report },
    ),
  ).resolves.toBeUndefined();

  expect(kill).toHaveBeenCalledWith(-654, "SIGKILL");
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "close-rejected",
      killResult: "sent",
      errorClass: "Error",
      errorCode: "ECLOSE",
    }),
  );
});

it("reports a kill failure while preserving the caller failure", async () => {
  vi.useFakeTimers();
  const callerError = new Error("original test failure");
  const killError = Object.assign(new Error("/private/workspace should not be reported"), { code: "EPERM" });
  const report = vi.fn<(diagnostic: ElectronCleanupDiagnostic) => void>();
  let observed: unknown;
  const caller = (async () => {
    try {
      throw callerError;
    } finally {
      await closeElectronApp(
        {
          close: vi.fn(() => new Promise<void>(() => {})),
          process: vi.fn(() => ({
            pid: 987,
            exitCode: null,
            signalCode: null,
          })),
        },
        {
          kill: vi.fn(() => {
            throw killError;
          }),
          platform: "linux",
          report,
        },
      );
    }
  })().catch((error: unknown) => {
    observed = error;
  });

  await vi.advanceTimersByTimeAsync(ELECTRON_CLOSE_GRACE_MS);
  await caller;

  expect(observed).toBe(callerError);
  expect(report).toHaveBeenCalledOnce();
  const diagnostic = report.mock.calls[0]?.[0];
  expect(diagnostic).toMatchObject({
    outcome: "deadline-expired",
    pid: 987,
    killTarget: -987,
    killResult: "failed",
    errorClass: "Error",
    errorCode: "EPERM",
  });
  expect(JSON.stringify(diagnostic)).not.toContain("private/workspace");
});

it("does not signal a child that already exited after close rejects", async () => {
  vi.useFakeTimers();
  const kill = vi.fn(() => true);
  const report = vi.fn<(diagnostic: ElectronCleanupDiagnostic) => void>();

  await closeElectronApp(
    {
      close: vi.fn(() => Promise.reject(new Error("close failed"))),
      process: vi.fn(() => ({ pid: 741, exitCode: 0, signalCode: null })),
    },
    { kill, platform: "linux", report },
  );

  expect(kill).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ killTarget: null, killResult: "already-exited" }));
});
