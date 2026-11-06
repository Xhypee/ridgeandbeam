import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import type { LatLng } from "@/lib/geo";
import { SatelliteMeasure, type Facet } from "./satellite-measure";

export const metadata: Metadata = { title: "Satellite measure" };

export default async function MeasurePage({ params }: PageProps<"/app/measure/[estimateId]">) {
  const { estimateId } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const { data: est } = await supabase
    .from("estimates")
    .select("id, number, status, measurements, jobs(id, title, site_address, lat, lng, customers(name, address, city, state, zip))")
    .eq("id", estimateId)
    .maybeSingle();
  if (!est) notFound();
  const job = est.jobs as unknown as { id: string; title: string; site_address: string | null; lat: number | null; lng: number | null; customers: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } };
  const cust = job.customers;
  const address = job.site_address || [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");
  const m = (est.measurements ?? {}) as { satellite?: { facets?: Facet[]; center?: LatLng; zoom?: number } };
  const saved = m.satellite?.facets?.map((f, i) => ({ ...f, id: `f${i}` })) ?? [];
  const known: LatLng | null = m.satellite?.center ?? (job.lat != null && job.lng != null ? [job.lat, job.lng] : org.lat != null && org.lng != null ? [org.lat, org.lng] : null);

  return (
    <>
      <PageHeader
        title="Measure on satellite map"
        subtitle={<>{cust.name} · Estimate #{est.number}{address ? ` · ${address}` : ""}</>}
        actions={<LinkButton variant="secondary" href={`/app/estimates/${est.id}`}>Back to estimate</LinkButton>}
      />
      <SatelliteMeasure estimateId={est.id} address={address} initialCenter={known} initialZoom={m.satellite?.zoom} initialFacets={saved} locked={est.status === "accepted"} />
    </>
  );
}
