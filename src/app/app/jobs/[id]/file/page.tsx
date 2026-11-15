// The job file page (see job-file-view). ?r= filters by job record line; ?print=1 is the printable version.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { loadJobFile } from "@/lib/job-file-server";
import type { RecordKey } from "@/lib/job-record";
import { FILE_ORDER, JobFileView } from "./job-file-view";

export const metadata: Metadata = { title: "Job file" };

export default async function JobFilePage({ params, searchParams }: PageProps<"/app/jobs/[id]/file">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, canSeeMoney } = await requireOrg();
  const f = await loadJobFile(supabase, id, { canSeeMoney });
  if (!f) notFound();
  const r = typeof sp.r === "string" && (FILE_ORDER as string[]).includes(sp.r) ? (sp.r as RecordKey) : null;
  return <JobFileView f={f} r={r} print={sp.print === "1"} base={`/app/jobs/${id}/file`} />;
}
