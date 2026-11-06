import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FieldApp } from "@/components/field/field-app";
import { ServiceWorkerRegister } from "@/components/field/sw-register";
import { requireOrg } from "@/lib/dal";
import { loadFieldData } from "@/lib/field-server";
import { siteUrl } from "@/lib/format";

export const metadata: Metadata = { title: "Field" };

export default async function FieldPage({ params }: PageProps<"/app/jobs/[id]/field">) {
  const { id } = await params;
  const { supabase } = await requireOrg();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, notify_homeowner, public_token, customers(phone)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const { files, events } = await loadFieldData(supabase, job.id);
  const phone = (job.customers as unknown as { phone: string | null } | null)?.phone;
  return (
    <>
      <ServiceWorkerRegister />
      <FieldApp
        jobId={job.id}
        orgId={job.org_id}
        notifyHomeowner={job.notify_homeowner}
        hasPhone={Boolean(phone)}
        portalUrl={`${siteUrl()}/p/${job.public_token}`}
        files={files}
        events={events}
      />
    </>
  );
}
