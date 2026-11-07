// Copies pdf.js's worker into public/ so the browser loads it from our own origin (/pdfjs/pdf.worker.min.mjs)
// instead of bundling it. Runs on postinstall and prebuild; the copy is git-ignored.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = join(root, "public/pdfjs/pdf.worker.min.mjs");
if (!existsSync(src)) {
  console.warn("pdfjs-dist not installed yet; skipping worker copy");
} else if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("copied pdf.js worker to public/pdfjs/");
}
