-- Extend the profiles table with fields captured on the /account
-- Profile tab. All optional — existing users see empty fields until
-- they fill them in. RLS already enforces "own profile read/update".
--
-- Countries stored as ISO 3166-1 alpha-2 codes (IN, US, GB, ...) to
-- keep them normalized and cheap to filter on. Phone stays as a raw
-- string (E.164 preferred but not enforced) since users type it in
-- many local formats — validation happens in the UI, not the DB.

alter table profiles
  add column if not exists phone text,
  add column if not exists country_code text,       -- ISO alpha-2, e.g. 'IN', 'US'
  add column if not exists company text,
  add column if not exists job_title text,
  add column if not exists timezone text,           -- IANA, e.g. 'Asia/Kolkata'
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists product_updates_opt_in boolean not null default true,
  add column if not exists onboarded_at timestamptz;

-- Bump updated_at when any of the new columns change. profiles already
-- has updated_at auto-set on some paths; this trigger makes it
-- consistent regardless of writer.
create or replace function profiles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at_trigger on profiles;
create trigger profiles_touch_updated_at_trigger
  before update on profiles
  for each row execute function profiles_touch_updated_at();

-- Index on country_code for potential future analytics (e.g. "how many
-- Indian users on Pro tier?"). Cheap partial index — most rows will
-- be null in early days.
create index if not exists profiles_country_code_idx
  on profiles (country_code) where country_code is not null;
