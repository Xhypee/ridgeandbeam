-- Building stage: each supplier's invoice against its material order (read in, checked against the order, paid),
-- and the supplier's bank details remembered for next time.

alter table public.material_orders
  add column if not exists invoice_no text check (invoice_no is null or length(invoice_no) <= 60),
  add column if not exists invoice_date date,
  add column if not exists invoice_ex numeric(12,2) check (invoice_ex is null or invoice_ex >= 0),
  add column if not exists invoice_gst numeric(12,2) check (invoice_gst is null or invoice_gst >= 0),
  add column if not exists invoice_due date,
  add column if not exists invoice_abn text check (invoice_abn is null or length(invoice_abn) <= 20),
  add column if not exists invoice_file_id uuid references public.job_files(id) on delete set null,
  add column if not exists invoice_source text check (invoice_source is null or invoice_source in ('gmail', 'upload')),
  add column if not exists bank_name text check (bank_name is null or length(bank_name) <= 120),
  add column if not exists bank_bsb text check (bank_bsb is null or length(bank_bsb) <= 10),
  add column if not exists bank_account text check (bank_account is null or length(bank_account) <= 20),
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists paid_by_name text;

alter table public.org_suppliers
  add column if not exists abn text check (abn is null or length(abn) <= 20),
  add column if not exists bank_name text check (bank_name is null or length(bank_name) <= 120),
  add column if not exists bank_bsb text check (bank_bsb is null or length(bank_bsb) <= 10),
  add column if not exists bank_account text check (bank_account is null or length(bank_account) <= 20);

-- Supplier invoices are filed with the job's documents.
alter table public.job_files drop constraint if exists job_files_category_check;
alter table public.job_files add constraint job_files_category_check check (category = any (array[
  'overview', 'broken_tiles', 'ridge_capping', 'sheet_damage', 'hail_dents', 'gutter_damage', 'internal_water', 'damage',
  'decking', 'progress', 'completion', 'delivery', 'document', 'other', 'test_square', 'plans', 'supplier_invoice']));
