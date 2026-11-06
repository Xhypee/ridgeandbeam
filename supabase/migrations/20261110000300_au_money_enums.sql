-- AU money & insurance (builder M): new enum values. They must be committed before use,
-- so they live in their own migration (the main AU money migration follows).

-- Australian claim stages (legacy US values stay in the type but are no longer used by the app).
alter type public.claim_stage add value if not exists 'lodged';
alter type public.claim_stage add value if not exists 'assessor_booked';
alter type public.claim_stage add value if not exists 'assessed';
alter type public.claim_stage add value if not exists 'declined';
alter type public.claim_stage add value if not exists 'cash_settlement_offered';
alter type public.claim_stage add value if not exists 'work_authorised';
alter type public.claim_stage add value if not exists 'invoiced';
alter type public.claim_stage add value if not exists 'paid';

-- Australian home policy cover types (new-for-old / replacement vs indemnity).
alter type public.policy_type add value if not exists 'replacement';
alter type public.policy_type add value if not exists 'indemnity';

-- Australian payment methods.
alter type public.payment_method add value if not exists 'bank_transfer';
alter type public.payment_method add value if not exists 'payid';
alter type public.payment_method add value if not exists 'becs';
