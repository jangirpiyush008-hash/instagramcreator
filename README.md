# Social Scanner

Public-data analytics for any Instagram, TikTok, or YouTube account.
Enter a handle → pick what you want to know → see a teaser → unlock with one
payment or a subscription.

## Phase 0 (current)

End-to-end money loop with **one** working tool: engagement-rate. YouTube
adapter is wired live; Instagram and TikTok adapters compile but throw
`NotImplementedError` until Phase 2. The home page UI uses an
Instagram/TikTok toggle per product spec — selecting either will route to the
results page; the scan API returns a clean `not_implemented` error until the
data providers ship.

## Stack

- Next.js 15 (App Router) + TypeScript strict
- Tailwind + small inline shadcn-style primitives
- Supabase (Postgres + Auth + RLS mandatory)
- Razorpay (India, ₹) + LemonSqueezy (global, $) dual-rail, geo-routed
- Resend (email), Vercel cron (Phase 3)

## Architecture

```
core/   — all business logic. No `next` or `web` imports allowed here.
  tools/        — SocialTool registry (one file per tool)
  data/         — DataAdapter interface + per-platform adapters + 48h cache
  payments/     — PaymentProvider interface + Razorpay + LemonSqueezy + region router
  billing/      — entitlements, daily rate limits
  validation/   — Zod schemas shared by API + UI
  database/     — service-role Supabase client
  constants/    — pricing, limits, blurred placeholder
  utils/        — handle normalizer, region detect, currency, hash, errors
  types/        — shared TS types

web/    — Next.js wrapper. UI only.
  app/                   — routes (home, [platform]/[handle], account, login, api/*)
  components/            — UI components
  lib/                   — Supabase browser/server clients

supabase/
  migrations/0001_initial.sql — schema + RLS for every user-owned table

CONTENT_GUIDELINES.md — non-negotiable compliance rules
```

## Setup

```bash
cp .env.example .env.local
# fill in Supabase + YouTube + Razorpay + LemonSqueezy keys

# apply the schema
psql "$DATABASE_URL" < supabase/migrations/0001_initial.sql
# (or via supabase CLI: supabase db push)

npm install
npm run dev
```

## End-to-end test

YouTube is the only platform with a real data source in Phase 0. To exercise
the money loop manually, hit the scan API directly:

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"platform":"youtube","handle":"mkbhd","toolId":"engagement-rate"}' | jq
```

You should get `free` fields populated and `locked` fields blurred. Sign in,
buy a one-time unlock or subscribe, and the same call should return `entitled:
true` with the real `locked` values.

## Adding a new tool (Phase 1+)

1. Create `core/tools/<id>/index.ts` exporting a `SocialTool`.
2. Add it to the `TOOLS` array in `core/tools/registry.ts`.
3. Done. Intent picker, scan API, paywall gating, and (Phase 1) the
   `/tools/[toolId]` SEO page all read from the registry automatically.

## Compliance

Read `CONTENT_GUIDELINES.md` before writing any user-visible copy. Razorpay
and LemonSqueezy freeze accounts for "stalkerware" framing.
