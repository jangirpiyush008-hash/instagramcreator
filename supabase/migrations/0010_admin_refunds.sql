-- Owner audit trail for refunds initiated from the admin panel.
-- Each row is one refund ATTEMPT — successful or not — so we have a
-- searchable history without relying on Razorpay's dashboard.

create table if not exists admin_refunds (
  id uuid primary key default gen_random_uuid(),
  razorpay_payment_id text not null,
  razorpay_refund_id text,            -- null when the attempt failed
  status text not null,               -- 'processed' | 'failed' | ...
  error text,                         -- failure reason (from Razorpay)
  amount_paise bigint,                -- requested / actual amount
  notes text,                         -- admin note
  created_at timestamptz not null default now()
);

create index if not exists admin_refunds_payment_idx
  on admin_refunds (razorpay_payment_id, created_at desc);
create index if not exists admin_refunds_status_idx
  on admin_refunds (status, created_at desc);

alter table admin_refunds enable row level security;

-- Nobody except the service-role client should touch this.
drop policy if exists admin_refunds_no_client_access on admin_refunds;
create policy admin_refunds_no_client_access on admin_refunds
  for all to authenticated, anon using (false) with check (false);
