import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
type Call = {
  file: string;
  args: readonly string[];
  options: {
    encoding: "utf8";
    maxBuffer: number;
    shell: false;
    stdio: ["ignore", "pipe", "pipe"];
  };
};
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
    expect(fake.calls[0]?.options.maxBuffer).toBe(1_048_576);
    expect(fake.calls[0]?.args).toContain(root);
    expect(fake.calls[0]?.args).not.toContain(hostile);
  });

  it("passes a hostile repository path to native git as one inert argument", () => {
    const sandbox = mkdtempSync(path.join(os.tmpdir(), "dspico-capture-"));
    const marker = path.resolve(`capture-owned-${path.basename(sandbox)}`);
    const repository = path.join(sandbox, `repo; touch ${path.basename(marker)}`);
    mkdirSync(repository);
    rmSync(marker, { force: true });
    try {
      const git = (args: string[]) => execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
      git(["init"]);
      git(["config", "user.email", "acceptance@example.invalid"]);
      git(["config", "user.name", "Acceptance Test"]);
      writeFileSync(path.join(repository, "tracked"), "fixture\n");
      git(["add", "tracked"]);
      git(["commit", "-m", "fixture"]);

      expect(() => captureLauncherFixtures(repository)).toThrowError(expect.objectContaining({ reason: "wrong-head" }));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("classifies native git rejection of a non-repository", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "dspico-not-repository-"));
    try {
      expect(() => captureLauncherFixtures(directory)).toThrowError(
        expect.objectContaining({ reason: "not-repository" }),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
