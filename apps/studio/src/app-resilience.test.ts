import { describe, expect, it } from "vitest";
import {
  CrashFrequency,
  DraftCloseHandshake,
  isCancellation,
  safeErrorMessage,
  settleNativeAction,
} from "./app-resilience.js";

describe("app resilience", () => {
  it("redacts local paths and replaces unexpected failures", () => {
    expect(safeErrorMessage(new Error("WAV media missing at /home/person/private/input.wav"))).toBe(
      "WAV media missing at [local path]",
    );
    expect(safeErrorMessage(new Error("boom\n    at /home/person/app.ts:4"))).toBe(
      "The app could not complete that action. Your committed project files were not changed.",
    );
    expect(isCancellation(new Error("Export cancelled"))).toBe(true);
  });

  it("recursively redacts every local path form without traversing cycles", () => {
    const cycle: Record<string, unknown> = { message: "Project media missing at \\\\server\\share\\Ada\\song.wav" };
    cycle.self = cycle;
    const nested = Object.assign(new Error("Project failed at \\\\?\\C:\\Users\\Ada\\theme"), {
      cause: [
        new DOMException("Media missing from file:///home/ada/private.wav"),
        { path: "C:/Users/Ada\\Theme/input.wav", cycle },
      ],
    });
    const message = safeErrorMessage(nested);
    expect(message).toContain("[local path]");
    for (const secret of ["server", "share", "Ada", "Users", "home", "private.wav"])
      expect(message).not.toContain(secret);
    expect(message.length).toBeLessThanOrEqual(360);
  });

  it("bounds recovery offers per session window", () => {
    const frequency = new CrashFrequency(2, 1_000);
    expect(frequency.record(0)).toBe(true);
    expect(frequency.record(100)).toBe(true);
    expect(frequency.record(200)).toBe(false);
    expect(frequency.record(2_000)).toBe(true);
  });

  it("only blocks close while a draft requires a decision", () => {
    const close = new DraftCloseHandshake();
    expect(close.begin()).toBe("close");
    close.update(true);
    expect(close.begin()).toBe("prepare");
    expect(close.begin()).toBe("wait");
    expect(close.acknowledge("invalid")).toBe("confirm");
    close.discard();
    expect(close.begin()).toBe("close");
  });

  it("keeps a slow valid commit pending beyond the old timeout and closes on its clean acknowledgement", () => {
    const close = new DraftCloseHandshake();
    close.update(true);
    expect(close.begin()).toBe("prepare");
    expect(close.acknowledge("committing")).toBe("wait");
    expect(close.noResponse()).toBe("ignore");
    expect(close.begin()).toBe("wait");
    expect(close.acknowledge("clean")).toBe("close");
  });

  it("reports a renderer that never acknowledges close", () => {
    const close = new DraftCloseHandshake();
    close.update(true);
    expect(close.begin()).toBe("prepare");
    expect(close.noResponse()).toBe("unresponsive");
  });

  it("settles dialog and failure-handler rejections", async () => {
    const failures: unknown[] = [];
    await expect(
      settleNativeAction(
        Promise.reject(new Error("dialog failed")),
        () => undefined,
        (error) => {
          failures.push(error);
          throw new Error("report failed");
        },
      ),
    ).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
  });
});
