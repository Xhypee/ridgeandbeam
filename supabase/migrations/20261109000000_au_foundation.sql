-- Australia: business identity, GST and per-state licences. Ridge & Beam is Australia-only.

alter table public.organizations
  add column abn text,
  add column gst_registered boolean not null default true,
  add column prices_include_gst boolean not null default true,
  add column country text not null default 'AU' check (country = 'AU'),
  -- { "NSW": { "number": "123456C", "classes": ["Roof plumbing"] }, "QLD": {...} }
  add column licences jsonb not null default '{}'::jsonb,
  add column service_states text[] not null default '{}';

alter table public.organizations alter column tax_rate set default 10;
update public.organizations set tax_rate = 10 where tax_rate = 0;

alter table public.organizations add constraint organizations_abn_format check (abn is null or abn ~ '^[0-9]{11}$');
