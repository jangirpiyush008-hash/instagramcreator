-- Creator discovery index. Caches profile lookups from provider search
-- results so repeated searches don't hit the paid API for the same
-- handle. Grows organically: every search response gets upserted here.
--
-- Not a full crawler-built index (that would be Path B). This is the
-- lightweight Path A cache — 24h TTL, small result sets per search,
-- Pro-tier gated. Enough to run a real "Discover" tab for launch.

-- pg_trgm powers the GIN index at the bottom. Must be enabled BEFORE
-- the index is created (Postgres 42704 error otherwise). Supabase
-- convention is to install into the `extensions` schema, but its
-- gin_trgm_ops operator class is exported to public via the extension
-- itself so an unqualified reference in the index below works.
create extension if not exists pg_trgm with schema extensions;

create table if not exists creator_index (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram','tiktok','youtube')),
  handle text not null,
  display_name text,
  bio text,
  profile_pic_url text,
  external_url text,
  is_verified boolean not null default false,

  -- Core metrics — these drive the filter sidebar
  followers bigint not null default 0,
  following bigint not null default 0,
  post_count integer not null default 0,
  engagement_rate numeric(6, 3), -- percent, e.g. 3.14 = 3.14%
  avg_views bigint,
  avg_likes bigint,
  avg_comments bigint,

  -- Recent posts thumbnails (up to 4). Cheap to render in the search grid
  -- without an extra API call per card. jsonb of {url, thumb, likes, ...}.
  recent_posts jsonb,

  -- Free-text tokens the search API queries against — lowercase copy of
  -- handle + display_name + bio glued together. Populated by a trigger
  -- below so we don't have to remember to update it in every writer.
  search_text text,

  -- Freshness
  first_seen_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),

  unique (platform, handle)
);

-- Indexes for the two dominant filter axes. Composite (platform, X) so
-- IG/TT/YT queries hit their own subset without a full-table scan.
create index if not exists creator_index_platform_followers_idx
  on creator_index (platform, followers desc);
create index if not exists creator_index_platform_er_idx
  on creator_index (platform, engagement_rate desc)
  where engagement_rate is not null;
create index if not exists creator_index_platform_refreshed_idx
  on creator_index (platform, refreshed_at desc);

-- GIN index for the keyword search — cheap on Postgres, catches
-- prefix/substring matches in handle+bio+display_name. Reference the
-- operator class in the extensions schema explicitly — Supabase installs
-- pg_trgm there and the default search_path may not include it.
create index if not exists creator_index_search_text_trgm_idx
  on creator_index using gin (search_text extensions.gin_trgm_ops);

-- Trigger: keep search_text in sync automatically. Cheaper than making
-- every insert path assemble it manually and easier to keep consistent.
create or replace function creator_index_set_search_text()
returns trigger language plpgsql as $$
begin
  new.search_text = lower(coalesce(new.handle, '') || ' ' ||
                           coalesce(new.display_name, '') || ' ' ||
                           coalesce(new.bio, ''));
  return new;
end;
$$;

drop trigger if exists creator_index_search_text_trigger on creator_index;
create trigger creator_index_search_text_trigger
  before insert or update of handle, display_name, bio on creator_index
  for each row execute function creator_index_set_search_text();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- creator_index is public-safe data (only public profile metrics). We
-- want anon reads to be allowed so signed-out visitors can preview the
-- Discover page (and the API can serve without a session), but writes
-- are service-role only — the search endpoint is the sole writer.
alter table creator_index enable row level security;

drop policy if exists creator_index_read_public on creator_index;
create policy creator_index_read_public on creator_index
  for select using (true);

-- Writes happen through the service-role client from /api/discover;
-- no policy needed for anon INSERT/UPDATE. Explicit reject keeps
-- accidental client-side writes from ever landing.
drop policy if exists creator_index_no_client_writes on creator_index;
create policy creator_index_no_client_writes on creator_index
  for all to authenticated using (false) with check (false);

-- ── Saved-creator watchlist ─────────────────────────────────────────────
-- Users can save creators from Discover results. Reuses the existing
-- api_watchlist table (see 0005_api_infrastructure.sql) — no new table
-- needed, we just write (user_id, platform, handle) into it. That table
-- already has RLS enforcing user_id = auth.uid().
