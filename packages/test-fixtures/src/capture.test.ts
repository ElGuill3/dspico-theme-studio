import { describe, expect, it } from "vitest";

import { captureLauncherFixtures } from "./capture.js";

const commit = "f3ae63279ab72bc6c83124c752ec79f3247db437";
const root = "/safe/pico-launcher";
const paths = [
  "docs/Themes.md",
  "arm9/source/themes/ThemeInfoFactory.thumb.cpp",
  "arm9/source/themes/LaunchTransitionStyle.h",
  "arm9/source/themes/material/MaterialColorSchemeFactory.cpp",
  "_pico/themes/material/theme.json",
] as const;
type Call = { file: string; args: readonly string[]; options: { encoding: "utf8"; shell: false } };
type RunnerOptions = { head?: string; status?: string; repositoryRoot?: string };

const runner = (options: RunnerOptions = {}) => {
  const calls: Call[] = [];
  const run = (file: string, args: readonly string[], commandOptions: Call["options"]): string => {
    calls.push({ file, args, options: commandOptions });
    if (args[2] === "rev-parse" && args[3] === "--show-toplevel") return `${options.repositoryRoot ?? root}\n`;
    if (args[2] === "status") return options.status ?? "";
    if (args[2] === "rev-parse") return `${options.head ?? commit}\n`;
    if (args[2] === "show") return args[3]?.endsWith("theme.json") ? '{"type":"material"}' : `fixture:${args[3]}`;
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, run };
};
const capture = (path: string, fake: ReturnType<typeof runner>) =>
  captureLauncherFixtures(path, { realpath: () => root, run: fake.run });

describe("launcher fixture capture", () => {
  it("equates relative and absolute paths", () => {
    const relative = runner();
    const absolute = runner();
    expect(capture("../pico-launcher", relative)).toEqual(capture(root, absolute));
    expect(relative.calls.map(({ args }) => args)).toEqual(absolute.calls.map(({ args }) => args));
  });

  it("rejects hostile non-repositories without a shell", () => {
    const fake = runner({ repositoryRoot: "" });
    const hostile = "/tmp/pico-launcher; touch /tmp/fixture-owned";
    expect(() => capture(hostile, fake)).toThrowError(expect.objectContaining({ reason: "not-repository" }));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ file: "git", options: { shell: false } });
    expect(fake.calls[0]?.args).toContain(root);
    expect(fake.calls[0]?.args).not.toContain(hostile);
  });

  it.each([
    [{ status: " M tracked\n?? untracked\n" }, "dirty-repository"],
    [{ head: "0000000000000000000000000000000000000000" }, "wrong-head"],
  ] as const)("rejects unsafe repository state before source reads", (options, reason) => {
    const fake = runner(options);
    expect(() => capture(root, fake)).toThrowError(expect.objectContaining({ reason }));
    expect(fake.calls.some(({ args }) => args[2] === "show")).toBe(false);
  });

  it("reads only pinned sources with read-only argv", () => {
    const fake = runner();
    expect(capture(root, fake).sources.map(({ path }) => path)).toEqual(paths);
    expect(fake.calls.every(({ file, options }) => file === "git" && options.shell === false)).toBe(true);
    expect(
      fake.calls.every(({ args }) => !["add", "checkout", "commit", "push", "reset"].includes(args[2] ?? "")),
    ).toBe(true);
  });
});
