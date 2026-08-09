export const manualSdGuidance = (folderName: string, zipName: string, files: readonly string[]) => ({
  steps: [
    `Copy ${folderName}/, or extract ${zipName}, under /_pico/themes/${folderName}/.`,
    "Select that folder through the launcher's normal theme setting.",
    "Safely eject the SD card before removing it.",
  ],
  bgm: files.some((file) => file.endsWith("/bgm.bcstm"))
    ? `The included BGM remains at /_pico/themes/${folderName}/bgm.bcstm.`
    : undefined,
  boundary: "This Studio does not install directly to SD cards or claim hardware compatibility.",
  report: "report.json contains provenance and verification metadata; hardwareParityClaimed remains false.",
});
