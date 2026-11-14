import { redirect } from "next/navigation";

// Customers is now Contacts (customers, builders, suppliers, contractors, others). Old links keep working.
export default async function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  const sp = await searchParams;
  const out = new URLSearchParams();
  if (typeof sp.q === "string" && sp.q) out.set("q", sp.q);
  if (typeof sp.customer === "string") out.set("contact", sp.customer);
  else if (sp.new === "1") out.set("new", "1");
  redirect(`/app/contacts${out.size ? `?${out}` : ""}`);
}
