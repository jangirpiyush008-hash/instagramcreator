-- Add pending_manual status for orders waiting on Telegram-based
-- manual verification. Distinct from awaiting_payment (user hasn't
-- paid yet) and failed (permanently rejected) — pending_manual is
-- "user paid, autoverify didn't catch it, admin will confirm."
--
-- The user's checkout page polls order status; when admin flips this
-- to 'paid' from the admin panel, the polling client shows success.

alter table service_orders
  drop constraint if exists service_orders_status_check;

alter table service_orders
  add constraint service_orders_status_check check (status in (
    'awaiting_payment',
    'verifying',
    'pending_manual',
    'paid',
    'fulfilling',
    'delivered',
    'failed',
    'refunded'
  ));
