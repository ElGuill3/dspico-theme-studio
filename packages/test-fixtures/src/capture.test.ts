import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LAUNCHER_V1_PROFILE } from "../../dspico-contract/src/profile-v1-3.js";
import { captureLauncherFixtures } from "./capture.js";
import { launcherV1Fixture } from "./launcher-v1.js";

const commit = "b087565651c83081dd65552863f5efc2f28e489c";
const unpublishedCommit = "f3ae63279ab72bc6c83124c752ec79f3247db437";
const tag = "v1.3.0";
const root = "/safe/pico-launcher";
const paths = [
  "docs/Themes.md",
  "arm9/source/themes/ThemeInfoFactory.thumb.cpp",
  "arm9/source/themes/custom/CustomTheme.cpp",
  "arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp",
  "arm9/source/bgm/BgmService.cpp",
  "_pico/themes/material/theme.json",
  "_pico/themes/raspberry/theme.json",
  "_pico/themes/raspberry/gridcellSelectedPltt.bin",
] as const;
type Call = {
  file: string;
  args: readonly string[];
  options: {
    encoding: "buffer";
    maxBuffer: number;
    shell: false;
    stdio: ["ignore", "pipe", "pipe"];
  };
};
type RunnerOptions = {
  head?: string;
  status?: string;
  tag?: string;
  repositoryRoot?: string;
  show?: (spec: string, options: Call["options"]) => string | Buffer;
};
const syntheticSources = new Map(
  launcherV1Fixture.sources.map(({ path, sha256 }) => {
    const spec = `${commit}:${path}`;
    const content = Buffer.from(path === "_pico/themes/material/theme.json" ? "{}" : spec);
    return [spec, { content, sha256 }] as const;
  }),
);
const syntheticDigest = (content: string | Buffer) =>
  [...syntheticSources.values()].find((source) => source.content.equals(Buffer.from(content)))?.sha256 ??
  "0000000000000000000000000000000000000000000000000000000000000000";

