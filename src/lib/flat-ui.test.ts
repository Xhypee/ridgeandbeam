import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Design rule: the UI is flat. No drop shadows (Tailwind shadow-* classes, box-shadow, drop-shadow) anywhere.
const ROOT = path.join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|css)$/.test(f) ? [p] : [];
  });

describe("flat UI", () => {
  it("has no shadows in components, pages or styles", () => {
    const offenders = files(ROOT).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/(\bshadow(-[a-z0-9]|\b)|box-shadow|drop-shadow)/.test(line) ? [`${path.relative(ROOT, f)}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
