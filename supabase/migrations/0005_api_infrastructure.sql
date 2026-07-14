-- Public API infrastructure: keys, per-call usage log, watchlist for the
-- monitoring use case.
--
-- All three tables are server-only via the service role — the /v1/* routes
-- are the only writers. Users get read access to their OWN rows through RLS
-- so the /account dashboard can render usage + watchlist without a special
-- endpoint.

-- API keys — one row per key. Users can hold multiple (rotate old, current, sandbox).
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default',           -- human label ("Production", "Staging")
  key_hash text not null unique,                  -- sha256 of the raw key; we never store raw
  key_prefix text not null,                       -- first 12 chars, safe to show ("sk_live_ab12cd34")
  tier text not null default 'starter',           -- 'starter' | 'pro' | 'scale' | 'enterprise'
  credits_remaining integer not null default 100, -- monthly bucket; refills on subscription anniversary
  credits_included integer not null default 100,  -- the tier's monthly allowance
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index api_keys_user_idx on api_keys (user_id);
create index api_keys_hash_idx on api_keys (key_hash) where revoked_at is null;
alter table api_keys enable row level security;
create policy "own keys read"  on api_keys for select using (auth.uid() = user_id);

-- Per-request usage log. High-write table so we keep the row narrow.
create table api_usage (
  id bigserial primary key,
  key_id uuid not null references api_keys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,                         -- e.g. "v1.scan.engagement-rate"
  platform text,                                  -- 'instagram' | 'tiktok' | 'youtube' | null (for tool-agnostic endpoints)
  handle text,
  credits_charged integer not null,
  response_code integer not null,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index api_usage_key_time_idx on api_usage (key_id, created_at desc);
create index api_usage_user_time_idx on api_usage (user_id, created_at desc);
alter table api_usage enable row level security;
create policy "own usage read" on api_usage for select using (auth.uid() = user_id);

-- Watchlist — accounts a user's API integration wants monitored over time.
-- profile_snapshots (already exists) becomes the historical store; watchlist
-- is the "which accounts should we keep fetching?" list.
create table api_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,                         -- 'instagram' | 'tiktok' | 'youtube'
  handle text not null,
  label text,                                     -- optional display name from the client
  created_at timestamptz not null default now(),
  unique (user_id, platform, handle)              -- can't add the same handle twice
);
create index api_watchlist_user_idx on api_watchlist (user_id);
alter table api_watchlist enable row level security;
create policy "own watchlist read"   on api_watchlist for select using (auth.uid() = user_id);
create policy "own watchlist insert" on api_watchlist for insert with check (auth.uid() = user_id);
create policy "own watchlist delete" on api_watchlist for delete using (auth.uid() = user_id);

-- Helper: atomic credit deduction. Prevents the race where two concurrent
-- API calls both see credits_remaining=1, both proceed, and one call goes
-- into the negative. Returns the NEW balance (or null if insufficient).
create or replace function deduct_credits(p_key_id uuid, p_amount integer)
returns integer
language plpgsql
as $$
declare
  new_balance integer;
begin
  update api_keys
    set credits_remaining = credits_remaining - p_amount,
        last_used_at = now()
    where id = p_key_id
      and credits_remaining >= p_amount
      and revoked_at is null
    returning credits_remaining into new_balance;
  return new_balance; -- null when insufficient credits or key revoked
end$$;
