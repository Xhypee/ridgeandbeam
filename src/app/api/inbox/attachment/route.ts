import { NextResponse, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/dal";
import { gmailAttachment } from "@/lib/gmail";

/**
 * /api/inbox/attachment?m=<message id>&a=<index>[&dl=1]: a file attached to an email. Files we sent are kept in
 * storage; files we received are fetched from Gmail. Images and PDFs open in the browser unless dl=1.
 */
export async function GET(req: NextRequest) {
  const { supabase, org, isCrewLead } = await requireOrg();
  if (isCrewLead) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("m") ?? "";
  const i = Number(req.nextUrl.searchParams.get("a"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(i) || i < 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { data: m } = await supabase.from("messages").select("provider_ref, attachments").eq("id", id).eq("org_id", org.id).maybeSingle();
  const a = (m?.attachments as { name: string; mime?: string | null; id?: string | null; path?: string | null }[] | null)?.[i];
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = req.nextUrl.searchParams.get("dl") === "1";
  if (a.path?.startsWith(`${org.id}/`)) {
    const { data } = await supabase.storage.from("job-files").createSignedUrl(a.path, 300, download ? { download: a.name } : undefined);
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl);
  }
  if (!m?.provider_ref?.startsWith("gmail:") || !a.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await gmailAttachment(org.id, m.provider_ref.slice(6), a.id);
  if (!file) return NextResponse.json({ error: "Couldn't get the file from Gmail. Check Gmail is still connected." }, { status: 502 });
  const name = a.name.replace(/["\r\n]/g, "").slice(0, 200) || "attachment";
  const inline = !download && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(a.mime ?? "");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": inline ? a.mime! : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
