import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const roots = ["apps/studio/src", "packages/theme-core/src", "packages/dspico-contract/src"];
const technical = (value: string): boolean =>
  value === "receipt" ||
  value === "set-component-evidence" ||
  value.startsWith("dspico-") ||
  value.startsWith("receipt.") ||
  value.startsWith("bcstm.") ||
  value.startsWith("custom.visual-receipt") ||
  value.startsWith("visual-receipt-") ||
  value.startsWith("/") ||
  value.includes("/receipts") ||
  value.includes("evidence/");

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(candidate);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name) ? [candidate] : [];
  });

describe("runtime copy", () => {
  it("keeps receipt and evidence terminology out of user-facing production strings", () => {
    const violations: string[] = [];
    for (const file of roots.flatMap((root) => sourceFiles(root))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          node.kind === ts.SyntaxKind.TemplateHead ||
          node.kind === ts.SyntaxKind.TemplateMiddle ||
          node.kind === ts.SyntaxKind.TemplateTail ||
          ts.isJsxText(node)
        ) {
          const value = (node as ts.StringLiteralLike).text.trim();
          if (/\b(?:receipt|evidence)\b/i.test(value) && !technical(value))
            violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${value}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
