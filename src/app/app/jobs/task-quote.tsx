// The "Send the quote" task once there's a draft: what Claude worked out from the plans (the dimensioned roof on a
// blueprint sheet) and the quote as a receipt (biggest lines, how many more, total), then Send quote, Edit and a
// Full preview of the email exactly as the customer gets it. Everything is checked here before it goes.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ItemIcon } from "@/components/item-icons";
import { cx } from "@/components/ui";
import type { Docket } from "@/lib/job-docket-server";
import { roofSheet } from "@/lib/roof-sheet";
import { TORN } from "@/lib/torn";
import { RoofDrawing } from "./document-drop";
import { Icon } from "./job-section-ui";
import { sendQuoteEmail } from "./quote-actions";

const SEND = "M4 12l16-8-6 16-2.5-6.5z";
const PEN = "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3";
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z";
const GRID = { backgroundColor: "#f5f4ee", backgroundImage: "linear-gradient(rgba(19,34,26,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(19,34,26,.06) 1px, transparent 1px)", backgroundSize: "22px 22px", backgroundPosition: "-1px -1px" };
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const kicker = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400";
const outline = "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 font-mono text-xs font-semibold uppercase tracking-wider text-ink ring-1 ring-slate-300 hover:bg-slate-50";

export function TaskQuote({ d, previewHref, minMarginPct = 0 }: { d: Docket; previewHref: string; minMarginPct?: number }) {
  const q = d.quote!;
  const first = d.customer.name.split(" ")[0] || d.customer.name;
  const included = q.lines.filter((l) => l.extra_status !== "offered" && l.amount > 0);
  const top = [...included].sort((a, b) => b.amount - a.amount).slice(0, 4);
  const more = included.length - top.length;
  const sheet = d.roof ? roofSheet(d.roof.summary, d.roof.m) : null;
  const src = q.measurement_source;
  const mg = q.margin ?? null;
  const low = Boolean(mg && minMarginPct > 0 && mg.pct < minMarginPct);
  const byClaude = Boolean(sheet) && (src === "plans" || src === "documents");

  return (
    <div className="mx-5 overflow-hidden rounded-[18px] bg-white ring-2 ring-ink" data-job-task data-task-quote>
      <div className="p-4 pb-3">
        <p className={kicker}>Do this now</p>
        <p className="mt-1 font-display text-[19px] font-bold leading-tight text-ink" data-task-title>Check and send {first}&rsquo;s quote</p>
        <p className="mt-0.5 font-mono text-xs leading-snug text-slate-500">{byClaude ? "Claude measured the roof from the plans and priced it from your price book." : src === "satellite" ? "Measured on the satellite map. Check it before it goes." : "Check it before it goes."}</p>
      </div>

      {/* The estimate: the roof as Claude measured it. */}
      <div className="border-t-2 border-dashed border-slate-200 px-3 py-3" style={GRID} data-task-estimate>
        <p className={`${kicker} px-1`}>{sheet ? "The roof" : "Not measured yet"}</p>
        {sheet ? <RoofDrawing labels={sheet} /> : <p className="px-1 pt-1 font-mono text-xs text-slate-500">Open Edit to measure it on the satellite map.</p>}
      </div>

      {/* The quote: a receipt torn off under the sheet. */}
      <div className="border-t-2 border-dashed border-slate-200 bg-cream px-3 pt-3" data-task-receipt>
        <div className="bg-white px-4 pb-6 pt-3.5 ring-1 ring-slate-200" style={{ clipPath: TORN }}>
          <p className={`${kicker} mb-1.5`}>The quote</p>
          {top.length ? (
            <ul className="font-mono text-[12.5px] text-slate-600">
              {top.map((l, i) => (
                <li key={i} className="flex items-start gap-2.5 py-1">
                  <ItemIcon calcKey={l.calc_key} size={16} />
                  <span className="min-w-0 flex-1 break-words pt-1">{l.description}</span>
                  <span className="shrink-0 pt-1 tabular-nums text-ink">{aud(l.amount)}</span>
                </li>
              ))}
              {more > 0 && <li className="py-1 pl-[34px] text-slate-400">+ {more} more</li>}
            </ul>
          ) : (
            <p className="font-mono text-[12.5px] text-slate-500">No prices yet. Tap Edit to price it.</p>
          )}
          {mg && (
            // Only you see this: what you make on it (ex GST), flagged when it's under your minimum.
            <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t-2 border-dashed border-slate-200 pt-2.5 font-mono text-[12.5px]" data-task-margin={low ? "low" : "ok"}>
              <span className="text-slate-500">Your margin <span className="text-slate-400">· ex GST</span>{low && <span className="block text-[11px] font-semibold text-amber-700">Under your {minMarginPct}% minimum</span>}</span>
              <span className={cx("shrink-0 font-semibold tabular-nums", low ? "text-amber-700" : "text-green-700")}>{aud(mg.profit)} · {mg.pct.toFixed(1)}%</span>
            </div>
          )}
          <div className="mt-2.5 flex items-baseline justify-between border-t-2 border-dashed border-slate-200 pt-2.5">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">Total inc GST</span>
            <span className="font-display text-xl font-bold tabular-nums text-ink" data-task-total>{aud(q.total)}</span>
          </div>
        </div>
        <div className="space-y-2 pb-3 pt-3">
          <ActionForm action={sendQuoteEmail}>
            <input type="hidden" name="estimate_id" value={q.id} />
            <SubmitButton className="min-h-12 w-full gap-2 text-[15px]"><Icon d={SEND} />Send quote to {first}</SubmitButton>
          </ActionForm>
          <div className="flex gap-2">
            <Link href={previewHref} scroll={false} className={outline} data-task-preview><Icon d={EYE} />Full preview</Link>
            <Link href={`/app/estimates/${q.id}`} className={outline} data-task-edit><Icon d={PEN} />Edit</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
