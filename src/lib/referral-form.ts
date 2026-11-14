// "Referred by" from a form (New lead, the job sidebar's Contact → Edit): an existing contact or supplier, or a
// new contact typed into the lookup ("+ Add … as a new contact"), which is created here first. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";

const KINDS = ["customer", "builder", "contractor", "other"] as const;

export type ReferralFields = { referred_by: string; referred_by_type: "contact" | "supplier" };

/** null = nothing picked (clear it); { error } = couldn't add the new contact. */
export async function referralFromForm(
  supabase: SupabaseClient, orgId: string, userId: string, fd: FormData, customerId?: string | null,
): Promise<ReferralFields | null | { error: string }> {
  const newName = String(fd.get("referred_by_new") ?? "").trim().slice(0, 120);
  if (newName) {
    const k = String(fd.get("referred_by_kind") ?? "other");
    const kind = (KINDS as readonly string[]).includes(k) ? k : "other";
    const { data, error } = await supabase.from("customers")
      .insert({ org_id: orgId, name: newName, kind, source: "other", created_by: userId }).select("id").single();
    if (error || !data) return { error: "Couldn't add the referrer to Contacts." };
    return { referred_by: data.id, referred_by_type: "contact" };
  }
  const id = String(fd.get("referred_by") ?? "").trim();
  const type = fd.get("referred_by_type") === "supplier" ? "supplier" : "contact";
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || (type === "contact" && id === customerId)) return null;
  return { referred_by: id, referred_by_type: type };
}
