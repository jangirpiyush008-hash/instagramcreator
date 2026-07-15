-- Guest orders for the SMM growth-services vertical (/services).
-- Kept entirely separate from analytics tables so this vertical can be
-- moved to a different domain / gateway later without any coupling.
--
-- Payment model: USDT on BNB Smart Chain (BEP20). User pays to a
-- static wallet, submits their tx hash, we verify on-chain via
-- BscScan, then trigger fulfillment.

create table if not exists service_orders (
  id uuid primary key default gen_random_uuid(),

  -- Short human-friendly reference we show to the user. Format
  -- DC-<8 hex chars>. Unique so support can look up by ref alone.
  order_ref text not null unique,

  -- Contact + delivery
  email text not null,
  items jsonb not null,          -- [{serviceId, name, qty, targetUrl, priceUsd}]
  notes text,

  -- Pricing
  total_usd numeric(10, 2) not null,
  total_usdt numeric(20, 6) not null,  -- what we asked them to pay (USDT decimals = 6 on BEP20)

  -- Lifecycle status
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment',   -- created, waiting for tx hash
    'verifying',          -- tx hash submitted, on-chain check pending
    'paid',               -- verified, ready to fulfill
    'fulfilling',         -- supplier API called
    'delivered',          -- supplier confirmed complete
    'failed',             -- verification or fulfillment failed
    'refunded'            -- crypto refunded (manual)
  )),

  -- Payment routing
  wallet_address text not null,           -- our receiving address
  network text not null default 'bep20',  -- 'bep20' | 'trc20' | 'erc20' (future)
  token text not null default 'USDT',

  -- On-chain verification results
  tx_hash text,
  tx_verified_at timestamptz,
  tx_verification_error text,
  amount_received_usdt numeric(20, 6),
  from_address text,                      -- who sent it (audit trail)

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One tx hash can only be counted against one order — prevents a user
-- from replaying the same payment to unlock multiple orders. Partial
-- index so we can have many NULLs during the awaiting-payment window.
create unique index if not exists service_orders_tx_hash_unique
  on service_orders (lower(tx_hash))
  where tx_hash is not null;

create index if not exists service_orders_status_idx
  on service_orders (status, created_at desc);
create index if not exists service_orders_email_idx
  on service_orders (email, created_at desc);

-- Updated_at auto-bump. Same pattern used elsewhere in the schema.
create or replace function service_orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_orders_touch_updated_at_trigger on service_orders;
create trigger service_orders_touch_updated_at_trigger
  before update on service_orders
  for each row execute function service_orders_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- No client-side access. Guest orders are managed exclusively by the
-- server routes /api/services/order and /api/services/verify, which
-- use the service-role client. Order status lookup happens via a
-- one-shot API call keyed on order_ref (not a DB read).
alter table service_orders enable row level security;

-- Explicit deny for authenticated + anon roles.
drop policy if exists service_orders_no_client_access on service_orders;
create policy service_orders_no_client_access on service_orders
  for all to authenticated, anon
  using (false) with check (false);