const runner = (options: RunnerOptions = {}) => {
  const calls: Call[] = [];
  const run = (file: string, args: readonly string[], commandOptions: Call["options"]): string | Buffer => {
    calls.push({ file, args, options: commandOptions });
    if (args[2] === "rev-parse" && args[3] === "--show-toplevel") return `${options.repositoryRoot ?? root}\n`;
    if (args[2] === "status") return options.status ?? "";
    if (args[2] === "rev-parse") return `${options.head ?? commit}\n`;
    if (args[2] === "describe") return `${options.tag ?? tag}\n`;
    if (args[2] === "show" && options.show) return options.show(args[3] ?? "", commandOptions);
    if (args[2] === "show") {
      const source = syntheticSources.get(args[3] ?? "");
      if (source) return source.content;
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, run };
};
const capture = (path: string, fake: ReturnType<typeof runner>) =>
  captureLauncherFixtures(path, { contentSha256: syntheticDigest, realpath: () => root, run: fake.run });

describe("launcher fixture capture", () => {
  it("equates relative and absolute paths", () => {
    const relative = runner();
    const absolute = runner();
    expect(capture("../pico-launcher", relative)).toEqual(capture(root, absolute));
    expect(relative.calls.map(({ args }) => args)).toEqual(absolute.calls.map(({ args }) => args));
    expect(relative.calls.every(({ args }) => args[0] === "-C" && args[1] === root)).toBe(true);
  });

  it("keeps a clean empty index read-only and rejects the result of commit -a", () => {
    const clean = runner({ status: "" });
    expect(capture(root, clean).sources).toHaveLength(paths.length);
    expect(clean.calls.some(({ args }) => args[2] === "show")).toBe(true);

    const committed = runner({ status: "", head: unpublishedCommit });
    expect(() => capture(root, committed)).toThrowError(expect.objectContaining({ reason: "wrong-head" }));
    expect(committed.calls.some(({ args }) => args[2] === "show")).toBe(false);
    expect(
      committed.calls.every(({ args }) => !["add", "commit", "commit -a", "reset", "checkout"].includes(args[2] ?? "")),
    ).toBe(true);
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

  it("rejects a moved repository root before reading sources", () => {
    const fake = runner({ repositoryRoot: "/moved/pico-launcher" });
    expect(() => capture(root, fake)).toThrowError(expect.objectContaining({ reason: "moved-root" }));
    expect(fake.calls.some(({ args }) => args[2] === "show")).toBe(false);
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
    [{ status: "M  staged\n" }, "dirty-repository"],
    [{ status: " M unstaged\n" }, "dirty-repository"],
    [{ status: "?? untracked\n" }, "dirty-repository"],
    [{ head: "0000000000000000000000000000000000000000" }, "wrong-head"],
    [{ head: unpublishedCommit }, "wrong-head"],
    [{ tag: "v1.2.0" }, "wrong-tag"],
  ] as const)("rejects unsafe repository state before source reads", (options, reason) => {
    const fake = runner(options);
    expect(() => capture(root, fake)).toThrowError(expect.objectContaining({ reason }));
    expect(fake.calls.some(({ args }) => args[2] === "show")).toBe(false);
  });

  it("reads only pinned sources with read-only argv", () => {
    const fake = runner();
    const result = capture(root, fake);
    expect(result).toMatchObject({
      profileId: "dspico-launcher-v1",
      launcherCommit: commit,
      launcherTag: tag,
      manifestSha256: expect.any(String),
    });
    expect(result.sources.map(({ path }) => path)).toEqual(paths);
    expect(result.sources.map(({ path }) => path)).not.toContain("_pico/themes/raspberry/gridcellPlttSelected.bin");
    expect(fake.calls.filter(({ args }) => args[2] === "show").map(({ args }) => args)).toEqual(
      paths.map((path) => ["-C", root, "show", `${commit}:${path}`]),
    );
    expect(fake.calls.every(({ file, options }) => file === "git" && options.shell === false)).toBe(true);
    expect(
      fake.calls.every(({ args }) => !["add", "checkout", "commit", "push", "reset"].includes(args[2] ?? "")),
    ).toBe(true);
  });

  it("rejects source hash drift before reading later evidence", () => {
    const fake = runner({
      show: (spec) => (spec.endsWith(":docs/Themes.md") ? Buffer.from("drifted source") : Buffer.from(spec)),
    });
    expect(() => capture(root, fake)).toThrowError(expect.objectContaining({ reason: "invalid-source" }));
    expect(fake.calls.filter(({ args }) => args[2] === "show")).toHaveLength(1);
  });

  it("classifies missing pinned evidence as invalid before continuing", () => {
    const fake = runner({
      show: (spec) => {
        if (spec.endsWith(":docs/Themes.md")) throw new Error("missing evidence");
        return Buffer.from("unreachable");
      },
    });
    expect(() => capture(root, fake)).toThrowError(expect.objectContaining({ reason: "invalid-source" }));
    expect(fake.calls.filter(({ args }) => args[2] === "show")).toHaveLength(1);
  });

  it("matches the checked-in immutable profile evidence", () => {
    const evidence = JSON.parse(
      readFileSync(path.join(__dirname, "../evidence/pico-launcher-v1-3-profile.json"), "utf8"),
    );
    expect(evidence).toMatchObject({ profileId: launcherV1Fixture.profileId, tag: "v1.3.0", launcherCommit: commit });
    expect(evidence.manifestSha256).toBe(launcherV1Fixture.manifestSha256);
    expect(evidence.sources).toEqual(launcherV1Fixture.sources);
    expect(evidence.visualFiles).toEqual(launcherV1Fixture.visualFiles);
    expect(LAUNCHER_V1_PROFILE.manifestSha256).toBe(launcherV1Fixture.manifestSha256);
  });
});
