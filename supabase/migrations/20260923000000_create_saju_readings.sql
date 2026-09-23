create table public.saju_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  chart jsonb not null,
  reading jsonb not null,
  model text not null,
  constraint saju_readings_chart_object check (jsonb_typeof(chart) = 'object'),
  constraint saju_readings_reading_object check (jsonb_typeof(reading) = 'object'),
  constraint saju_readings_chart_size check (octet_length(chart::text) <= 12000),
  constraint saju_readings_reading_size check (octet_length(reading::text) <= 30000),
  constraint saju_readings_model_length check (char_length(model) between 1 and 100)
);

create index saju_readings_user_created_idx
  on public.saju_readings (user_id, created_at desc);

alter table public.saju_readings enable row level security;

revoke all on public.saju_readings from anon, authenticated;
grant select, insert, delete on public.saju_readings to authenticated;

create policy "Users can read their own saju readings"
  on public.saju_readings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own saju readings"
  on public.saju_readings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own saju readings"
  on public.saju_readings for delete to authenticated
  using ((select auth.uid()) = user_id);
