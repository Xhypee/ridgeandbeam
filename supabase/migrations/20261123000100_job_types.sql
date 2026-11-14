-- New lead "What do they need?" cards: three more job types.
alter type public.job_type add value if not exists 'make_safe';
alter type public.job_type add value if not exists 'add_on';
alter type public.job_type add value if not exists 'maintenance';
