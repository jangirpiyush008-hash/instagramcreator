-- Admin overrides for the static services catalog.
--
-- Rather than migrate the entire 40-service catalog to a database
-- (which would touch cart, checkout, price computation, and the
-- Discovery flow all at once), we keep core/services/catalog.ts as
-- the source of truth for the shape of each service (name, blurb,
-- platform, category, emoji, etc.) and let admin OVERRIDE specific
-- numeric fields per row.
--
-- Fields the admin can override:
--   - retail_rate_usd (per 1,000 units)
--   - new_price_inr   (bookkeeping / admin sheet column)
--   - min_qty, max_qty, step_qty
--   - free_trial_quantity
--   - is_active (soft-delete a service without deleting the row)
--
-- Every ordinary read path applies overrides on top of the static
-- catalog, so a price change lands the moment the row is written —
-- no deploy needed.

create table if not exists service_overrides (
  service_id text primary key,          -- matches Service.id from catalog.ts

  retail_rate_usd integer,
  new_price_inr integer,
  min_qty integer,
  max_qty integer,
  step_qty integer,
  free_trial_quantity integer,
  is_active boolean,

  updated_at timestamptz not null default now(),
  updated_by text                       -- 'admin' or specific note
);

create or replace function service_overrides_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_overrides_touch_trigger on service_overrides;
create trigger service_overrides_touch_trigger
  before update on service_overrides
  for each row execute function service_overrides_touch();

-- RLS deny-all: only the service-role admin API writes here.
alter table service_overrides enable row level security;
drop policy if exists service_overrides_no_client on service_overrides;
create policy service_overrides_no_client on service_overrides
  for all to authenticated, anon
  using (false) with check (false);
