-- Measure from plans: the architect's PDF plans are kept with the job's files under a new "plans" category.
-- (The takeoff itself lives in estimates.measurements.plans and estimates.measurement_source = 'plans', both
-- existing columns: measurement_source is free text, so no constraint changes there.)

alter table public.job_files drop constraint if exists job_files_category_check;
alter table public.job_files add constraint job_files_category_check check (category in (
  'overview', 'broken_tiles', 'ridge_capping', 'sheet_damage', 'hail_dents', 'gutter_damage', 'internal_water', 'damage',
  'decking', 'progress', 'completion', 'delivery', 'document', 'other', 'test_square', 'plans'
));
