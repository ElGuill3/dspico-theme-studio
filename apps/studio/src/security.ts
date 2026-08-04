export const STUDIO_CHANNEL = "studio:command";
// prettier-ignore
export const WINDOW_SECURITY = Object.freeze({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true });
export const isStudioUrl = (value: string): boolean => {
  // prettier-ignore
  try { const url = new URL(value), pathname = decodeURIComponent(url.pathname); return url.protocol === "app:" && url.host === "studio" && !pathname.includes("\\") && !pathname.split("/").includes(".."); }
  catch { return false; }
};

const APP_RENDERER_URL = "app://studio/index.html";
const hasSafePath = (url: URL): boolean => {
  const pathname = decodeURIComponent(url.pathname);
  return !pathname.includes("\\") && !pathname.split("/").includes("..");
};

export const isTrustedStudioUrl = (value: string, trustedOrigin: string): boolean => {
  if (trustedOrigin === "app://studio") return isStudioUrl(value);
  try {
    const url = new URL(value);
    const origin = new URL(trustedOrigin);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    return origin.protocol === "http:" && loopback && url.origin === origin.origin && hasSafePath(url);
  } catch {
    return false;
  }
};

export const selectStudioRendererUrl = (devServerUrl: string | undefined, forcePackaged: boolean): string => {
  if (!forcePackaged && devServerUrl && isTrustedStudioUrl(devServerUrl, devServerUrl)) return devServerUrl;
  return APP_RENDERER_URL;
};
