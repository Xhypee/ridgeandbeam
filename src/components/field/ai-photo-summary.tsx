"use client";

import { useState } from "react";
import { Button, Textarea } from "@/components/ui";

/** Contract 2: AI draft of a homeowner-friendly photo summary. The rep reviews/edits before using it. */
export function AiPhotoSummary({ jobId }: { jobId: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">AI summary for the homeowner</p>
        <Button type="button" variant="secondary" disabled={loading}
          onClick={async () => {
            setLoading(true);
            setErr(null);
            try {
              const res = await fetch("/api/ai/photo-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
              const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
              if (!res.ok || !json.text) throw new Error(json.error ?? `AI request failed (${res.status})`);
              setText(json.text);
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}>
          {loading ? "Drafting…" : text ? "Redraft" : "AI summary"}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      {text && (
        <>
          <Textarea className="mt-2 min-h-40" value={text} onChange={(e) => setText(e.target.value)} aria-label="AI summary draft" />
          <p className="mt-1 text-xs text-slate-500">Draft — review and edit before sending it to the homeowner or adjuster.</p>
        </>
      )}
    </div>
  );
}
