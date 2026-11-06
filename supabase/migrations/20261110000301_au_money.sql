-- AU money & insurance (builder M). Additive: new columns, widened checks, replaced functions/views.
-- Australian home insurance claims (excess, settlement path, assessor, make-safe, Code of Practice dates),
-- ATO tax invoices (GST-inclusive amounts, buyer identity), bank transfer / PayID / BECS settings,
-- contractor ABNs for TPAR, Xero integration.

-- ---------------------------------------------------------------------------
-- Claims: Australian model (the job-level claim object stays; US columns are kept for history)
-- ---------------------------------------------------------------------------
alter table public.claims
  add column if not exists lodged_on date,
  add column if not exists event_type text check (event_type in ('hail', 'storm', 'cyclone', 'flood', 'fire', 'other')),
  -- ICA catastrophe declaration: none / declared / extraordinary (extends decision timeframes)
  add column if not exists catastrophe text not null default 'none' check (catastrophe in ('none', 'declared', 'extraordinary')),
  add column if not exists catastrophe_name text,
  add column if not exists excess numeric(12,2) not null default 0,
  add column if not exists sum_insured numeric(12,2),
  add column if not exists settlement_path text not null default 'undecided'
    check (settlement_path in ('undecided', 'insurer_managed', 'own_builder', 'cash_settlement')),
  add column if not exists panel_builder_name text,
  add column if not exists panel_builder_contact text,
  add column if not exists panel_job_ref text,
  add column if not exists scope_received_on date,
  add column if not exists approved_amount numeric(12,2) not null default 0,
  add column if not exists cash_settlement_amount numeric(12,2) not null default 0,
  add column if not exists cash_settlement_offered_on date,
  add column if not exists make_safe_done_on date,
  add column if not exists make_safe_authorised_by text check (make_safe_authorised_by in ('insurer', 'homeowner', 'panel_builder', 'roofer')),
  add column if not exists make_safe_payer text check (make_safe_payer in ('insurer', 'homeowner', 'panel_builder')),
  add column if not exists make_safe_amount numeric(12,2) not null default 0,
  add column if not exists make_safe_notes text,
  add column if not exists info_complete_on date,
  add column if not exists last_insurer_update_on date,
  add column if not exists decision_on date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'claims_au_amounts_nonneg') then
    alter table public.claims add constraint claims_au_amounts_nonneg check (
      excess >= 0 and approved_amount >= 0 and cash_settlement_amount >= 0 and make_safe_amount >= 0 and coalesce(sum_insured, 0) >= 0);
  end if;
end $$;

-- Existing claims: carry the US numbers/stages over to their AU equivalents.
update public.claims set excess = deductible where excess = 0 and deductible > 0;
update public.claims set stage = case stage::text
    when 'contingency_signed' then 'lodged'
    when 'claim_filed' then 'lodged'
    when 'adjuster_scheduled' then 'assessor_booked'
    when 'adjuster_met' then 'assessed'
    when 'supplementing' then 'scope_received'
    when 'coc_sent' then 'invoiced'
    when 'depreciation_released' then 'paid'
    when 'denied' then 'declined'
    else stage::text end::public.claim_stage
  where stage::text in ('contingency_signed', 'claim_filed', 'adjuster_scheduled', 'adjuster_met', 'supplementing', 'coc_sent', 'depreciation_released', 'denied');
update public.claims set policy_type = case policy_type::text when 'rcv' then 'replacement' when 'acv' then 'indemnity' else 'unknown' end::public.policy_type
  where policy_type::text in ('rcv', 'acv', 'roof_schedule');
update public.claims set lodged_on = created_at::date where lodged_on is null;

alter table public.claims alter column stage set default 'lodged';
alter table public.claims alter column lodged_on set default current_date;

