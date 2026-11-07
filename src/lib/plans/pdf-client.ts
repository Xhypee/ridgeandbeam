// Browser-only helpers around pdf.js: open a PDF, read every page's line work and text, render page images.
// pdf.js is imported on demand (it is big) and its worker is served from /pdfjs (see scripts/copy-pdf-worker.mjs).

import { readPage, type OpsLike, type PageData, type PdfPageLike } from "./pdf";

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

export type OpenPdf = Awaited<ReturnType<typeof openPdf>>;

export async function openPdf(data: ArrayBuffer) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  return { doc, OPS: pdfjs.OPS as unknown as OpsLike, numPages: doc.numPages };
}

export async function readAllPages(pdf: OpenPdf, onPage?: (i: number) => void | Promise<void>): Promise<PageData[]> {
  const pages: PageData[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.doc.getPage(i + 1);
    pages.push(await readPage(page as unknown as PdfPageLike, pdf.OPS, i));
    await onPage?.(i);
  }
  return pages;
}

/** Render a page to a PNG blob at `pxPerMm` pixels per paper millimetre. */
export async function renderPage(pdf: OpenPdf, index: number, pxPerMm: number, mime: "image/png" | "image/jpeg" = "image/png"): Promise<{ blob: Blob; url: string; w: number; h: number }> {
  const page = await pdf.doc.getPage(index + 1);
  const scale = (pxPerMm * 25.4) / 72;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't draw the page."))), mime, 0.85));
  return { blob, url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height };
}
