# Content Guidelines

These rules are non-negotiable. They protect the merchant accounts that the
business depends on.

## The framing

Social Scanner is **public social analytics for creators and brands** — not a
stalker tool. Razorpay and LemonSqueezy both freeze merchant accounts for
"stalkerware." Losing the payment rail kills the business overnight, so every
piece of copy must read like a brand-marketing tool.

## Allowed copy

- "Analyze any public account's engagement and audience quality."
- "Audience analytics for creators and brands."
- "Public data only — the account is never notified."
- "No login required."
- "Engagement rate, audience quality, growth signal."

## Banned copy

Never use these words or any variant of them anywhere user-visible — UI,
landing pages, meta tags, OG images, blog posts, ad creative, transactional
emails, push notifications:

- spy / spying / spyware
- stalk / stalker / stalking
- secret / hidden / discreet
- catch them / catch your ex
- track your ex / track anyone
- see who they're watching / see who they follow

## How to apply

Before publishing any new string, ask: would a brand marketing team write
this? If the answer is no, rewrite it. When in doubt, lean analytical
(numbers, percentiles, benchmarks) and away from emotional language.

## Where these rules live in code

- `core/tools/<id>/index.ts` — `intentLabel` and `blurb` show up in the intent
  picker. Keep them analytical.
- `core/tools/<id>/index.ts` — `seo.title` and `seo.description` ship to
  Google. Keep them analytical.
- `web/components/*` — button labels, headings, error states. Keep them
  analytical.
- `web/app/layout.tsx` — site metadata. Keep it analytical.
