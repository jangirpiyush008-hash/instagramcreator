-- Primitive-level cache for the DataAdapter's underlying API calls.
-- Distinct from the `scans` table (which caches whole tool RESULTS): this
-- table caches raw provider payloads keyed by primitive (profile / posts /
-- comments / thumbnail / followers / availability). Tools then compose
-- from these primitives, so hitting two tools for the same handle only
-- pays for the API call ONCE.
--
-- Server-only — accessed via the service role. No client policies.

create table data_cache (
  cache_key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index data_cache_expires_idx on data_cache (expires_at);

alter table data_cache enable row level security;
-- No policies = clients locked out; the scan API uses service role.

-- Housekeeping: clear expired rows periodically so the table doesn't grow
-- forever. Cheap since expires_at is indexed.
create or replace function prune_data_cache() returns void
language sql
as $$
  delete from data_cache where expires_at < now();
$$;
