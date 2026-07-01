-- Profile snapshot table for the live-counter tool. Every getProfile() call
-- writes one row. live-counter reads the recent history to compute honest
-- growth deltas.
--
-- Server-only (no client policies) — clients read snapshots via the scan API,
-- which mediates access.

create table profile_snapshots (
  id bigserial primary key,
  platform text not null,
  handle text not null,
  followers integer not null,
  following integer,
  taken_at timestamptz not null default now()
);

create index profile_snapshots_lookup_idx
  on profile_snapshots (platform, handle, taken_at desc);

alter table profile_snapshots enable row level security;
-- No policies = clients locked out; scan API uses service role.

-- Housekeeping: keep 30 days of snapshots (older data isn't needed for the
-- live-counter trend and would just bloat the table over time).
create or replace function prune_profile_snapshots() returns void
language sql
as $$
  delete from profile_snapshots where taken_at < now() - interval '30 days';
$$;
