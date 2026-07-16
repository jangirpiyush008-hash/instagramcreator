-- One-time free trial claims for the SMM /services vertical.
--
-- Anti-abuse: a single physical person can only claim ONE trial ever
-- across all services and platforms. We identify them by three keys —
-- any match blocks a new claim:
--   1. IP address (hashed for privacy)
--   2. Email address (from the trial form)
--   3. Target handle (normalized — same handle across IG/TT/YT
--      counts as the same person)
--
-- Each key is a UNIQUE index so the DB itself refuses duplicates —
-- even if two concurrent requests race, only one wins.

create table if not exists service_trials (
  id uuid primary key default gen_random_uuid(),

  -- Optional linkback to the service_orders row we create for
  -- fulfillment. Trials still go through the same fulfillment flow
  -- as paid orders, just with status='paid' and total_usd=0.
  order_id uuid references service_orders(id) on delete set null,

  service_id text not null,
  target_url text not null,
  target_handle_normalized text not null,   -- lowercased handle only
  target_platform text not null,

  ip_hash text not null,                    -- sha256(ip)
  ip_country text,
  email text not null,

  quantity integer not null default 50,

  -- Free-text reason for the claim (optional). Useful for
  -- distinguishing legitimate testers from abuse patterns.
  notes text,

  claimed_at timestamptz not null default now()
);

-- Uniqueness — the anti-abuse locks. Each is a hard DB constraint.
create unique index if not exists service_trials_ip_unique
  on service_trials (ip_hash);
create unique index if not exists service_trials_email_unique
  on service_trials (lower(email));
create unique index if not exists service_trials_handle_unique
  on service_trials (target_handle_normalized);

-- Lookup helpers.
create index if not exists service_trials_claimed_at_idx
  on service_trials (claimed_at desc);

-- RLS: server-role only. No client (anon or authenticated) touches
-- this table directly — everything goes through /api/services/trial.
alter table service_trials enable row level security;

drop policy if exists service_trials_no_client on service_trials;
create policy service_trials_no_client on service_trials
  for all to authenticated, anon
  using (false) with check (false);
