"use client";

// Measure from plans: drop the architect's PDF → we read it (roof sheet, scale, pitch, details) → check the details
// → check/edit the roof (flat plan + 3D) → pick sheets and colour → add to quote. One big action per screen.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui";
import { jobTypeLabel } from "@/lib/job-types";
import { METAL_PROFILE_INFO, type MetalProfile } from "@/lib/roof";
import type { Pt } from "@/lib/plans/geometry";
import { DETAIL_KEYS, DETAIL_LABEL, jobTypeFromBuilding, mergeDetails, parseDetails, plainText, type DetailKey, type Found } from "@/lib/plans/details";
import { detectRoofPages, type DetectedPage } from "@/lib/plans/detect";
import type { PageData } from "@/lib/plans/pdf";
import { paperSize } from "@/lib/plans/pdf";
import { openPdf, readAllPages, renderPage, type OpenPdf } from "@/lib/plans/pdf-client";
import { analyzeRoof, NEXT_EDGE, NEXT_KIND, normalizeLines, snapPoint, type EdgeType, type LineKind, type PlanLine, type PlanModel } from "@/lib/plans/roof-model";
import { hipRoofLines } from "@/lib/plans/skeleton";
import { planFlashings, planSheets, SHEET_PROFILES, type SheetProfile } from "@/lib/plans/sheets";
import type { SavedPlans } from "@/lib/plans/takeoff";
import { aiPlanDetails, attachPlansFile, savePlansTakeoff } from "./actions";
import { KIND_COLOR, RoofView, type Tool } from "./roof-view";

type Step = "drop" | "scan" | "details" | "roof" | "sheets" | "done";
const STEPS: Step[] = ["drop", "scan", "details", "roof", "sheets", "done"];

// Approximate on-screen colours of popular COLORBOND colours (plus unpainted ZINCALUME).
const COLOURS = [
  { name: "Monument", hex: "#323233" }, { name: "Surfmist", hex: "#e4e2d5" }, { name: "Basalt", hex: "#6d6c6e" },
  { name: "Woodland Grey", hex: "#4b4c46" }, { name: "Shale Grey", hex: "#bdbfba" }, { name: "Dune", hex: "#b1ada3" },
  { name: "Jasper", hex: "#6c6153" }, { name: "Manor Red", hex: "#5e1d0e" }, { name: "ZINCALUME", hex: "#a9adb0" },
];
const PROFILE_IDS: SheetProfile[] = ["custom_orb", "trimdek", "klip_lok"];

export type CurrentJob = {
  customerName: string;
  customerAddress: { address: string | null; city: string | null; state: string | null; zip: string | null };
  siteAddress: string | null;
  jobState: string | null;
  jobZip: string | null;
  jobType: string | null;
  roofMaterial: string | null;
};

type Props = {
  estimateId: string;
  orgId: string;
  jobId: string;
  locked: boolean;
  aiEnabled: boolean;
  current: CurrentJob;
  saved: SavedPlans | null;
  savedImageUrl: string | null;
};

const fmt = (n: number, d = 2) => n.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });

function useCountUp(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return run ? v : 0;
}

const sheetTitle = (p: PageData | undefined) => {
  if (!p) return "";
  const t = p.texts.map((x) => x.s).join(" ").toUpperCase();
  const m = t.match(/ROOF\s*(?:PLAN|DRAINAGE|LAYOUT)/);
  return m ? m[0].replace(/\s+/g, " ") : "";
};
const sheetNo = (i: number) => `Sheet ${String(i).padStart(2, "0")}`;

