import { describe, expect, it, vi } from "vitest";
import type { OperationV1 } from "../../../../packages/theme-core/src/index.js";
import { createDraftStateAggregator, DraftAuthority, type DraftEdit } from "./draft-authority.js";

const operation = (value: string): OperationV1 => ({ version: 1, type: "set-token", key: "background", value });

function harness(persist: (field: string, edit: DraftEdit) => Promise<boolean | void> = async () => undefined) {
  const invalidated = vi.fn();
  const invalid = vi.fn();
  const failed = vi.fn();
  const authority = new DraftAuthority(
    { persist, onDraftChange: invalidated, onInvalid: invalid, onFailure: failed },
    350,
  );
  return { authority, invalidated, invalid, failed };
}

describe("draft authority", () => {
  it.each(["save", "validate", "export"])("flushes the latest value before %s", async (name) => {
    const events: string[] = [];
    const { authority } = harness(async (_field, edit) => {
      events.push(`edit:${"value" in edit.operation ? edit.operation.value : ""}`);
    });
    authority.schedule("global.background", operation("#123456"), "home");

    await authority.run(async () => void events.push(name));

    expect(events).toEqual(["edit:#123456", name]);
  });

  it("flushes an immediate edit and then undoes it", async () => {
    const history = ["#10243a"];
    const { authority } = harness(async (_field, edit) => {
      if ("value" in edit.operation) history.push(String(edit.operation.value));
    });
    authority.schedule("global.background", operation("#123456"), "home");

    await authority.run(async () => history.pop());

    expect(history).toEqual(["#10243a"]);
  });

  it("keeps a flushed edit authoritative when a lifecycle action is canceled", async () => {
    const persisted: string[] = [];
    const { authority } = harness(async (_field, edit) => {
      if ("value" in edit.operation) persisted.push(String(edit.operation.value));
    });
    authority.schedule("global.background", operation("#123456"), "home");

    await expect(authority.run(async () => Promise.reject(new Error("Canceled")))).rejects.toThrow("Canceled");
    await authority.run(async () => undefined);

    expect(persisted).toEqual(["#123456"]);
  });

  it("does not run an authoritative action when flushing persistence fails", async () => {
    const action = vi.fn(async () => undefined);
    const { authority, failed } = harness(async () => Promise.reject(new Error("Disk full")));
    authority.schedule("global.background", operation("#123456"), "home");

    await expect(authority.run(action)).resolves.toEqual({ ran: false });

    expect(action).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(
      "global.background",
      expect.objectContaining({ revision: 1 }),
      expect.any(Error),
      true,
    );
  });

  it("treats a rejected persistence result as a latest-value failure", async () => {
    const { authority, failed } = harness(async () => false);
    authority.schedule("global.background", operation("#123456"), "home");

    await expect(authority.flush()).resolves.toBe(false);

    expect(failed).toHaveBeenCalledWith(
      "global.background",
      expect.objectContaining({ revision: 1 }),
      expect.any(Error),
      true,
    );
  });

  it("blocks authoritative actions while a hex draft is invalid", async () => {
    const persist = vi.fn(async () => undefined);
    const action = vi.fn(async () => undefined);
    const { authority, invalid } = harness(persist);
    authority.schedule("global.background", operation("invalid"), "home", false);

    await expect(authority.run(action)).resolves.toEqual({ ran: false });

    expect(persist).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledWith(["global.background"]);
  });

  it("does not double commit across blur, debounce, and an explicit flush", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const { authority } = harness(persist);
    authority.schedule("global.background", operation("#123456"), "home");

    const blur = authority.flushField("global.background");
    const action = authority.run(async () => undefined);
    await vi.advanceTimersByTimeAsync(350);
    await Promise.all([blur, action]);

    expect(persist).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("coalesces rapid changes to the latest stable value", async () => {
    vi.useFakeTimers();
    const persist = vi.fn<(field: string, edit: DraftEdit) => Promise<void>>().mockResolvedValue(undefined);
    const { authority } = harness(persist);
    authority.schedule("global.background", operation("#111111"), "home");
    authority.schedule("global.background", operation("#222222"), "home");
    authority.schedule("global.background", operation("#333333"), "home");

    await vi.advanceTimersByTimeAsync(350);

    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0]?.[1].operation).toEqual(operation("#333333"));
    vi.useRealTimers();
  });

  it("keeps a manual authority local until the interaction is explicitly flushed", async () => {
    vi.useFakeTimers();
    const persist = vi.fn<(field: string, edit: DraftEdit) => Promise<void>>(async () => undefined),
      authority = new DraftAuthority({ persist, onDraftChange: vi.fn(), onInvalid: vi.fn(), onFailure: vi.fn() }, null);
    authority.schedule("opacity", operation("25"), "top-background");
    authority.schedule("opacity", operation("75"), "top-background");

    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();
    await authority.flushField("opacity");

    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0]?.[1].operation).toEqual(operation("75"));
    vi.useRealTimers();
  });

  it("discards a manual interaction without persisting it", async () => {
    const persist = vi.fn<(field: string, edit: DraftEdit) => Promise<void>>(async () => undefined),
      states: boolean[] = [],
      authority = new DraftAuthority(
        {
          persist,
          onDraftChange: vi.fn(),
          onDraftStateChange: (dirty) => states.push(dirty),
          onInvalid: vi.fn(),
          onFailure: vi.fn(),
        },
        null,
      );
    authority.schedule("opacity", operation("25"), "top-background");
    authority.schedule("opacity", operation("75"), "top-background");

    authority.discardField("opacity");
    await authority.flush();

    expect(persist).not.toHaveBeenCalled();
    expect(states).toEqual([true, false]);
  });

  it("restores the preceding in-flight revision after a manual interaction is discarded", async () => {
    let resolve!: () => void;
    const success = vi.fn(),
      authority = new DraftAuthority(
        {
          persist: () => new Promise<void>((done) => (resolve = done)),
          onDraftChange: vi.fn(),
          onInvalid: vi.fn(),
          onSuccess: success,
          onFailure: vi.fn(),
        },
        null,
      );
    authority.schedule("opacity", operation("25"), "top-background");
    const first = authority.flushField("opacity");
    authority.schedule("opacity", operation("50"), "top-background");
    authority.schedule("opacity", operation("75"), "top-background");

    authority.discardField("opacity");
    resolve();
    await first;

    expect(success).toHaveBeenCalledWith("opacity", expect.objectContaining({ revision: 1 }), true);
  });

  it("keeps combined draft state dirty until every authority source is clean", () => {
    const states: boolean[] = [],
      aggregate = createDraftStateAggregator((dirty) => states.push(dirty));

    aggregate("fill", true);
    aggregate("opacity", true);
    aggregate("fill", false);
    aggregate("opacity", false);

    expect(states).toEqual([true, false]);
  });

  it("reports whether a completed persistence is still the latest revision", async () => {
    const resolutions: Array<() => void> = [],
      success = vi.fn(),
      authority = new DraftAuthority(
        {
          persist: () => new Promise<void>((resolve) => resolutions.push(resolve)),
          onDraftChange: vi.fn(),
          onInvalid: vi.fn(),
          onSuccess: success,
          onFailure: vi.fn(),
        },
        350,
      );
    authority.schedule("fill", operation("#111111"), "top-background");
    const first = authority.flushField("fill");
    authority.schedule("fill", operation("#222222"), "top-background");
    const second = authority.flushField("fill");

    resolutions[0]?.();
    await first;
    resolutions[1]?.();
    await second;

    expect(success.mock.calls.map(([, edit, latest]) => [edit.operation, latest])).toEqual([
      [operation("#111111"), false],
      [operation("#222222"), true],
    ]);
  });

  it("reports dirty state until an awaited persistence settles", async () => {
    let resolve!: () => void;
    const states: boolean[] = [],
      authority = new DraftAuthority(
        {
          persist: () => new Promise<void>((done) => (resolve = done)),
          onDraftChange: vi.fn(),
          onDraftStateChange: (dirty) => states.push(dirty),
          onInvalid: vi.fn(),
          onFailure: vi.fn(),
        },
        350,
      );
    authority.schedule("fill", operation("#123456"), "top-background");

    const flushing = authority.flush();
    expect(states).toEqual([true]);
    resolve();
    await flushing;

    expect(states).toEqual([true, false]);
  });

  it("invalidates diagnostics and export summary as soon as a draft changes", () => {
    const { authority, invalidated } = harness();

    authority.schedule("global.background", operation("#123456"), "home");

    expect(invalidated).toHaveBeenCalledOnce();
    authority.dispose();
  });
});
