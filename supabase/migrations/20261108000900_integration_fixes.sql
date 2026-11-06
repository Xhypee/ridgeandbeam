-- Coordinator integration fixes after merging the feature workstreams.

-- PostgREST cannot infer a relationship from invoices to the CTE-based invoice_totals view
-- (PGRST200). A computed relationship function makes `invoices?select=*,invoice_totals(*)` work again.
create or replace function public.invoice_totals(public.invoices)
returns setof public.invoice_totals
language sql stable rows 1 as $$
  select * from public.invoice_totals where invoice_id = $1.id
$$;

notify pgrst, 'reload schema';
