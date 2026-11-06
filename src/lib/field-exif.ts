/**
 * Minimal JPEG EXIF reader: returns DateTimeOriginal (or DateTime) as an ISO string, else null.
 * Runs in the browser before the photo is downscaled (canvas re-encoding drops EXIF).
 */
export function exifTakenAt(buf: ArrayBuffer): string | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) return null;
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      return readTiff(v, off + 10, Math.min(v.byteLength, off + 2 + size));
    }
    if (marker === 0xffda) return null; // start of scan: no more metadata
    off += 2 + size;
  }
  return null;
}

function readTiff(v: DataView, start: number, end: number): string | null {
  if (start + 8 > end) return null;
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, little);
  const u32 = (o: number) => v.getUint32(start + o, little);
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n && start + o + i < end; i++) {
      const c = v.getUint8(start + o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const readIfd = (ifd: number) => {
    const out: Record<number, string | number> = {};
    if (start + ifd + 2 > end) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (start + e + 12 > end) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if (type === 2) out[tag] = ascii(count > 4 ? u32(e + 8) : e + 8, count);
      else if (type === 4) out[tag] = u32(e + 8);
      else if (type === 3) out[tag] = u16(e + 8);
    }
    return out;
  };
  const ifd0 = readIfd(u32(4));
  let raw: string | undefined;
  const exifPtr = ifd0[0x8769];
  if (typeof exifPtr === "number") {
    const sub = readIfd(exifPtr);
    raw = (sub[0x9003] as string | undefined) ?? (sub[0x9004] as string | undefined);
  }
  raw ??= ifd0[0x0132] as string | undefined;
  return parseExifDate(raw);
}

/** "2026:05:06 14:03:22" -> ISO (interpreted as device-local time). */
export function parseExifDate(raw: string | undefined | null): string | null {
  const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) || +m[1] < 1990 ? null : d.toISOString();
}
