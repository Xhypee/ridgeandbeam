/** Browser-only image helpers for field capture: downscale + EXIF time, and annotation flattening. */
import { exifTakenAt } from "./field-exif";
import type { Shape } from "./field-queue";

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.8;
export const BRAND_ORANGE = "#ea580c";

function toBlob(canvas: HTMLCanvasElement, type = "image/jpeg", q = JPEG_QUALITY) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, q));
}

/**
 * Downscale to MAX_EDGE (JPEG ~0.8) and read the EXIF capture time from the original bytes.
 * If the browser can't decode the file (e.g. HEIC on desktop) the original is kept as-is.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; mime: string; takenAt: string }> {
  let takenAt: string | null = null;
  try {
    takenAt = exifTakenAt(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    /* no exif */
  }
  takenAt ??= new Date(file.lastModified || Date.now()).toISOString();
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await toBlob(c);
    // Keep the original if re-encoding somehow made it bigger and it was already small enough.
    if (scale === 1 && file.type === "image/jpeg" && file.size < blob.size) return { blob: file, mime: "image/jpeg", takenAt };
    return { blob, mime: "image/jpeg", takenAt };
  } catch {
    return { blob: file, mime: file.type || "application/octet-stream", takenAt };
  }
}

/** Draw annotation shapes (normalized 0..1 coords) onto a 2D context of size w×h. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number) {
  const lw = Math.max(4, Math.round(Math.min(w, h) / 90));
  ctx.save();
  ctx.strokeStyle = BRAND_ORANGE;
  ctx.fillStyle = BRAND_ORANGE;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = lw;
  for (const s of shapes) {
    ctx.beginPath();
    if (s.type === "circle") {
      ctx.arc(s.x * w, s.y * h, Math.max(lw, s.r * Math.min(w, h)), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const x1 = s.x1 * w, y1 = s.y1 * h, x2 = s.x2 * w, y2 = s.y2 * h;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const a = Math.atan2(y2 - y1, x2 - x1);
      const head = lw * 4;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - Math.PI / 6), y2 - head * Math.sin(a - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(a + Math.PI / 6), y2 - head * Math.sin(a + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Flatten image + shapes into a JPEG (for sharing / printing; shapes are also kept as JSON). */
export async function flatten(img: HTMLImageElement, shapes: Shape[]): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  drawShapes(ctx, shapes, c.width, c.height);
  return toBlob(c, "image/jpeg", 0.85);
}
