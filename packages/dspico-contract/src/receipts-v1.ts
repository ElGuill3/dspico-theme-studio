import { sha256 } from "./index.js";
import { CODEC_POLICY_V1 } from "./codecs-v1-3.js";
import { LAUNCHER_V1_PROFILE, LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";

export const RECEIPT_SCHEMA_V1 = "dspico-visual-receipt-v1" as const;
export type ReceiptFileV1 = { path: string; sha256: string };
export type ReceiptExpectationV1 = {
  profileSha256: string;
  themeJsonSha256: string;
  manifest: readonly ReceiptFileV1[];
};
export type ReceiptDiagnosticV1 = { code: string; message: string };
export type VisualReceiptV1 = {
  version: 1;
  schema: typeof RECEIPT_SCHEMA_V1;
  component: "visual";
  tester: string;
  device: string;
  cartridge: string;
  launcherBuild: string;
  testedAt: string;
  profile: { id: "dspico-launcher-v1"; tag: string; commit: string; sha256: string };
  codecPolicy: { id: string; sha256: string };
  themeJsonSha256: string;
  manifest: readonly ReceiptFileV1[];
  observations: readonly string[];
  pass: boolean;
};

const HASH = /^[a-f0-9]{64}$/;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const invalid = (code: string, message: string): ReceiptDiagnosticV1 => ({ code, message });
export const codecPolicySha256V1 = (): string => sha256(CODEC_POLICY_V1);
export const compositeProfileSha256V1 = (): string => sha256(JSON.stringify(LAUNCHER_V1_PROFILE));

export function validateReceiptV1(input: unknown): ReceiptDiagnosticV1[] {
  const value = object(input),
    diagnostics: ReceiptDiagnosticV1[] = [];
  if (!value) return [invalid("receipt.schema", "The compatibility record must be an object.")];
  if (value.version !== 1 || value.schema !== RECEIPT_SCHEMA_V1 || value.component !== "visual")
    diagnostics.push(
      invalid("receipt.schema", "The compatibility record format and visual component are unsupported."),
    );
  for (const field of ["tester", "device", "cartridge", "launcherBuild"])
    if (!text(value[field])) diagnostics.push(invalid("receipt.identity", `${field} is required.`));
  if (typeof value.testedAt !== "string" || Number.isNaN(Date.parse(value.testedAt)) || !value.testedAt.endsWith("Z"))
    diagnostics.push(invalid("receipt.date", "The compatibility test date must be ISO-8601 UTC."));
  if (value.pass !== true)
    diagnostics.push(invalid("receipt.pass", "Only passing compatibility records can authorize reuse."));
  const profile = object(value.profile),
    codec = object(value.codecPolicy);
  if (
    profile?.id !== LAUNCHER_V1_PROFILE.profileId ||
    profile.tag !== LAUNCHER_V1_PROFILE.tag ||
    profile.commit !== LAUNCHER_V1_PROFILE.launcherCommit ||
    profile.sha256 !== compositeProfileSha256V1()
  )
    diagnostics.push(
      invalid("receipt.profile", "The compatibility profile identity does not match the pinned composite profile."),
    );
  if (codec?.id !== CODEC_POLICY_V1 || codec.sha256 !== codecPolicySha256V1())
    diagnostics.push(
      invalid("receipt.codec-policy", "The compatibility codec policy does not match the pinned policy."),
    );
  if (typeof value.themeJsonSha256 !== "string" || !HASH.test(value.themeJsonSha256))
    diagnostics.push(invalid("receipt.theme-json", "The compatibility record must bind a complete theme.json hash."));
  const manifest = Array.isArray(value.manifest) ? value.manifest : [];
  if (
    manifest.length !== LAUNCHER_V1_VISUAL_FILES.length ||
    manifest.some((entry, index) => {
      const file = object(entry);
      return (
        file?.path !== LAUNCHER_V1_VISUAL_FILES[index] || typeof file?.sha256 !== "string" || !HASH.test(file.sha256)
      );
    })
  )
    diagnostics.push(
      invalid("receipt.manifest", "The compatibility record must bind the ordered complete 12-file visual manifest."),
    );
  const observations = Array.isArray(value.observations) ? value.observations : [];
  if (!observations.length || observations.some((entry) => !text(entry)))
    diagnostics.push(invalid("receipt.observations", "At least one observation is required."));
  return diagnostics;
}

export const receiptMatchesV1 = (input: unknown, expected: ReceiptExpectationV1): boolean => {
  if (validateReceiptV1(input).length) return false;
  const value = input as VisualReceiptV1;
  return (
    value.profile.sha256 === expected.profileSha256 &&
    value.themeJsonSha256 === expected.themeJsonSha256 &&
    value.manifest.length === expected.manifest.length &&
    value.manifest.every(
      (entry, index) =>
        entry.path === expected.manifest[index]?.path && entry.sha256 === expected.manifest[index]?.sha256,
    )
  );
};
export const receiptKeyV1 = (value: VisualReceiptV1): string =>
  sha256(
    JSON.stringify({
      profile: value.profile,
      codecPolicy: value.codecPolicy,
      themeJsonSha256: value.themeJsonSha256,
      manifest: value.manifest,
    }),
  );
