"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createChangeOrder } from "@/app/app/jobs/[id]/change-orders/actions";
import { cx } from "@/components/ui";
import { preparePhoto } from "@/lib/field-image";
import { newClientId } from "@/lib/field-queue";
import { createClient } from "@/lib/supabase/client";

type Line = { description: string; quantity: number; unit: string; unit_price: number; unit_cost: number; category: "material" | "labor" | "other" };
type Photo = { id: string; url: string | null; caption: string | null };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ChangeOrderBuilder({ jobId, orgId, decking, photos }: {
  jobId: string;
  orgId: string;
  decking: { name: string; unit: string; unit_price: number; unit_cost: number } | null;
  photos: Photo[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"decking" | "custom">("decking");
  const [sheets, setSheets] = useState(4);
  const [price, setPrice] = useState(decking?.unit_price ?? 72);
  const [cost, setCost] = useState(decking?.unit_cost ?? 38);
  const [title, setTitle] = useState("Replace rotten decking");
  const [desc, setDesc] = useState("We found soft / rotted roof decking (plywood) after tear-off. It must be replaced so the new roof is nailed to solid wood and the warranty holds.");
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unit: "ea", unit_price: 0, unit_cost: 0, category: "material" }]);
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const items: Line[] = mode === "decking"
    ? [{ description: `${decking?.name ?? "Decking replacement (per 4x8 sheet)"}`, quantity: sheets, unit: decking?.unit ?? "sheet", unit_price: price, unit_cost: cost, category: "material" }]
    : lines;
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const allPhotos = [...extra, ...photos];

  async function takePhoto(f: File | undefined) {
    if (!f) return;
    setBusy("Uploading photo…");
    setErr(null);
    try {
      const p = await preparePhoto(f);
      const sb = createClient();
      const cid = newClientId();
      const path = `${orgId}/${jobId}/${cid}.jpg`;
      const up = await sb.storage.from("job-files").upload(path, p.blob, { contentType: p.mime, upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: sess } = await sb.auth.getSession();
      const { data, error } = await sb.from("job_files").insert({
        org_id: orgId, job_id: jobId, client_id: cid, kind: "photo", storage_path: path, mime_type: p.mime, size_bytes: p.blob.size,
        category: "decking", caption: "Rotten decking", taken_at: p.takenAt, uploaded_by: sess.session?.user.id ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      setExtra((x) => [{ id: data.id, url: URL.createObjectURL(p.blob), caption: "Rotten decking" }, ...x]);
      setPicked((x) => [...x, data.id]);
    } catch (e) {
      setErr(`Couldn't upload the photo (${(e as Error).message}). No signal? Take it on the Field tab — it will queue — then attach it here.`);
    } finally {
      setBusy(null);
    }
  }

  async function save(send: "none" | "sms" | "email" | "both") {
    setBusy(send === "none" ? "Saving…" : "Sending…");
    setErr(null);
    const r = await createChangeOrder({ jobId, title, description: desc, fileIds: picked, items, send });
    setBusy(null);
    if (r.error || !r.id) return setErr(r.error ?? "Couldn't save.");
    router.push(`/app/jobs/${jobId}/change-orders/${r.id}?m=${encodeURIComponent(r.ok ?? "")}`);
  }

  const tab = (m: typeof mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); if (m === "custom" && title === "Replace rotten decking") setTitle(""); }}
      className={cx("min-h-12 flex-1 rounded-xl text-base font-bold", mode === m ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-300")}>{label}</button>
  );

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex gap-2">{tab("decking", "Found rotten decking")}{tab("custom", "Custom lines")}</div>

      {mode === "decking" ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">How many 4×8 sheets?</p>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" aria-label="One less sheet" onClick={() => setSheets((s) => Math.max(1, s - 1))} className="h-16 w-16 rounded-2xl bg-white text-4xl font-bold ring-2 ring-slate-900">−</button>
            <input aria-label="Sheets" type="number" min={1} value={sheets} onChange={(e) => setSheets(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="h-16 w-24 rounded-2xl text-center text-4xl font-black tabular-nums ring-1 ring-slate-300" />
            <button type="button" aria-label="One more sheet" onClick={() => setSheets((s) => s + 1)} className="h-16 flex-1 rounded-2xl bg-brand-500 text-4xl font-bold text-white">+</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <label>Price per sheet<input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="mt-1 block min-h-11 w-full rounded-lg px-2 ring-1 ring-slate-300" /></label>
            <label>Our cost per sheet<input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value) || 0)} className="mt-1 block min-h-11 w-full rounded-lg px-2 ring-1 ring-slate-300" /></label>
          </div>
          <p className="mt-2 text-xs text-slate-500">{decking ? "Prices from your price book (decking)." : "No decking item in your price book — using a typical rate."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 rounded-xl bg-slate-50 p-2 text-sm">
              <input aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} className="col-span-6 min-h-11 rounded-lg px-2 ring-1 ring-slate-300" />
              <input aria-label="Quantity" type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))} className="col-span-2 min-h-11 rounded-lg px-2 ring-1 ring-slate-300" />
              <input aria-label="Unit" value={l.unit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} className="col-span-1 min-h-11 rounded-lg px-2 ring-1 ring-slate-300" />
              <input aria-label="Unit price" type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x))} className="col-span-3 min-h-11 rounded-lg px-2 ring-1 ring-slate-300" />
              <input aria-label="Unit cost" type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_cost: Number(e.target.value) || 0 } : x))} className="col-span-3 min-h-11 rounded-lg px-2 ring-1 ring-slate-300" placeholder="Our cost" />
              <select aria-label="Category" value={l.category} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, category: e.target.value as Line["category"] } : x))} className="col-span-2 min-h-11 rounded-lg px-2 ring-1 ring-slate-300">
                <option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option>
              </select>
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} className="col-span-1 min-h-11 rounded-lg text-red-700 ring-1 ring-red-200 disabled:opacity-40" aria-label="Remove line">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { description: "", quantity: 1, unit: "ea", unit_price: 0, unit_cost: 0, category: "material" }])} className="min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ring-slate-300">+ Add line</button>
        </div>
      )}

      <label className="block text-sm font-semibold">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block min-h-12 w-full rounded-xl px-3 text-base font-normal ring-1 ring-slate-300" /></label>
      <label className="block text-sm font-semibold">What the homeowner sees<textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl p-3 text-base font-normal ring-1 ring-slate-300" /></label>

      <div>
        <p className="mb-1 text-sm font-semibold">Photos ({picked.length} attached)</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-brand-500 text-center text-xs font-bold text-white">
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void takePhoto(e.target.files?.[0])} />
            Take photo
          </label>
          {allPhotos.map((p) => (
            <button key={p.id} type="button" aria-pressed={picked.includes(p.id)} onClick={() => setPicked((x) => x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id])}
              className={cx("relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-4", picked.includes(p.id) ? "ring-brand-500" : "ring-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt={p.caption ?? ""} className="h-full w-full object-cover" />}
              {picked.includes(p.id) && <span className="absolute right-1 top-1 rounded bg-brand-500 px-1 text-xs font-bold text-white">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
        <span className="font-semibold">Change order total</span><span className="text-2xl font-black tabular-nums" data-testid="co-total">{usd(total)}</span>
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => save("none")} className="min-h-14 rounded-xl text-base font-bold ring-1 ring-slate-300">Save draft</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => save("both")} className="min-h-14 rounded-xl bg-brand-500 text-base font-black text-white">{busy ?? "Send for approval"}</button>
      </div>
      <p className="text-xs text-slate-500">Sending texts and emails the homeowner a link to review photos and sign. Or save a draft and have them sign on your phone.</p>
    </div>
  );
}
