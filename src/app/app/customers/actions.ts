"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { friendly, oneOf, str } from "@/lib/form";
import { CUSTOMER_SOURCES } from "@/lib/types";
import type { ActionResult } from "@/components/action-form";

function fields(fd: FormData) {
  return {
    name: str(fd, "name") ?? "",
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    address: str(fd, "address"),
    city: str(fd, "city"),
    state: str(fd, "state"),
    zip: str(fd, "zip"),
    source: oneOf(fd, "source", CUSTOMER_SOURCES, "other"),
    insurance_company: str(fd, "insurance_company"),
    claim_number: str(fd, "claim_number"),
    adjuster_name: str(fd, "adjuster_name"),
    adjuster_phone: str(fd, "adjuster_phone"),
    notes: str(fd, "notes"),
    follow_up_on: str(fd, "follow_up_on"),
  };
}

export async function createCustomer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  const f = fields(fd);
  if (!f.name) return { error: "Name is required." };
  const { data, error } = await supabase.from("customers").insert({ ...f, org_id: org.id, created_by: user.id }).select("id").single();
  if (error) return { error: friendly(error) };

  // Optionally open a job right away (the common "new lead" flow).
  if (fd.get("create_job") === "on") {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        org_id: org.id,
        customer_id: data.id,
        title: str(fd, "job_title") ?? "Roof inspection",
        site_address: [f.address, f.city, f.state, f.zip].filter(Boolean).join(", ") || null,
        is_insurance: Boolean(f.insurance_company || f.claim_number),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (jobErr) return { error: friendly(jobErr) };
    revalidatePath("/app", "layout");
    redirect(`/app/jobs/${job.id}`);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/customers/${data.id}`);
}

export async function updateCustomer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const f = fields(fd);
  if (!f.name) return { error: "Name is required." };
  const { error } = await supabase.from("customers").update(f).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

export async function deleteCustomer(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("customers").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect("/app/customers");
}
