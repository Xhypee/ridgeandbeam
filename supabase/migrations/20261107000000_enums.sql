-- New enum values must be committed before use, so they live in their own migration.
alter type public.member_role add value if not exists 'sales_rep';
alter type public.member_role add value if not exists 'crew_lead';
alter type public.payment_method add value if not exists 'online';
