-- Run this in Supabase SQL Editor

create table if not exists public.dubai_scans (
    imei text primary key,
    created_at timestamptz not null default now()
);

alter table public.dubai_scans enable row level security;

drop policy if exists "Allow public read of dubai scans"
on public.dubai_scans;

drop policy if exists "Allow public insert of dubai scans"
on public.dubai_scans;

create policy "Allow public read of dubai scans"
on public.dubai_scans
for select
to anon
using (true);

create policy "Allow public insert of dubai scans"
on public.dubai_scans
for insert
to anon
with check (true);

alter publication supabase_realtime
add table public.dubai_scans;
