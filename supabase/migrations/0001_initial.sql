-- Social Scanner — initial schema
-- All user-owned tables: UUID PK, user_id, created_at, updated_at, RLS enabled, explicit policies.
-- scans cache + unlocks/subscriptions: server-side only (no client write policies; webhooks use service role).

create extension if not exists pgcrypto;

-- profiles (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  region text not null default 'IN',           -- 'IN' or 'GLOBAL'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

-- subscriptions
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                       -- 'razorpay' | 'lemonsqueezy'
  provider_sub_id text,
  provider_customer_id text,
  plan text not null,                           -- 'monthly' | 'annual'
  status text not null,                         -- 'active' | 'canceled' | 'past_due'
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on subscriptions (user_id);
create index subscriptions_provider_sub_id_idx on subscriptions (provider_sub_id);
alter table subscriptions enable row level security;
create policy "own subs read" on subscriptions for select using (auth.uid() = user_id);
-- writes happen server-side via service role (webhooks) only; no client write policy.

-- one-time unlocks
create table unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_key text not null,                       -- platform:handle:toolId
  provider text not null,
  provider_payment_id text,
  amount_minor integer not null,                -- paise or cents
  currency text not null,                       -- 'INR' | 'USD'
  created_at timestamptz not null default now()
);
create index unlocks_user_scan_idx on unlocks (user_id, scan_key);
alter table unlocks enable row level security;
create policy "own unlocks read" on unlocks for select using (auth.uid() = user_id);

-- scans cache (SERVER ONLY — no client policies, accessed via service role)
create table scans (
  id uuid primary key default gen_random_uuid(),
  scan_key text not null,                       -- platform:handle:toolId
  platform text not null,
  handle text not null,
  tool_id text not null,
  result jsonb not null,                        -- full ToolResult (free + locked)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index scans_key_expires_idx on scans (scan_key, expires_at);
alter table scans enable row level security;     -- enabled with NO policies = client locked out

-- tracked accounts (Phase 3 monitoring)
create table tracked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  handle text not null,
  active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);
alter table tracked_accounts enable row level security;
create policy "own tracked read"   on tracked_accounts for select using (auth.uid() = user_id);
create policy "own tracked insert" on tracked_accounts for insert with check (auth.uid() = user_id);
create policy "own tracked update" on tracked_accounts for update using (auth.uid() = user_id);
create policy "own tracked delete" on tracked_accounts for delete using (auth.uid() = user_id);

-- snapshots (Phase 3 — powers unfollower/growth)
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  followers integer,
  following integer,
  data jsonb,
  captured_at timestamptz not null default now()
);
create index snapshots_tracked_captured_idx on snapshots (tracked_account_id, captured_at desc);
alter table snapshots enable row level security;
create policy "own snapshots read" on snapshots for select using (
  exists (select 1 from tracked_accounts t
          where t.id = snapshots.tracked_account_id and t.user_id = auth.uid())
);

-- usage / rate limit
create table usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_key text,                                -- IP hash for anonymous users
  day date not null default current_date,
  scans_count integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index usage_daily_user_day_idx on usage_daily (user_id, day) where user_id is not null;
create unique index usage_daily_anon_day_idx on usage_daily (anon_key, day) where anon_key is not null;
alter table usage_daily enable row level security;
create policy "own usage read" on usage_daily for select using (auth.uid() = user_id);

-- updated_at trigger helper
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

create trigger profiles_updated_at         before update on profiles         for each row execute function set_updated_at();
create trigger subscriptions_updated_at    before update on subscriptions    for each row execute function set_updated_at();
create trigger tracked_accounts_updated_at before update on tracked_accounts for each row execute function set_updated_at();

-- bootstrap profile on signup
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, region)
  values (new.id, new.email, 'IN')
  on conflict (id) do nothing;
  return new;
end$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
