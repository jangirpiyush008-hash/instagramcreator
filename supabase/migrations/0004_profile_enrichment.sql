-- Extend profiles with OAuth-provided display data so the UI can personalize
-- greetings, avatar bubbles, and pre-fill checkout without a second round-trip
-- to auth.users. The auth/callback route populates these on every sign-in.
--
-- Nullable — email-only magic-link users won't have a name / avatar, and
-- that's fine.

alter table profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text;

-- Backfill from auth.users.raw_user_meta_data for existing rows so returning
-- users get their name/avatar without needing to sign out and back in.
update profiles p
set
  full_name = coalesce(
    p.full_name,
    (u.raw_user_meta_data->>'full_name'),
    (u.raw_user_meta_data->>'name')
  ),
  avatar_url = coalesce(
    p.avatar_url,
    (u.raw_user_meta_data->>'avatar_url'),
    (u.raw_user_meta_data->>'picture')
  )
from auth.users u
where p.id = u.id
  and (p.full_name is null or p.avatar_url is null);
