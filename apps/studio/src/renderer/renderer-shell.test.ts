import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = path.join(process.cwd(), "apps/studio/src/renderer");

describe("renderer shell", () => {
  it("loads CSS as a stylesheet while keeping inline styles forbidden", () => {
    const html = readFileSync(path.join(rendererRoot, "index.html"), "utf8");
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(html).toContain("style-src 'self'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).toContain('<link rel="stylesheet" href="./studio.css" />');
    expect(renderer).not.toContain('import "./studio.css"');
  });
});
