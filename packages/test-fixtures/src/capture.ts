import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export const LAUNCHER_V1_COMMIT = "f3ae63279ab72bc6c83124c752ec79f3247db437";
export const LAUNCHER_V1_SOURCE_PATHS = [
  "docs/Themes.md",
  "arm9/source/themes/ThemeInfoFactory.thumb.cpp",
  "arm9/source/themes/LaunchTransitionStyle.h",
  "arm9/source/themes/material/MaterialColorSchemeFactory.cpp",
  "_pico/themes/material/theme.json",
] as const;
type CommandOptions = {
  encoding: "utf8";
  maxBuffer: number;
  shell: false;
  stdio: ["ignore", "pipe", "pipe"];
};
export type CommandRunner = (file: string, args: readonly string[], options: CommandOptions) => string;
type CaptureFailure = "command-failed" | "not-repository" | "dirty-repository" | "wrong-head" | "invalid-source";
const fail = (reason: CaptureFailure, message: string): never => {
  throw Object.assign(new Error(message), { reason });
};

const nativeRunner: CommandRunner = (file, args, options) => execFileSync(file, [...args], options);
export type CaptureOptions = { realpath?: (path: string) => string; run?: CommandRunner };

export function captureLauncherFixtures(repositoryPath: string, options: CaptureOptions = {}) {
  let repositoryRoot!: string;
  try {
    repositoryRoot = (options.realpath ?? realpathSync)(repositoryPath);
  } catch {
    fail("not-repository", `Cannot resolve launcher repository: ${repositoryPath}`);
  }
  const run = options.run ?? nativeRunner;
  const git = (args: readonly string[], reason: CaptureFailure = "command-failed"): string => {
    try {
      return run("git", args, {
        encoding: "utf8",
        maxBuffer: 1_048_576,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return fail(reason, error instanceof Error ? error.message : String(error));
    }
  };
  const prefix = ["-C", repositoryRoot] as const;
  const root = git([...prefix, "rev-parse", "--show-toplevel"], "not-repository").trim();
  if (!root || root !== repositoryRoot) fail("not-repository", "Path is not a canonical Git repository.");
  if (git([...prefix, "status", "--porcelain=v1", "--untracked-files=all"]).trim())
    fail("dirty-repository", "Launcher repository is dirty.");
  if (git([...prefix, "rev-parse", "HEAD"]).trim() !== LAUNCHER_V1_COMMIT)
    fail("wrong-head", `Launcher HEAD is not ${LAUNCHER_V1_COMMIT}.`);
  const sources = LAUNCHER_V1_SOURCE_PATHS.map((path) => {
    const content = git([...prefix, "show", `${LAUNCHER_V1_COMMIT}:${path}`]);
    return { path, content, sha256: createHash("sha256").update(content).digest("hex") };
  });
  const themeSource =
    sources.find(({ path }) => path.endsWith("theme.json"))?.content ??
    fail("invalid-source", "Pinned theme.json source is missing.");
  try {
    return {
      profileId: "dspico-launcher-v1",
      launcherCommit: LAUNCHER_V1_COMMIT,
      repositoryRoot,
      sources,
      materialTheme: JSON.parse(themeSource) as Record<string, unknown>,
    };
  } catch {
    return fail("invalid-source", "Pinned theme.json is not valid JSON.");
  }
}