-- ---------------------------------------------------------------------------
-- Claim ledger: AU payers (insurer, homeowner, insurer's panel builder) and kinds
-- ---------------------------------------------------------------------------
alter table public.claim_checks drop constraint if exists claim_checks_kind_check;
alter table public.claim_checks add constraint claim_checks_kind_check check (kind in (
  'scope', 'excess', 'variation', 'make_safe', 'balance', 'cash_settlement', 'other',
  'acv', 'depreciation', 'supplement', 'deductible'));            -- legacy US kinds kept for history
alter table public.claim_checks drop constraint if exists claim_checks_payer_check;
alter table public.claim_checks add constraint claim_checks_payer_check check (payer in ('carrier', 'homeowner', 'panel_builder', 'mortgagee'));

-- Approved variation requests (the "supplements" rounds) add one expected payment, from whoever pays us
-- on this settlement path: panel builder (insurer-managed via a panel builder), homeowner (cash settlement),
-- otherwise the insurer. No mortgagee endorsement in Australia.
create or replace function public.claim_payer_for(p_claim uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when c.settlement_path = 'cash_settlement' then 'homeowner'
    when c.settlement_path = 'insurer_managed' and nullif(trim(coalesce(c.panel_builder_name, '')), '') is not null then 'panel_builder'
    else 'carrier' end
  from claims c where c.id = p_claim;
$$;
revoke all on function public.claim_payer_for(uuid) from public, anon;

create or replace function public.sync_supplement_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_check claim_checks;
begin
  select * into v_check from claim_checks where supplement_id = new.id;
  if new.status in ('approved', 'partial') and new.approved_amount > 0 then
    if v_check.id is null then
      insert into claim_checks (org_id, claim_id, kind, payer, label, expected_amount, endorsement, supplement_id)
      values (new.org_id, new.claim_id, 'variation', coalesce(public.claim_payer_for(new.claim_id), 'carrier'),
              'Variation request ' || new.round, new.approved_amount, 'not_required', new.id);
    elsif v_check.expected_amount is distinct from new.approved_amount then
      update claim_checks set expected_amount = new.approved_amount where id = v_check.id;
    end if;
  elsif v_check.id is not null then
    if coalesce(v_check.received_amount, 0) = 0 then
      delete from claim_checks where id = v_check.id;
    else
      update claim_checks set expected_amount = 0 where id = v_check.id;
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Claim paperwork: Australian checklist
-- ---------------------------------------------------------------------------
alter table public.claim_documents drop constraint if exists claim_documents_doc_type_check;
alter table public.claim_documents add constraint claim_documents_doc_type_check check (doc_type in (
  'insurer_scope', 'work_order', 'contract', 'make_safe_report', 'storm_evidence', 'photos', 'licence_insurance',
  'hwi_certificate', 'completion_certificate', 'tax_invoice', 'other',
  'w9', 'scope', 'coc', 'final_invoice', 'lien_waiver', 'license_coi', 'endorsed_check'));   -- legacy US types

create or replace function public.seed_claim_documents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into claim_documents (org_id, claim_id, doc_type)
  select new.org_id, new.id, d from unnest(array['insurer_scope', 'work_order', 'make_safe_report', 'storm_evidence', 'photos',
    'licence_insurance', 'hwi_certificate', 'completion_certificate', 'tax_invoice']) d
  on conflict do nothing;
  return new;
end $$;
insert into public.claim_documents (org_id, claim_id, doc_type)
select c.org_id, c.id, d from public.claims c, unnest(array['insurer_scope', 'work_order', 'make_safe_report', 'storm_evidence', 'photos',
  'licence_insurance', 'hwi_certificate', 'completion_certificate', 'tax_invoice']) d
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Invoices: ATO tax invoices. Amounts are GST-inclusive (ACL single price); buyer identity for >= $1,000.
-- Existing rows keep the old "tax on top" maths; new invoices default to GST-inclusive.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists amounts_include_gst boolean not null default false,
  add column if not exists buyer_name text,
  add column if not exists buyer_abn text,
  add column if not exists buyer_address text;
alter table public.invoices alter column amounts_include_gst set default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_buyer_abn_format') then
    alter table public.invoices add constraint invoices_buyer_abn_format check (buyer_abn is null or buyer_abn ~ '^[0-9]{11}$');
  end if;
end $$;

alter table public.invoices drop constraint if exists invoices_bill_to_check;
alter table public.invoices add constraint invoices_bill_to_check check (bill_to in ('homeowner', 'carrier', 'panel_builder', 'other', 'mortgagee'));

-- Same columns as before; GST-inclusive invoices: total = lines - discount, GST = total x rate / (100 + rate).
create or replace view public.invoice_totals with (security_invoker = true) as
with sums as (
  select v.id, v.org_id, v.discount, v.tax_rate, v.amounts_include_gst,
    coalesce((select sum(round(i.quantity * i.unit_price, 2)) from public.invoice_items i where i.invoice_id = v.id), 0) as subtotal,
    coalesce((select sum(p.amount) from public.payments p where p.invoice_id = v.id), 0) as paid
  from public.invoices v
), t as (
  select s.*, case when s.amounts_include_gst
      then greatest(s.subtotal - s.discount, 0)
      else round(greatest(s.subtotal - s.discount, 0) * (1 + s.tax_rate / 100), 2) end as total_amt
  from sums s
)
select id as invoice_id, org_id, subtotal,
  case when amounts_include_gst then round(total_amt * tax_rate / (100 + tax_rate), 2)
       else round(greatest(subtotal - discount, 0) * tax_rate / 100, 2) end as tax,
  total_amt as total,
  paid,
  total_amt - paid as balance
from t;
grant select on public.invoice_totals to authenticated;

-- ---------------------------------------------------------------------------
-- Organisation payment settings: bank transfer, PayID, BECS Direct Debit.
-- Card surcharging is switched off: the RBA's 2026 conclusions remove surcharges on eftpos, Mastercard
-- and Visa from 1 October 2026.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists bank_account_name text,
  add column if not exists bank_bsb text,
  add column if not exists bank_account_number text,
  add column if not exists payid text,
  add column if not exists payid_type text check (payid_type in ('email', 'phone', 'abn')),
  add column if not exists becs_enabled boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_bank_format') then
    alter table public.organizations add constraint organizations_bank_format check (
      (bank_bsb is null or bank_bsb ~ '^[0-9]{6}$') and (bank_account_number is null or bank_account_number ~ '^[0-9]{5,10}$'));
  end if;
end $$;
update public.organizations set pass_card_fee = false where pass_card_fee;
alter table public.organizations alter column card_fee_pct set default 1.75;

-- ---------------------------------------------------------------------------
-- Crews (contractors): ABN + GST registration for the Taxable payments annual report (TPAR)
-- ---------------------------------------------------------------------------
alter table public.crews
  add column if not exists abn text,
  add column if not exists gst_registered boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crews_abn_format') then
    alter table public.crews add constraint crews_abn_format check (abn is null or abn ~ '^[0-9]{11}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Integrations: Xero (QuickBooks rows stay for history)
-- ---------------------------------------------------------------------------
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in ('xero', 'quickbooks'));
alter table public.integrations
  add column if not exists external_name text,
  add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.job_costs drop constraint if exists job_costs_source_check;
alter table public.job_costs add constraint job_costs_source_check check (source in ('manual', 'order', 'return', 'crew_pay', 'financing', 'quickbooks', 'xero'));

-- ---------------------------------------------------------------------------
-- Public tax invoice + how to pay (anonymous, by unguessable token). No secrets.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_tax_invoice(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'number', v.number, 'status', v.status, 'kind', v.kind, 'milestone_label', v.milestone_label,
    'issue_date', v.issue_date, 'due_date', v.due_date, 'notes', v.notes, 'terms', v.terms,
    'tax_rate', v.tax_rate, 'discount', v.discount, 'amounts_include_gst', v.amounts_include_gst, 'bill_to', v.bill_to,
    'buyer', jsonb_build_object(
      'name', coalesce(nullif(trim(coalesce(v.buyer_name, '')), ''), c.name),
      'abn', v.buyer_abn,
      'address', coalesce(nullif(trim(coalesce(v.buyer_address, '')), ''), nullif(concat_ws(', ', nullif(c.address, ''), nullif(c.city, ''), nullif(concat_ws(' ', nullif(c.state, ''), nullif(c.zip, '')), '')), '')),
      'email', c.email, 'phone', c.phone),
    'totals', jsonb_build_object('subtotal', t.subtotal, 'gst', t.tax, 'total', t.total, 'paid', t.paid, 'balance', t.balance),
    'seller', jsonb_build_object('name', o.name, 'abn', o.abn, 'gst_registered', o.gst_registered, 'phone', o.phone, 'email', o.email,
      'address', o.address, 'licences', o.licences),
    'pay', jsonb_build_object(
      'bank_account_name', o.bank_account_name, 'bank_bsb', o.bank_bsb, 'bank_account_number', o.bank_account_number,
      'payid', o.payid, 'payid_type', o.payid_type, 'becs_enabled', o.becs_enabled,
      'card_fee_pct', o.card_fee_pct,
      'online_ready', (o.stripe_account_id is not null and o.stripe_charges_enabled),
      'financing', jsonb_build_object('enabled', coalesce((o.financing->>'enabled')::boolean, false),
        'lenders', coalesce(o.financing->'lenders', '[]'::jsonb))),
    'job', jsonb_build_object('title', j.title, 'site_address', j.site_address, 'is_insurance', j.is_insurance, 'state', j.state),
    'claim', (select jsonb_build_object('insurer', cl.carrier, 'claim_number', cl.claim_number, 'settlement_path', cl.settlement_path,
                'excess', cl.excess, 'stage', cl.stage) from claims cl where cl.job_id = j.id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit, 'unit_price', i.unit_price) order by i.position)
                       from invoice_items i where i.invoice_id = v.id), '[]'::jsonb)
  )
  from invoices v join invoice_totals t on t.invoice_id = v.id join jobs j on j.id = v.job_id
    join customers c on c.id = j.customer_id join organizations o on o.id = v.org_id
  where v.public_token = p_token and v.status not in ('draft', 'void');
$$;
revoke all on function public.get_public_tax_invoice(text) from public;
grant execute on function public.get_public_tax_invoice(text) to anon, authenticated;

notify pgrst, 'reload schema';
