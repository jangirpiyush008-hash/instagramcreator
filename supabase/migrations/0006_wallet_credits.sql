-- Wallet credit ledger for the developer API pay-as-you-go flow.
--
-- Each row is a CREDIT LOT — a single top-up (or promotional grant)
-- with its own expiry. Debits are handled by decrementing
-- credits_remaining on the oldest non-expired lot with balance > 0
-- (FIFO), spanning multiple lots when a single debit exceeds one lot's
-- remaining balance.
--
-- Why lots instead of a running balance:
--   • Each top-up has a 12-month validity window (per WALLET_CREDIT_VALIDITY_MONTHS).
--   • Compliance / accounting needs the audit trail (when purchased, when consumed).
--   • Refunds mark the specific lot they refund.
--
-- Balance query for a user:
--   SELECT COALESCE(SUM(credits_remaining), 0)
--   FROM wallet_credits
--   WHERE user_id = $1 AND expires_at > now();

create table wallet_credits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- Where the credits came from. Free-text so we can add new grant sources
  -- without a migration (e.g. 'topup:topup-20', 'promo:signup', 'refund:CS-123').
  source              text not null,
  credits_granted     int  not null check (credits_granted > 0),
  credits_remaining   int  not null check (credits_remaining >= 0),
  -- Razorpay identifiers when the lot was purchased.
  razorpay_payment_id text,
  razorpay_order_id   text,
  razorpay_link_id    text,
  amount_minor        int,            -- amount paid in paise (INR) — null for promos/refunds
  currency            text default 'INR',
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Partial index: only rows still consumable. Balance queries and the
-- FIFO debit search hit this index. Skipping expired/empty rows keeps
-- it small even after years of use.
create index wallet_credits_active_idx
  on wallet_credits (user_id, expires_at, created_at)
  where credits_remaining > 0 and expires_at > now();

alter table wallet_credits enable row level security;

-- Users can read their own lots (dashboard shows purchase history).
-- Writes only via service role — never trust the client to add credits.
create policy "own row read"
  on wallet_credits
  for select
  using (auth.uid() = user_id);

-- ── Deduction function ────────────────────────────────────────────────
-- Atomically deducts `p_amount` credits from the caller's wallet using
-- FIFO across non-expired lots. Returns the amount actually deducted —
-- which will equal p_amount on success or the total available balance
-- if the wallet was short (caller should treat any shortfall as a
-- rejection, but we return the number so the caller can log it).

create or replace function deduct_wallet_credits(
  p_user_id uuid,
  p_amount  int
) returns int
language plpgsql
as $$
declare
  v_remaining int := p_amount;
  v_lot record;
  v_take int;
begin
  if p_amount <= 0 then
    return 0;
  end if;

  for v_lot in
    select id, credits_remaining
    from wallet_credits
    where user_id = p_user_id
      and expires_at > now()
      and credits_remaining > 0
    order by created_at asc
    for update
  loop
    v_take := least(v_remaining, v_lot.credits_remaining);
    update wallet_credits
      set credits_remaining = credits_remaining - v_take,
          updated_at = now()
      where id = v_lot.id;
    v_remaining := v_remaining - v_take;
    exit when v_remaining <= 0;
  end loop;

  return p_amount - v_remaining;
end;
$$;

-- ── Refund function ───────────────────────────────────────────────────
-- Reverses a debit by adding credits back to the SPECIFIC lot that was
-- consumed. Simpler alternative: just insert a fresh grant row. The
-- fresh-grant approach is cleaner for accounting; use that. Kept this
-- comment as a hint for the future — no function defined.
