"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";
import { money } from "@/lib/format";
import { parseScope } from "@/lib/claims-scope";
import { importScope } from "../actions";

export function ScopeImport({ claimId, source, existing }: { claimId: string; source: "carrier" | "contractor"; existing: number }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const parsed = useMemo(() => (text.trim() ? parseScope(text) : null), [text]);
  const total = parsed ? parsed.lines.reduce((s, l) => s + l.total, 0) : 0;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) { setMsg({ error: "That file is too large (2 MB max)." }); return; }
    if (/\.esx$/i.test(f.name)) { setMsg({ error: "ESX files can't be read without a Verisk partnership. Export the estimate to CSV or copy the line items from the PDF/spreadsheet instead." }); return; }
    setText(await f.text());
    setMsg(null);
  }

  function submit() {
    if (!parsed?.lines.length) return;
    if (existing > 0 && !window.confirm(`Replace the ${existing} ${source} line${existing === 1 ? "" : "s"} already imported?`)) return;
    start(async () => {
      const r = await importScope({ claimId, source, lines: parsed.lines });
      setMsg(r ?? null);
      if (!r?.error) { setText(""); router.refresh(); }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        aria-label={`${source === "carrier" ? "Carrier" : "Contractor"} scope lines`}
        rows={5}
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        placeholder={"Paste rows from Excel/Sheets or CSV:\ncode, description, qty, unit, unit price, total\nRFG DRIP, Drip edge, 180, LF, 2.85, 513.00"}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
          Choose CSV…
          <input type="file" accept=".csv,.txt,.tsv,.esx,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Button type="button" onClick={submit} disabled={pending || !parsed?.lines.length} className="min-h-11">
          {pending ? "Importing…" : parsed?.lines.length ? `Import ${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"} (${money(total)})` : "Import"}
        </Button>
        {parsed && parsed.skipped > 0 && <span className="text-xs text-amber-700">{parsed.skipped} row{parsed.skipped === 1 ? "" : "s"} skipped (headers, totals or unreadable).</span>}
      </div>
      {msg?.error && <p role="alert" className="text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-green-700">{msg.ok}</p>}
    </div>
  );
}
