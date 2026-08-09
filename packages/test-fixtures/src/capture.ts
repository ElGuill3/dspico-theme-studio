import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { launcherV1Fixture } from "./launcher-v1.js";

export const LAUNCHER_V1_COMMIT = launcherV1Fixture.launcherCommit;
export const LAUNCHER_V1_TAG = launcherV1Fixture.tag;
export const LAUNCHER_V1_SOURCE_PATHS = launcherV1Fixture.sources.map(({ path }) => path);
type CommandOptions = {
  encoding: "buffer";
  maxBuffer: number;
  shell: false;
  stdio: ["ignore", "pipe", "pipe"];
};
type CommandOutput = string | Buffer;
export type CommandRunner = (file: string, args: readonly string[], options: CommandOptions) => CommandOutput;
// prettier-ignore
type CaptureFailure = "command-failed" | "not-repository" | "moved-root" | "dirty-repository" | "wrong-head" | "wrong-tag" | "invalid-source";
const fail = (reason: CaptureFailure, message: string): never => {
  throw Object.assign(new Error(message), { reason });
};

const nativeRunner: CommandRunner = (file, args, options) => execFileSync(file, [...args], options);
export type CaptureOptions = {
  contentSha256?: (content: CommandOutput) => string;
  realpath?: (path: string) => string;
  run?: CommandRunner;
};

const text = (output: CommandOutput) => (typeof output === "string" ? output : output.toString("utf8"));

// prettier-ignore
const manifestSha256 = (sources: readonly { path: string; sha256: string }[]) => createHash("sha256").update(JSON.stringify({ profileId: "dspico-launcher-v1", tag: LAUNCHER_V1_TAG, launcherCommit: LAUNCHER_V1_COMMIT, sources })).digest("hex");

export function captureLauncherFixtures(repositoryPath: string, options: CaptureOptions = {}) {
  let repositoryRoot!: string;
  try {
    repositoryRoot = (options.realpath ?? realpathSync)(repositoryPath);
  } catch {
    fail("not-repository", `Cannot resolve launcher repository: ${repositoryPath}`);
  }
  const run = options.run ?? nativeRunner;
  const git = (args: readonly string[], reason: CaptureFailure = "command-failed"): CommandOutput => {
    try {
      return run("git", args, {
        encoding: "buffer",
        maxBuffer: 1_048_576,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return fail(reason, error instanceof Error ? error.message : String(error));
    }
  };
  const gitText = (args: readonly string[], reason?: CaptureFailure) => text(git(args, reason));
  const contentSha256 = options.contentSha256 ?? ((content) => createHash("sha256").update(content).digest("hex"));
  const prefix = ["-C", repositoryRoot] as const;
  const root = gitText([...prefix, "rev-parse", "--show-toplevel"], "not-repository").trim();
  if (!root) fail("not-repository", "Path is not a canonical Git repository.");
  if (root !== repositoryRoot) fail("moved-root", "Launcher repository root moved during selection.");
  if (gitText([...prefix, "status", "--porcelain=v1", "--untracked-files=all"]).trim())
    fail("dirty-repository", "Launcher repository is dirty.");
  if (gitText([...prefix, "rev-parse", "HEAD"]).trim() !== LAUNCHER_V1_COMMIT)
    fail("wrong-head", `Launcher HEAD is not ${LAUNCHER_V1_COMMIT}.`);
  if (gitText([...prefix, "describe", "--tags", "--exact-match", "HEAD"]).trim() !== LAUNCHER_V1_TAG)
    fail("wrong-tag", `Launcher HEAD is not tagged ${LAUNCHER_V1_TAG}.`);
  const expected = new Map(launcherV1Fixture.sources.map(({ path, sha256 }) => [path, sha256]));
  const sources = LAUNCHER_V1_SOURCE_PATHS.map((path) => {
    const content = git([...prefix, "show", `${LAUNCHER_V1_COMMIT}:${path}`], "invalid-source");
    const sha256 = contentSha256(content);
    if (expected.get(path) !== sha256) fail("invalid-source", `Pinned launcher evidence drifted at ${path}.`);
    return { path, content: text(content), sha256 };
  });
  const manifest = sources.map(({ path, sha256 }) => ({ path, sha256 }));
  if (
    manifest.some(({ path, sha256 }) => expected.get(path) !== sha256) ||
    manifestSha256(manifest) !== launcherV1Fixture.manifestSha256
  )
    fail("invalid-source", "Pinned launcher evidence manifest drifted.");
  const themeSource =
    sources.find(({ path }) => path === "_pico/themes/material/theme.json")?.content ??
    fail("invalid-source", "Pinned theme.json source is missing.");
  try {
    return {
      profileId: "dspico-launcher-v1",
      launcherCommit: LAUNCHER_V1_COMMIT,
      launcherTag: LAUNCHER_V1_TAG,
      repositoryRoot,
      sources,
      manifestSha256: manifestSha256(manifest),
      materialTheme: JSON.parse(themeSource) as Record<string, unknown>,
    };
  } catch {
    return fail("invalid-source", "Pinned theme.json is not valid JSON.");
  }
}