export function PlansFlow({ estimateId, orgId, jobId, locked, aiEnabled, current, saved, savedImageUrl }: Props) {
  const [step, setStep] = useState<Step>(saved ? "roof" : "drop");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState(saved?.file.name ?? "");
  const [pages, setPages] = useState<PageData[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [readCount, setReadCount] = useState(0);
  const [pageCount, setPageCount] = useState(saved?.pageCount ?? 0);
  const [detected, setDetected] = useState<DetectedPage[]>([]);
  const [pageIdx, setPageIdx] = useState(saved?.page ?? 0);
  const [pageSize, setPageSize] = useState(saved?.pageSize ?? { w: 420, h: 297 });
  const [image, setImage] = useState<{ url: string; blob: Blob | null } | null>(savedImageUrl ? { url: savedImageUrl, blob: null } : null);
  const [ticks, setTicks] = useState<{ k: string; v: string }[]>([]);
  const [paper, setPaper] = useState<string | null>(saved ? paperSize(saved.pageSize.w, saved.pageSize.h) : null);
  const [scaleSource, setScaleSource] = useState(saved?.scaleSource ?? "default");
  const [model, setModelRaw] = useState<PlanModel>(saved ? { scale: saved.scale, pitch: saved.pitch, lines: saved.lines } : { scale: 100, pitch: 22.5, lines: [] });
  const [history, setHistory] = useState<PlanModel[]>([]);
  const [details, setDetails] = useState<Found[]>(saved?.details ?? []);
  const [apply, setApply] = useState<Set<string>>(new Set());
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [downpipes, setDownpipes] = useState(saved?.downpipes ?? 0);
  const [tab, setTab] = useState<"interact" | "all">("all");
  const [tool, setTool] = useState<Tool>("type");
  const [draft, setDraft] = useState<Pt | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [realLen, setRealLen] = useState("");
  const [profile, setProfile] = useState<SheetProfile>((saved?.profile as SheetProfile) ?? "custom_orb");
  const [colour, setColour] = useState(COLOURS.find((c) => c.name === saved?.colour) ?? COLOURS[0]);
  const [overhang, setOverhang] = useState(saved?.overhangMm ?? 55);
  const [bump, setBump] = useState(0);
  const [upload, setUpload] = useState<{ path: string | null; fileId: string | null; imagePath: string | null; imagePage: number | null }>({ path: saved?.file.path ?? null, fileId: saved?.file.id ?? null, imagePath: saved?.file.imagePath ?? null, imagePage: saved ? saved.page : null });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ lines: number; seconds: number } | null>(null);
  const pdfRef = useRef<OpenPdf | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef<number>(0);
  const [dragOver, setDragOver] = useState(false);
  const readOnly = locked;

  const setModel = (next: PlanModel, record = true) => {
    if (record) setHistory((h) => [...h.slice(-49), model]);
    setModelRaw(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setModelRaw(prev);
  };

  const analysis = useMemo(() => analyzeRoof(model), [model]);
  const sheetPlan = useMemo(() => planSheets(analysis, model.pitch, { coverMm: SHEET_PROFILES[profile].coverMm, rotatable: SHEET_PROFILES[profile].rotatable, overhangMm: overhang }), [analysis, model.pitch, profile, overhang]);
  const flashings = useMemo(() => planFlashings(analysis, model.pitch, downpipes), [analysis, model.pitch, downpipes]);
  const t = analysis.totals;
  const showRoof = step === "roof" || step === "sheets" || step === "done";
  const area = useCountUp(t.area, showRoof);
  const lmCount = useCountUp(sheetPlan.lm, step === "sheets" || step === "done", 1100);
  const imageBox = image ? { url: image.url, w: pageSize.w * model.scale, h: pageSize.h * model.scale } : null;
  const outline = analysis.outlines.length === 1 ? analysis.outlines[0] : null;
  const canHip = !readOnly && outline && !analysis.edges.some((e) => e.role === "inner") ? hipRoofLines(outline) : null;

  // ---------------------------------------------------------------------------
  // Reading the PDF
  // ---------------------------------------------------------------------------
  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return setError("That isn't a PDF. Drop the architect's plans as a PDF.");
    if (f.size > 50 * 1024 * 1024) return setError("That PDF is over 50 MB.");
    fileRef.current = f;
    setFileName(f.name);
    started.current = performance.now();
    setStep("scan");
    setTicks([]);
    setReadCount(0);
    setThumbs([]);
    const t0 = performance.now();
    try {
      const buf = await f.arrayBuffer();
      if (!readOnly) void uploadPdf(f);
      const pdf = await openPdf(buf);
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      const out: string[] = [];
      const ps = await readAllPages(pdf, async (i) => {
        setReadCount(i + 1);
        try { out[i] = (await renderPage(pdf, i, 0.7, "image/jpeg")).url; setThumbs([...out]); } catch { /* thumbnail only */ }
      });
      setPages(ps);
      const det = detectRoofPages(ps);
      setDetected(det);
      const best = det[0];
      const pg = ps[best.page];
      const found = parseDetails(ps.map((p) => ({ index: p.index, texts: p.texts })), { pitch: best.pitch, roofPage: best.page });
      const roofMat = found.find((x) => x.key === "roofMaterial")?.value;
      const steps = [
        { k: "Found the roof plan", v: `${sheetNo(best.page)}${sheetTitle(pg) ? ` · ${sheetTitle(pg).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}` },
        { k: "Worked out the scale", v: best.scale.text },
        { k: "Spotted the pitch", v: best.pitch ? `${best.pitch}°` : "Not written: set it" },
        { k: "Roof type", v: roofMat ? (/colou?rbond/i.test(roofMat) ? "COLORBOND metal" : roofMat) : "Not written" },
      ];
      steps.forEach((s, i) => setTimeout(() => setTicks((tk) => (tk.length > i ? tk : [...tk, s])), Math.max(0, 500 + i * 550 - (performance.now() - t0))));
      await choosePage(best.page, det, ps, pdf);
      setDownpipes(best.downpipes);
      setDetails(found);
      setApply(defaultApply(found, current));
      if (aiEnabled) {
        setAiNote("Asking AI to double-check the details…");
        aiPlanDetails({ estimateId, text: plainText(ps.map((p) => ({ index: p.index, texts: p.texts }))) }).then((r) => {
          if (r.details) {
            const merged = mergeDetails(found, r.details);
            setDetails((cur) => mergeDetails(cur, r.details!));
            setApply((cur) => { const add = defaultApply(merged.filter((x) => x.via === "ai"), current); return new Set([...cur, ...add]); });
            setAiNote(merged.length > found.length ? `AI found ${merged.length - found.length} more detail${merged.length - found.length === 1 ? "" : "s"}.` : null);
          } else setAiNote(null);
        }).catch(() => setAiNote(null));
      }
      const wait = Math.max(0, 3300 - (performance.now() - t0));
      setTimeout(() => setStep("details"), wait);
    } catch (e) {
      setError(e instanceof Error && /password/i.test(e.message) ? "That PDF is password-protected. Save it without a password and try again." : "We couldn't read that PDF. Is it the architect's drawings (not a scan)?");
      setStep("drop");
    }
  }

  async function uploadPdf(f: File) {
    try {
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "plans.pdf";
      const path = `${orgId}/${jobId}/plans/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await createClient().storage.from("job-files").upload(path, f, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const r = await attachPlansFile({ estimateId, path, name: f.name, size: f.size });
      setUpload((u) => ({ ...u, path, fileId: r.fileId ?? null }));
    } catch {
      /* the takeoff still works; the PDF just isn't kept */
    }
  }

  async function choosePage(index: number, det = detected, ps = pages, pdf = pdfRef.current) {
    const d = det.find((x) => x.page === index);
    const p = ps[index];
    if (!d || !p || !pdf) return;
    setPageIdx(index);
    setPageSize({ w: p.widthMm, h: p.heightMm });
    setPaper(d.scale.paper);
    setScaleSource(d.scale.source);
    setModelRaw({ scale: d.scale.scale, pitch: d.pitch ?? model.pitch ?? 22.5, lines: d.candidate?.lines ?? [] });
    setHistory([]);
    setDownpipes(d.downpipes);
    setSelected(null);
    try {
      const img = await renderPage(pdf, index, 4);
      setImage({ url: img.url, blob: img.blob });
    } catch {
      setImage(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------
  const scaleText = `1:${Math.round(model.scale)}${paper ? ` at ${paper}` : ""}`;
  const realTol = Math.max(250, Math.hypot(pageSize.w, pageSize.h) * model.scale * 0.012);
  function onLine(i: number) {
    const e = analysis.edges[i];
    if (!e) return;
    if (tool === "delete") {
      setModel({ ...model, lines: normalizeLines(model.lines.filter((_, j) => j !== i), model.scale) });
      return;
    }
    if (tool === "measure") { setSelected(i); setRealLen(""); return; }
    if (e.role === "outline" && e.type) {
      const next = NEXT_EDGE[e.type as EdgeType];
      const run = analysis.runs[e.run];
      const ids = new Set(run ? run.edges : [i]);
      setModel({ ...model, lines: model.lines.map((l, j) => (ids.has(j) ? { ...l, set: next } : l)) });
    } else if (e.role === "inner" && e.type) {
      const next = NEXT_KIND[e.type as LineKind];
      setModel({ ...model, lines: model.lines.map((l, j) => (j === i ? { ...l, set: next } : l)) });
    }
  }
  function onPoint(p: Pt) {
    const paperTol = realTol / model.scale;
    const q = snapPoint([p[0] / model.scale, p[1] / model.scale], model.lines, paperTol);
    if (!draft) { setDraft([q[0] * model.scale, q[1] * model.scale]); return; }
    const a: Pt = [draft[0] / model.scale, draft[1] / model.scale];
    if (Math.hypot(a[0] - q[0], a[1] - q[1]) < 0.5) { setDraft(null); return; }
    setModel({ ...model, lines: normalizeLines([...model.lines, { a, b: q }], model.scale) });
    setDraft(null);
  }
  function applyScale() {
    const e = selected != null ? analysis.edges[selected] : null;
    const real = Number(realLen.replace(",", "."));
    if (!e || !(real > 0)) return;
    const metres = real > 100 ? real / 1000 : real; // accept mm or m
    const factor = (metres * 1000) / e.plan;
    if (!(factor > 0.2 && factor < 5)) { setError("That length is very different from the drawing. Check the line and the number."); return; }
    const scale = Math.round(model.scale * factor * 100) / 100;
    setModel({ ...model, scale });
    setScaleSource("checked");
    setError(null);
    setSelected(null);
    setRealLen("");
    setTool("type");
  }
  function addHipRoof() {
    if (!canHip) return;
    const lines: PlanLine[] = canHip.map(([a, b]) => ({ a: [a[0] / model.scale, a[1] / model.scale] as Pt, b: [b[0] / model.scale, b[1] / model.scale] as Pt }));
    setModel({ ...model, lines: normalizeLines([...model.lines, ...lines], model.scale) });
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------
  async function addToQuote() {
    setSaving(true);
    setError(null);
    try {
      let imagePath = upload.imagePath;
      if (image?.blob && upload.imagePage !== pageIdx) {
        const path = `${orgId}/${jobId}/plans/${crypto.randomUUID()}-sheet-${pageIdx}.png`;
        const { error: upErr } = await createClient().storage.from("job-files").upload(path, image.blob, { contentType: "image/png", upsert: false });
        if (!upErr) { imagePath = path; setUpload((u) => ({ ...u, imagePath: path, imagePage: pageIdx })); }
      }
      const r = await savePlansTakeoff({
        estimateId,
        model: { scale: model.scale, pitch: model.pitch, lines: model.lines.map((l) => ({ a: l.a, b: l.b, set: l.set ?? null })) },
        page: pageIdx,
        pageCount: Math.max(1, pageCount),
        pageSize,
        scaleSource,
        file: { id: upload.fileId, path: upload.path, name: fileName || "plans.pdf", imagePath },
        profile: profile as MetalProfile,
        colour: colour.name,
        overhangMm: overhang,
        downpipes,
        details: details.map((d) => ({ ...d, value: d.value.slice(0, 200) })),
        apply: [...apply] as never,
      });
      if (r.error) { setError(r.error); return; }
      setResult({ lines: r.lines ?? 0, seconds: started.current ? Math.round((performance.now() - started.current) / 1000) : 0 });
      setStep("done");
    } finally {
      setSaving(false);
    }
  }

  const hint = readOnly ? "View only: this quote is accepted" : tool === "add" ? (draft ? "Click where the line ends" : "Click where the new line starts") : tool === "delete" ? "Tap a line to delete it" : tool === "measure" ? "Tap a line you know the length of" : "Tap a line to change it";

  return (
    <div className="relative">
      <style>{`
        @keyframes rb-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
        @keyframes rb-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rb-pop { 0% { opacity: 0; transform: scale(.6) } 70% { transform: scale(1.06) } 100% { opacity: 1; transform: scale(1) } }
        @keyframes rb-scan { from { transform: translateY(-10%) } to { transform: translateY(560%) } }
        @keyframes rb-drop { from { opacity: 0; transform: translateY(-900px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes rb-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes rb-confetti { 0% { transform: translate3d(0,-20px,0) rotate(0) } 100% { transform: translate3d(var(--dx), 110vh, 0) rotate(var(--r)) } }
        .rb-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: rb-draw .7s ease-out forwards }
        .rb-sheet { animation: rb-drop .55s cubic-bezier(.2,.9,.3,1.2) both }
        @media (prefers-reduced-motion: reduce) { .rb-line, .rb-sheet { animation: none; stroke-dashoffset: 0 } }
      `}</style>

      <div className="mb-5 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <span key={s} className={cx("h-2 rounded-full transition-all duration-500", STEPS.indexOf(step) >= i ? "w-10 bg-brand-500" : "w-2 bg-slate-300")} />
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      {step === "drop" && (
        <label
          className={cx("group flex w-full cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed bg-white px-6 py-16 text-center transition sm:px-8 sm:py-20", dragOver ? "border-brand-500 bg-brand-50" : "border-brand-500/40 hover:border-brand-500 hover:bg-brand-50")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFile(e.dataTransfer.files?.[0]); }}
          data-testid="plans-drop"
        >
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" data-testid="plans-input" onChange={(e) => void onFile(e.target.files?.[0])} />
          <span className="text-7xl" style={{ animation: "rb-float 2.4s ease-in-out infinite" }} aria-hidden>🏠</span>
          <span className="font-display mt-6 text-3xl font-bold text-ink sm:text-4xl">Drop the plans here</span>
          <span className="mt-3 max-w-lg text-lg text-slate-600">The architect&apos;s PDF is all we need. We&apos;ll find the roof, measure every line and fill in the job details.</span>
          <span className="mt-8 inline-flex min-h-14 items-center rounded-2xl bg-brand-500 px-8 text-lg font-semibold text-white transition group-hover:scale-105">Choose the PDF</span>
          <span className="mt-4 text-sm text-slate-400">or drag it onto this box · PDF up to 50 MB</span>
          {saved && <button type="button" onClick={(e) => { e.preventDefault(); setStep("roof"); }} className="mt-6 text-sm font-semibold text-brand-600 underline">Back to the saved roof</button>}
        </label>
      )}

      {step === "scan" && (
        <div className="grid gap-8 rounded-[28px] bg-white p-6 ring-1 ring-slate-200 sm:p-8 lg:grid-cols-[1fr_380px]" data-testid="plans-scan">
          <div className="relative grid grid-cols-3 gap-3 overflow-hidden sm:grid-cols-5">
            {Array.from({ length: Math.max(pageCount, readCount, 1) }).map((_, i) => {
              const roofHit = ticks.length >= 1 && detected[0]?.page === i;
              return (
                <figure key={i} className={cx("rounded-xl p-1.5 ring-1 transition-all duration-500", roofHit ? "scale-110 bg-brand-50 ring-2 ring-brand-500" : ticks.length >= 1 ? "opacity-40 ring-slate-200" : "ring-slate-200")} style={{ animation: `rb-pop .4s ${i * 0.05}s both` }}>
                  {thumbs[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[i]} alt="" className="aspect-[1.41] w-full rounded-md bg-white object-cover" />
                  ) : <span className="block aspect-[1.41] w-full rounded-md bg-slate-100" />}
                  <figcaption className="mt-1 truncate text-[11px] text-slate-500">{sheetNo(i)}{sheetTitle(pages[i]) ? ` · ${sheetTitle(pages[i]).toLowerCase()}` : ""}</figcaption>
                </figure>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-brand-500/25 to-transparent" style={{ animation: "rb-scan 1.6s linear infinite" }} />
          </div>
          <div>
            <p className="font-display text-3xl font-bold text-ink">Reading your plans…</p>
            <p className="mt-1 text-sm text-slate-500">{readCount ? `${readCount} of ${pageCount} sheets read` : "Opening the PDF"}</p>
            <ul className="mt-6 space-y-4 text-lg">
              {["Found the roof plan", "Worked out the scale", "Spotted the pitch", "Roof type"].map((k, i) => {
                const done = ticks[i];
                return (
                  <li key={k} className={cx("flex items-center gap-3 transition-all duration-500", done ? "opacity-100" : "translate-x-3 opacity-25")} data-testid="scan-tick">
                    <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold", done ? "bg-brand-500 text-white" : "bg-slate-200 text-slate-400")}>{done ? "✓" : i + 1}</span>
                    <span className="text-slate-700">{k}</span>
                    <span className="ml-auto text-right font-semibold text-ink">{done?.v ?? ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {step === "details" && (
        <DetailsStep details={details} setDetails={setDetails} apply={apply} setApply={setApply} current={current} aiNote={aiNote} onNext={() => setStep("roof")} />
      )}

      {showRoof && (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-3">
            <RoofView
              analysis={analysis} pitch={model.pitch} tab={tab} onTab={(v) => { setTab(v); setDraft(null); }} image={imageBox}
              showSheets={step !== "roof"} colour={colour.hex} pieces={sheetPlan.pieces} bump={bump}
              tool={tool} selected={selected} draft={draft} readOnly={readOnly || step !== "roof"} hint={step === "roof" ? hint : undefined}
              onLine={onLine} onPoint={onPoint}
            />
            {step === "roof" && tab === "all" && !readOnly && (
              <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Edit the roof lines">
                {([["type", "Change type"], ["add", "Add a line"], ["delete", "Delete a line"], ["measure", "Check one dimension"]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={tool === k} onClick={() => { setTool(k); setDraft(null); if (k !== "measure") setSelected(null); }}
                    className={cx("min-h-11 rounded-full px-4 text-sm font-semibold ring-1 transition", tool === k ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")} data-testid={`tool-${k}`}>
                    {label}
                  </button>
                ))}
                <button type="button" onClick={undo} disabled={!history.length} className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40" data-testid="tool-undo">↶ Undo</button>
                {canHip && <button type="button" onClick={addHipRoof} className="min-h-11 rounded-full bg-brand-50 px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-500" data-testid="hip-roof">Hip roof: work out hips and ridges</button>}
                <span className="ml-auto flex flex-wrap gap-3 text-xs text-slate-500">
                  {(["eave", "ridge", "hip", "valley", "barge", "apron"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full" style={{ background: KIND_COLOR[k] }} />{k === "eave" ? "Gutter" : k === "apron" ? "Apron" : k[0].toUpperCase() + k.slice(1)}</span>)}
                </span>
              </div>
            )}
            {analysis.warnings.length > 0 && step === "roof" && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{analysis.warnings.join(" ")}</p>}
          </div>

          <aside className="space-y-4">
            {step === "roof" && (
              <>
                <div className="rounded-[28px] bg-ink p-6 text-white">
                  <p className="text-sm font-medium uppercase tracking-wider text-white/60">Your roof</p>
                  <p className="font-display mt-1 text-6xl font-bold tabular-nums" data-testid="total-area" data-value={t.area}>{area.toFixed(1)}<span className="ml-1 text-3xl">m²</span></p>
                  <p className="mt-2 text-sm text-white/70">{analysis.faces.length} panels at {model.pitch}° · open Interact and hover a panel</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["ridge", "hip", "valley", "eave", ...(t.barge > 0 ? ["barge" as const] : []), ...(t.apron > 0 ? ["apron" as const] : [])] as const).map((k, i) => (
                    <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" style={{ animation: `rb-pop .4s ${0.6 + i * 0.1}s both` }} data-testid={`total-${k}`} data-value={t[k]}>
                      <span className="block h-1.5 w-8 rounded-full" style={{ background: KIND_COLOR[k] }} />
                      <p className="mt-3 text-sm text-slate-500">{k === "eave" ? "Gutters" : k === "apron" ? "Aprons" : `${k[0].toUpperCase()}${k.slice(1)}s`}</p>
                      <p className="font-display text-2xl font-bold tabular-nums text-ink">{fmt(t[k])} m</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 rounded-[28px] bg-white p-5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="pitch" className="text-sm font-semibold text-slate-600">Pitch</label>
                    <span className="flex items-center gap-1">
                      <input id="pitch" type="number" min={1} max={60} step={0.5} value={model.pitch} disabled={readOnly} data-testid="pitch-input"
                        onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 60) setModel({ ...model, pitch: v }, false); }}
                        className="min-h-11 w-20 rounded-xl px-2 text-right text-base font-semibold tabular-nums ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <span className="text-slate-500">°</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="dps" className="text-sm font-semibold text-slate-600">Downpipes</label>
                    <input id="dps" type="number" min={0} max={200} value={downpipes} disabled={readOnly} data-testid="downpipes-input"
                      onChange={(e) => setDownpipes(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      className="min-h-11 w-20 rounded-xl px-2 text-right text-base font-semibold tabular-nums ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="border-t border-slate-100 pt-3" data-testid="scale-card">
                    <p className="text-sm font-semibold text-slate-600">Scale <span className="font-bold text-ink" data-testid="scale-text">{scaleText}</span>
                      <span className="ml-1 text-xs font-normal text-slate-400">{scaleSource === "label" ? "(written on the sheet)" : scaleSource === "dimensions" ? "(from the dimensions)" : scaleSource === "other_sheet" ? "(from the floor plan)" : scaleSource === "checked" ? "(you checked it)" : "(usual for plans)"}</span>
                    </p>
                    {!readOnly && (selected != null && tool === "measure" && analysis.edges[selected] ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-slate-600">That line is <b>{fmt(analysis.edges[selected].plan / 1000)} m</b> on the drawing. Its real length:</p>
                        <div className="flex gap-2">
                          <input inputMode="decimal" autoFocus value={realLen} onChange={(e) => setRealLen(e.target.value)} placeholder="e.g. 10.19" data-testid="real-length"
                            onKeyDown={(e) => { if (e.key === "Enter") applyScale(); }}
                            className="min-h-11 w-full rounded-xl px-3 text-base ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          <span className="self-center text-slate-500">m</span>
                          <button type="button" onClick={applyScale} className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white" data-testid="apply-scale">Set</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setTab("all"); setTool("measure"); }} className="mt-2 text-sm font-semibold text-brand-600 hover:underline" data-testid="check-dimension">
                        Check one dimension: tap a line and type its real length
                      </button>
                    ))}
                  </div>
                  {(detected.length > 1 || pageCount > 1) && pages.length > 0 && (
                    <div className="border-t border-slate-100 pt-3">
                      <label htmlFor="sheet" className="text-sm font-semibold text-slate-600">Wrong sheet?</label>
                      <select id="sheet" value={pageIdx} onChange={(e) => void choosePage(Number(e.target.value))} className="mt-1 block min-h-11 w-full rounded-xl px-3 text-sm ring-1 ring-slate-300" data-testid="sheet-select">
                        {pages.map((p) => <option key={p.index} value={p.index}>{sheetNo(p.index)}{sheetTitle(p) ? ` · ${sheetTitle(p).toLowerCase()}` : ""}{detected.find((d) => d.page === p.index)?.candidate ? ` · ${detected.find((d) => d.page === p.index)!.candidate!.faces} panels` : ""}</option>)}
                      </select>
                    </div>
                  )}
                  {saved && !readOnly && pages.length === 0 && (
                    <button type="button" onClick={() => setStep("drop")} className="border-t border-slate-100 pt-3 text-sm font-semibold text-brand-600 hover:underline">Upload new plans</button>
                  )}
                </div>
                <button type="button" onClick={() => { setStep("sheets"); setBump((b) => b + 1); setTool("type"); setDraft(null); setSelected(null); }} disabled={!analysis.faces.length}
                  className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white transition hover:scale-[1.02] disabled:opacity-50" data-testid="pick-sheets">
                  {readOnly ? "See the sheets →" : "Looks good. Pick the sheets →"}
                </button>
              </>
            )}

            {(step === "sheets" || step === "done") && (
              <>
                <div className="rounded-[28px] bg-white p-5 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-500">Profile</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {PROFILE_IDS.map((id) => (
                      <button key={id} type="button" disabled={step === "done" || readOnly} onClick={() => { setProfile(id); setBump((b) => b + 1); }} data-testid={`profile-${id}`} aria-pressed={profile === id}
                        className={cx("rounded-2xl p-3 text-left ring-1 transition", profile === id ? "bg-brand-50 ring-2 ring-brand-500" : "ring-slate-200 hover:bg-slate-50")}>
                        <span className="block text-sm font-bold text-ink">{SHEET_PROFILES[id].label}</span>
                        <span className="block text-xs text-slate-500">{SHEET_PROFILES[id].blurb}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-5 text-sm font-semibold text-slate-500">Colour · <span className="text-ink" data-testid="colour-name">{colour.name}</span></p>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {COLOURS.map((c) => (
                      <button key={c.name} type="button" title={c.name} aria-label={c.name} disabled={step === "done" || readOnly} onClick={() => { setColour(c); setBump((b) => b + 1); }} data-testid="colour"
                        className={cx("h-11 w-11 rounded-full ring-offset-2 transition hover:scale-110", colour.name === c.name ? "ring-2 ring-brand-500" : "ring-1 ring-slate-300")} style={{ background: c.hex }} />
                    ))}
                  </div>
                </div>
                <div className="rounded-[28px] bg-ink p-6 text-white">
                  <p className="text-sm font-medium uppercase tracking-wider text-white/60">You&apos;ll need</p>
                  <p className="font-display mt-1 text-5xl font-bold tabular-nums" data-testid="sheet-count" data-value={sheetPlan.count}>{sheetPlan.count} <span className="text-2xl">sheets</span></p>
                  <p className="mt-1 text-lg tabular-nums text-white/80" data-testid="sheet-lm" data-value={sheetPlan.lm}>{lmCount.toFixed(0)} m of {SHEET_PROFILES[profile].label} in {colour.name}</p>
                  <p className="mt-1 text-xs text-white/60">{fmt(sheetPlan.m2, 1)} m² of sheet for {fmt(sheetPlan.roofM2, 1)} m² of roof · {sheetPlan.wastePct}% waste{sheetPlan.pairs ? ` · ${sheetPlan.pairs} angled cuts nested in pairs` : ""}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    {(["ridge", "hip", "gutter"] as const).map((k) => {
                      const l = flashings.lines.find((x) => x.key === k);
                      return <span key={k} className="rounded-xl bg-white/10 px-2 py-2"><b className="block text-base">{fmt(l?.lm ?? 0, 1)} m</b>{k === "gutter" ? "gutter" : `${k} cap`}</span>;
                    })}
                  </div>
                </div>
                <details className="rounded-[28px] bg-white p-5 ring-1 ring-slate-200" data-testid="cut-list">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Cut list and flashings</summary>
                  <div className="mt-3 grid gap-4 text-sm">
                    <div>
                      <p className="mb-1 font-semibold text-slate-600">{SHEET_PROFILES[profile].label} sheets ({METAL_PROFILE_INFO[profile as MetalProfile].coverMm} mm cover, {overhang} mm into the gutter)</p>
                      <ul className="grid grid-cols-3 gap-x-3 gap-y-1 tabular-nums text-slate-700">
                        {sheetPlan.cutList.map((r) => <li key={r.lengthMm}><b>{r.qty}</b> × {(r.lengthMm / 1000).toFixed(2)} m</li>)}
                      </ul>
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                      <p className="mb-1 font-semibold text-slate-600">Flashings (300 mm per run, 100 mm laps, 8 m lengths)</p>
                      <ul className="space-y-1 text-slate-700">
                        {flashings.lines.map((l) => (
                          <li key={l.key} className="flex gap-2"><span className="w-32 shrink-0">{l.label}</span><b className="w-16 shrink-0 tabular-nums">{fmt(l.lm, 1)} m</b><span className="text-xs text-slate-500">{l.lengths.map((x) => `${x.qty}/${(x.lengthMm / 1000).toFixed(1)}`).join(", ")}</span></li>
                        ))}
                        <li className="flex gap-2"><span className="w-32 shrink-0">Battens</span><b className="w-16 shrink-0 tabular-nums">{fmt(flashings.battens.lm, 1)} m</b><span className="text-xs text-slate-500">{flashings.battens.lengths} × 8 m, rows every 900 mm</span></li>
                        <li className="flex gap-2"><span className="w-32 shrink-0">Downpipes</span><b className="tabular-nums">{downpipes}</b></li>
                      </ul>
                    </div>
                    {!readOnly && step === "sheets" && (
                      <label className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-slate-600">
                        Sheet overhang into the gutter
                        <span className="flex items-center gap-1"><input type="number" min={0} max={300} value={overhang} onChange={(e) => setOverhang(Math.max(0, Math.min(300, Number(e.target.value) || 0)))} className="min-h-11 w-20 rounded-xl px-2 text-right ring-1 ring-slate-300" /> mm</span>
                      </label>
                    )}
                  </div>
                </details>
                {step === "sheets" && (readOnly ? (
                  <button type="button" onClick={() => setStep("roof")} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-white text-lg font-semibold text-ink ring-1 ring-slate-300">← Back to the roof</button>
                ) : (
                  <>
                    <button type="button" onClick={() => void addToQuote()} disabled={saving} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60" data-testid="add-to-quote">
                      {saving ? "Adding…" : "Add to quote 🎉"}
                    </button>
                    <button type="button" onClick={() => setStep("roof")} className="w-full text-center text-sm font-semibold text-slate-500 hover:text-ink">← Back to the roof</button>
                  </>
                ))}
                {step === "done" && result && (
                  <div ref={(el) => { el?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="rounded-[28px] bg-brand-50 p-6 ring-2 ring-brand-500" style={{ animation: "rb-pop .5s both" }} data-testid="done-card">
                    <p className="font-display text-2xl font-bold text-ink">On the quote!</p>
                    <p className="mt-2 text-slate-700">{result.lines} lines added from the measurements, and the job details filled in.</p>
                    {result.seconds > 0 && <p className="mt-3 text-sm text-slate-600">Measured in <b>{Math.floor(result.seconds / 60)} min {result.seconds % 60} s</b>, straight from the plans.</p>}
                    <Link href={`/app/estimates/${estimateId}`} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink text-base font-semibold text-white" data-testid="open-quote">Open the quote</Link>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {step === "done" && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
          {Array.from({ length: 90 }).map((_, i) => {
            const cols = ["#1f5f3f", "#8fd0a8", "#f59e0b", "#2563eb", "#dc2626", "#ea7a1a", colour.hex];
            const left = (i * 37) % 100, delay = (i % 15) * 0.07, dx = ((i * 53) % 200) - 100, r = ((i * 97) % 720) - 360;
            return <span key={i} className="absolute top-0 block h-3 w-2 rounded-sm" style={{ left: `${left}%`, background: cols[i % cols.length], animation: `rb-confetti ${2.4 + (i % 5) * 0.3}s ${delay}s cubic-bezier(.2,.6,.4,1) forwards`, ["--dx" as string]: `${dx}px`, ["--r" as string]: `${r}deg` }} />;
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "We found these details"
// ---------------------------------------------------------------------------
type Row = { key: DetailKey | "customer" | "customerAddress"; label: string; now: string | null; same: boolean; note?: string };

function currentFor(key: DetailKey, c: CurrentJob, details: Found[]): { now: string | null; same: boolean } {
  const v = (k: DetailKey) => details.find((d) => d.key === k)?.value ?? "";
  const eq = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  switch (key) {
    case "street": {
      const composed = [v("street"), [v("suburb"), v("state"), v("postcode")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return { now: c.siteAddress, same: !c.siteAddress || eq(c.siteAddress, composed) };
    }
    case "state": return { now: c.jobState, same: !c.jobState || eq(c.jobState, v("state")) };
    case "postcode": return { now: c.jobZip, same: !c.jobZip || eq(c.jobZip, v("postcode")) };
    case "buildingType": {
      const jt = jobTypeFromBuilding(v("buildingType"));
      return { now: c.jobType ? jobTypeLabel(c.jobType) : null, same: !c.jobType || c.jobType === jt || c.jobType === "replacement" };
    }
    case "roofMaterial": return { now: c.roofMaterial, same: !c.roofMaterial || eq(c.roofMaterial, v("roofMaterial")) };
    default: return { now: null, same: true };
  }
}

export function defaultApply(found: Found[], c: CurrentJob): Set<string> {
  const out = new Set<string>();
  for (const f of found) {
    if (f.key === "pitch") continue;
    if (currentFor(f.key, c, found).same) out.add(f.key);
    if (f.key === "suburb" && out.has("street")) out.add("suburb");
  }
  const client = found.find((f) => f.key === "client")?.value;
  if (client && client.trim().toLowerCase() === c.customerName.trim().toLowerCase()) out.add("customer");
  if (found.some((f) => f.key === "street") && !c.customerAddress.address) out.add("customerAddress");
  return out;
}

function DetailsStep({ details, setDetails, apply, setApply, current, aiNote, onNext }: {
  details: Found[]; setDetails: (f: (d: Found[]) => Found[]) => void; apply: Set<string>; setApply: (f: (s: Set<string>) => Set<string>) => void;
  current: CurrentJob; aiNote: string | null; onNext: () => void;
}) {
  const rows: Row[] = [];
  for (const k of DETAIL_KEYS) {
    if (!details.some((d) => d.key === k)) continue;
    const cur = currentFor(k, current, details);
    if (k === "client") {
      const same = details.find((d) => d.key === "client")!.value.trim().toLowerCase() === current.customerName.trim().toLowerCase();
      rows.push({ key: "customer", label: "Customer", now: same ? null : current.customerName, same, note: same ? "Same as the job's customer" : "Ticked: the job is linked to this customer (we match an existing one by name, or add it)" });
      continue;
    }
    rows.push({ key: k, label: DETAIL_LABEL[k], now: cur.same ? null : cur.now, same: cur.same, note: k === "pitch" ? "Used for the roof" : undefined });
  }
  const hasAddress = details.some((d) => d.key === "street");
  const valueKey = (r: Row): DetailKey => (r.key === "customer" ? "client" : r.key) as DetailKey;
  const toggle = (k: string) => setApply((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const found = details.length;
  const fromAi = details.filter((d) => d.via === "ai").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]" data-testid="details-step">
      <div className="rounded-[28px] bg-white p-5 ring-1 ring-slate-200 sm:p-8">
        <p className="font-display text-3xl font-bold text-ink">We found these details</p>
        <p className="mt-1 text-slate-600">Tick what should go on the job and customer. Fix anything that&apos;s wrong; nothing you already entered changes unless you tick it.</p>
        {aiNote && <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">{aiNote}</p>}
        {found === 0 ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-6 text-center text-slate-600">No title block details found on these plans. You can still measure the roof.</p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100">
            {rows.map((r) => {
              const vk = valueKey(r);
              const d = details.find((x) => x.key === vk)!;
              const canTick = r.key !== "pitch";
              return (
                <li key={r.key} className="flex flex-wrap items-center gap-3 py-3" data-testid="detail-row" data-detail={r.key}>
                  {canTick ? (
                    <input type="checkbox" checked={apply.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Use ${r.label}`} className="h-6 w-6 shrink-0 rounded accent-brand-500" />
                  ) : <span className="grid h-6 w-6 shrink-0 place-items-center text-brand-600">✓</span>}
                  <span className="w-36 shrink-0 text-sm font-semibold text-slate-600">{r.label}</span>
                  <span className="min-w-[12rem] flex-1">
                    <input value={d.value} onChange={(e) => setDetails((ds) => ds.map((x) => (x.key === vk ? { ...x, value: e.target.value } : x)))} aria-label={r.label}
                      className="block min-h-11 w-full rounded-xl px-3 text-base text-ink ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" data-testid={`detail-${r.key}`} />
                    {(r.now || r.note) && <span className="mt-1 block text-xs text-slate-500">{r.now ? <>Now: <b className="text-slate-700">{r.now}</b>{r.note ? ` · ${r.note}` : " · tick to replace it"}</> : r.note}</span>}
                  </span>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", d.via === "ai" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>
                    {d.via === "ai" ? "AI" : ""}{d.page >= 0 ? `${d.via === "ai" ? " · " : ""}${sheetNo(d.page)}` : ""}
                  </span>
                </li>
              );
            })}
            {hasAddress && (
              <li className="flex flex-wrap items-center gap-3 py-3" data-testid="detail-row" data-detail="customerAddress">
                <input type="checkbox" checked={apply.has("customerAddress")} onChange={() => toggle("customerAddress")} aria-label="Use the site address for the customer" className="h-6 w-6 shrink-0 rounded accent-brand-500" />
                <span className="text-sm text-slate-600">Also save the site address as the customer&apos;s address{current.customerAddress.address ? <> (now <b className="text-slate-700">{[current.customerAddress.address, current.customerAddress.city].filter(Boolean).join(", ")}</b>)</> : ""}</span>
              </li>
            )}
          </ul>
        )}
      </div>
      <aside className="space-y-4">
        <div className="rounded-[28px] bg-ink p-6 text-white">
          <p className="text-sm font-medium uppercase tracking-wider text-white/60">From the plans</p>
          <p className="font-display mt-1 text-5xl font-bold tabular-nums">{found}<span className="ml-2 text-2xl">details</span></p>
          <p className="mt-2 text-sm text-white/70">{fromAi ? `${fromAi} double-checked by AI · ` : ""}{apply.size} ticked to fill in</p>
        </div>
        <button type="button" onClick={onNext} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white transition hover:scale-[1.02]" data-testid="details-next">
          Looks right. Show me the roof →
        </button>
      </aside>
    </div>
  );
}
