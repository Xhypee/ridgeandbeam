"use client";

import { useState, useTransition } from "react";
import type { CrewStrings } from "@/lib/production-i18n";
import { reportProblem } from "./actions";

/** Downscale a phone photo to ≤1600px JPEG so it fits in a server action request. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.8));
  } catch {
    return file;
  }
}

const KINDS = ["missing_material", "wrong_material", "damage_found", "safety", "homeowner", "other"] as const;

export function ProblemForm({ token, jobId, t }: { token: string; jobId: string; t: CrewStrings }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        {msg?.ok && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{t.sent}{msg.error ? ` ${msg.error}` : ""}</p>}
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="min-h-14 w-full rounded-xl bg-red-600 px-4 text-lg font-semibold text-white active:bg-red-700">
          ⚠ {t.problem}
        </button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl bg-white p-4 ring-2 ring-red-500"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const f = fd.get("photo");
          if (f instanceof File && f.size > 0) fd.set("photo", await shrink(f), "photo.jpg");
          else fd.delete("photo");
          const r = await reportProblem(fd);
          setMsg(r);
          if (r.ok) setOpen(false);
        });
      }}
    >
      <p className="text-lg font-semibold text-red-700">{t.problem}</p>
      <p className="text-sm text-slate-600">{t.problemHelp}</p>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="job_id" value={jobId} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t.kind}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k, i) => (
            <label key={k} className="flex min-h-12 items-center gap-2 rounded-lg px-3 ring-1 ring-slate-300 has-checked:bg-red-50 has-checked:ring-red-500">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="h-5 w-5 accent-red-600" />
              {k === "homeowner" ? t.homeowner_issue : t[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">{t.message}
        <textarea name="message" rows={3} className="mt-1 block w-full rounded-lg px-3 py-2 text-base ring-1 ring-slate-300" />
      </label>
      <label className="block text-sm font-medium">{t.yourName}
        <input name="name" className="mt-1 block min-h-12 w-full rounded-lg px-3 text-base ring-1 ring-slate-300" />
      </label>
      <label className="block text-sm font-medium">{t.photo}
        <input type="file" name="photo" accept="image/*" capture="environment" className="mt-1 block w-full text-sm" />
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-12 flex-1 rounded-xl bg-red-600 px-4 font-semibold text-white disabled:opacity-60">{pending ? "…" : t.send}</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl px-4 text-slate-600 ring-1 ring-slate-300">✕</button>
      </div>
      {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
    </form>
  );
}
