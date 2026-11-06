import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import type { Job } from "@/lib/types";

export const metadata: Metadata = { title: "Schedule" };

type Row = Job & { customers: { name: string } | null; crews: { name: string; color: string } | null };

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export default async function SchedulePage({ searchParams }: PageProps<"/app/schedule">) {
  const { supabase } = await requireOrg();
  const { week } = await searchParams;
  const parsed = typeof week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(week + "T12:00:00") : new Date();
  const start = mondayOf(parsed);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = isoDate(days[0]);
  const to = isoDate(days[6]);
  const today = isoDate(new Date());

  const [{ data: scheduled }, { data: unscheduled }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, customers(name), crews(name, color)")
      .lte("scheduled_start", to)
      .gte("scheduled_end", from)
      .order("scheduled_start"),
    supabase
      .from("jobs")
      .select("*, customers(name), crews(name, color)")
      .is("scheduled_start", null)
      .in("stage", ["sold", "scheduled"])
      .order("updated_at", { ascending: false }),
  ]);
  const jobs = (scheduled ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={`${date(from, { month: "short", day: "numeric" })} – ${date(to, { month: "short", day: "numeric", year: "numeric" })}`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/app/schedule?week=${isoDate(addDays(start, -7))}`}>← Prev</LinkButton>
            <LinkButton variant="secondary" href="/app/schedule">This week</LinkButton>
            <LinkButton variant="secondary" href={`/app/schedule?week=${isoDate(addDays(start, 7))}`}>Next →</LinkButton>
          </>
        }
      />

      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const key = isoDate(d);
          const dayJobs = jobs.filter((j) => j.scheduled_start! <= key && (j.scheduled_end ?? j.scheduled_start)! >= key);
          return (
            <div key={key} className={cx("min-h-32 rounded-xl bg-white p-2 ring-1", key === today ? "ring-2 ring-brand-500" : "ring-slate-200")}>
              <p className={cx("mb-2 text-xs font-medium", key === today ? "text-brand-600" : "text-slate-500")}>
                {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
              </p>
              <div className="space-y-1.5">
                {dayJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/app/jobs/${j.id}`}
                    className="block rounded-md border-l-4 bg-slate-50 px-2 py-1.5 text-xs hover:bg-slate-100"
                    style={{ borderColor: j.crews?.color ?? "#94a3b8" }}
                  >
                    <p className="truncate font-medium text-slate-900">{j.customers?.name}</p>
                    <p className="truncate text-slate-500">{j.title}</p>
                    <p className="truncate text-slate-400">{j.crews?.name ?? "No crew"}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card className="mt-6" title="Sold, waiting to be scheduled">
        {(unscheduled ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nothing waiting. Sold jobs without dates show up here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {((unscheduled ?? []) as Row[]).map((j) => (
              <li key={j.id}>
                <Link href={`/app/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-brand-600">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{j.customers?.name}: {j.title}</span><span className="text-xs text-slate-500">{j.site_address}</span></span>
                  <Badge tone={STAGE_TONE[j.stage]}>{STAGE_LABEL[j.stage]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
