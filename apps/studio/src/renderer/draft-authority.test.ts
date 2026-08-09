import { describe, expect, it, vi } from "vitest";
import type { OperationV1 } from "../../../../packages/theme-core/src/index.js";
import { DraftAuthority, type DraftEdit } from "./draft-authority.js";

const operation = (value: string): OperationV1 => ({ version: 1, type: "set-token", key: "background", value });

function harness(persist: (field: string, edit: DraftEdit) => Promise<void> = async () => undefined) {
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

  it("invalidates diagnostics and export summary as soon as a draft changes", () => {
    const { authority, invalidated } = harness();

    authority.schedule("global.background", operation("#123456"), "home");

    expect(invalidated).toHaveBeenCalledOnce();
    authority.dispose();
  });
});
