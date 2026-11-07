import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// pdf.js's worker is served from public/pdfjs (git-ignored). `npm install` / `npm run build` copy it via
// scripts/copy-pdf-worker.mjs; this covers `npx next build` / `next dev` run directly.
const worker = path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const workerDest = path.join(process.cwd(), "public/pdfjs/pdf.worker.min.mjs");
if (existsSync(worker) && !existsSync(workerDest)) {
  mkdirSync(path.dirname(workerDest), { recursive: true });
  copyFileSync(worker, workerDest);
}

// The whole app sits behind auth and is rendered per request, so Cache Components stay off.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
