"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/dal";

export async function markAllRead() {
  const { supabase, org } = await requireOrg();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("org_id", org.id).is("read_at", null);
  revalidatePath("/app", "layout");
}
