import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { siteUrl } from "@/lib/format";
import { smsConfigured } from "@/lib/notify";
import { aiEnabled } from "@/lib/ai";
import { regenerateIntakeKey, saveInstantQuote, saveResponder } from "./actions";
import { CodeSnippet } from "./code-snippet";

export const metadata: Metadata = { title: "Lead intake" };

export default async function LeadIntakePage() {
  const { org, isAdmin, supabase } = await requireOrg();
  const base = siteUrl();
  const key = org.intake_key;
  const endpoint = `${base}/api/leads/${key}`;
  const formUrl = `${base}/l/${key}`;
  const quoteUrl = `${base}/quote/${key}`;
  const iq = org.instant_quote;
  const { data: reps } = await supabase.from("memberships").select("user_id, full_name, email, role, phone").eq("org_id", org.id).in("role", ["sales_rep", "owner"]);
  const salesReps = (reps ?? []).filter((r) => r.role === "sales_rep");
  const routeTo = salesReps.length ? salesReps : (reps ?? []).filter((r) => r.role === "owner");
  const ai = aiEnabled();
  const sms = smsConfigured();

  const iframeForm = `<iframe src="${formUrl}?source=website" title="Request a roof inspection" style="width:100%;max-width:480px;height:760px;border:0"></iframe>`;
  const iframeQuote = `<iframe src="${quoteUrl}" title="Instant roof quote" style="width:100%;max-width:560px;height:820px;border:0"></iframe>`;
  const curl = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Homeowner","phone":"0412 345 678","email":"jane@example.com",
       "address":"42 Banksia St","suburb":"Penrith","state":"NSW","postcode":"2750",
       "message":"Hail last night, possible leak","source":"hipages"}'`;

  return (
    <div className="min-w-0 space-y-6">
      <Card title="How leads get in">
        <p className="text-sm text-slate-600">
          Every lead from your website, instant quote, Zapier, hipages, Oneflare or Facebook lead ads lands on the <b>Jobs</b> board as a new lead with a timer,
          is assigned round-robin to a sales rep, and that rep gets a text and an email right away.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="text-xs font-medium text-slate-500">Lead intake URL (POST, JSON or form)</dt><dd className="break-all font-mono text-slate-800">{endpoint}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Hosted lead form</dt><dd className="break-all"><a className="font-mono text-brand-600 hover:underline" href={formUrl} target="_blank">{formUrl}</a></dd></div>
          <div><dt className="text-xs font-medium text-slate-500">New leads go to</dt><dd className="text-slate-800">{routeTo.length ? routeTo.map((r) => r.full_name || r.email).join(", ") : "—"} {salesReps.length > 1 && <span className="text-slate-500">(taking turns)</span>}</dd>
            {routeTo.some((r) => !r.phone) && <p className="mt-1 text-xs text-amber-700">Add a mobile number for {routeTo.filter((r) => !r.phone).map((r) => r.full_name || r.email).join(", ")} in Team settings so they get lead texts.</p>}
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Embed the lead form on your website">
          <p className="mb-3 text-sm text-slate-600">Paste this where you want the form. It works on Wix, Squarespace, WordPress and plain HTML.</p>
          <CodeSnippet code={iframeForm} label="Copy embed code" />
        </Card>
        <Card title="Embed the instant quote">
          <p className="mb-3 text-sm text-slate-600">Homeowners get a price range from your settings below, then become a lead.</p>
          <CodeSnippet code={iframeQuote} label="Copy embed code" />
        </Card>
      </div>

      <Card title="Webhooks (Zapier, hipages, Facebook lead ads)">
        <p className="mb-3 text-sm text-slate-600">
          In Zapier, use <b>Webhooks by Zapier → POST</b> to the intake URL. Send <code>name</code> (or <code>first_name</code> + <code>last_name</code>), <code>phone</code> and/or <code>email</code>,
          plus optional <code>address</code>, <code>suburb</code>, <code>state</code> (NSW, VIC…), <code>postcode</code>, <code>message</code> and <code>source</code> (e.g. <code>hipages</code>, <code>facebook</code>, <code>google_ads</code>) so the Lead sources report can track cost per job.
        </p>
        <CodeSnippet code={curl} label="Copy curl example" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Instant quote">
          <ActionForm action={saveInstantQuote} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="enabled" defaultChecked={iq.enabled} disabled={!isAdmin} className="h-5 w-5 accent-brand-500" /> Show the instant quote widget
            </label>
            <p className="text-sm text-slate-600">
              Homeowners pick metal or tile, draw their roof on the map and see a price range per m², GST inclusive — never a firm price.
              Set the $/m² rates in <a href="/app/settings/price-book" className="font-medium text-brand-600 underline">Price book → Instant quote rates</a>.
            </p>
            {isAdmin && <SubmitButton variant="secondary">Save instant quote</SubmitButton>}
          </ActionForm>
        </Card>

        <Card title="Instant responder" actions={ai && sms ? <Badge tone="green">Ready</Badge> : <Badge>Not configured</Badge>}>
          <p className="text-sm text-slate-600">
            When a web lead comes in, Claude drafts a short text thanking the homeowner and offering the next inspection times, and sends it from your business number.
            Every message is logged on the job.
          </p>
          {!(ai && sms) && (
            <p className="mt-2 text-xs text-slate-500">Needs {[!ai && "an Anthropic API key (ANTHROPIC_API_KEY)", !sms && "Twilio texting (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)"].filter(Boolean).join(" and ")}. Until then reps still get their lead texts.</p>
          )}
          <ActionForm action={saveResponder} className="mt-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="ai_responder_enabled" defaultChecked={(org as unknown as { ai_responder_enabled?: boolean }).ai_responder_enabled ?? true} disabled={!isAdmin} className="h-5 w-5 accent-brand-500" /> Text new web leads automatically
            </label>
            {isAdmin && <div className="mt-3"><SubmitButton variant="secondary">Save</SubmitButton></div>}
          </ActionForm>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <b>AI phone receptionist:</b> answering calls needs a telephony provider and isn&apos;t included yet. For now, forward missed calls to your web form or rely on the instant responder above for web leads.
          </p>
        </Card>
      </div>

      {isAdmin && (
        <Card title="Regenerate key">
          <p className="mb-3 text-sm text-slate-600">If spam is getting through or a key leaked, make a new one. Old form, quote and webhook URLs stop working immediately.</p>
          <ActionForm action={regenerateIntakeKey}>
            <SubmitButton variant="danger" confirm="Make a new intake key? Your website form and Zapier must be updated.">Regenerate key</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
