import type { SocialTool } from "../types";

// Real signals for follower quality — no third-party audit API needed. All
// derived from public engagement + follow ratios. Heuristic, not a bot-scan,
// but honest and reproducible from the numbers we already show.
//
//   - engagement rate (ER) is the strongest tell: 0.3% ER on a 1M account
//     means either bought followers or a dead audience.
//   - follower/following ratio catches classic bot-follow patterns.
//   - verified badge is a strong "real audience" signal.
//   - post activity: zero recent posts → ghost account.

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export const fakeFollower: SocialTool = {
  id: "fake-follower",
  name: "Real Follower Check",
  intentLabel: "How real is this follower count?",
  blurb: "Estimate audience quality from real engagement and follow ratios — no third-party audit API required.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "real-follower-check",
    title: "Real Follower Check — Instagram, TikTok Instagram & TikTok YouTube",
    description: "See how real an account's audience is from public engagement signals.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, 12);

    const totals = posts.reduce(
      (a, p) => ({ likes: a.likes + p.likes, comments: a.comments + p.comments }),
      { likes: 0, comments: 0 },
    );
    const n = Math.max(posts.length, 1);
    const avgEngagement = (totals.likes + totals.comments) / n;
    const followers = profile.followers ?? 0;
    const following = profile.following ?? 0;
    const erPct = followers > 0 ? (avgEngagement / followers) * 100 : 0;

    // Build a quality score starting at 100 and deducting for red flags.
    let quality = 100;
    const reasons: { flag: string; note: string; delta: number }[] = [];

    if (posts.length === 0) {
      quality -= 25;
      reasons.push({ flag: "No recent posts", note: "Account hasn't posted recently — can't verify engagement.", delta: -25 });
    } else if (erPct < 0.3) {
      quality -= 35;
      reasons.push({ flag: "Very low engagement", note: `ER ${erPct.toFixed(2)}% is far below organic norms (1–5%). Strong sign of inflated followers.`, delta: -35 });
    } else if (erPct < 0.8) {
      quality -= 18;
      reasons.push({ flag: "Low engagement", note: `ER ${erPct.toFixed(2)}% is below average — some inflation likely.`, delta: -18 });
    } else if (erPct < 1.5) {
      quality -= 6;
      reasons.push({ flag: "Slightly low ER", note: `ER ${erPct.toFixed(2)}% is under 1.5% — mild dilution possible.`, delta: -6 });
    }

    if (followers > 10_000 && following === 0) {
      quality -= 8;
      reasons.push({ flag: "Follows nobody", note: "Large accounts that follow no one are often bot-managed brand shells.", delta: -8 });
    }
    if (followers > 10_000 && following > 0 && following / followers > 0.5) {
      quality -= 12;
      reasons.push({ flag: "Follow-back pattern", note: `Following ${following.toLocaleString()} vs followers ${followers.toLocaleString()} looks like a growth-hack pattern.`, delta: -12 });
    }
    if (!profile.verified && followers > 1_000_000) {
      quality -= 4;
      reasons.push({ flag: "Unverified at scale", note: "Real 1M+ creators almost always get verified.", delta: -4 });
    }

    quality = clamp(quality, 25, 99);
    // Split the "not real" remainder between inactive and bots — very-low ER
    // shifts the balance toward inactive (dead followers) rather than bots.
    const notReal = 100 - quality;
    const inactivePct = Number((notReal * (erPct < 0.5 ? 0.7 : 0.55)).toFixed(1));
    const botPct = Number((notReal - inactivePct).toFixed(1));

    return {
      toolId: "fake-follower",
      platform,
      handle,
      free: {
        followers,
        engagementRatePct: Number(erPct.toFixed(2)),
        realPct: Number(quality.toFixed(1)),
        inactivePct,
        botPct,
        verified: profile.verified,
        following,
        postsAnalyzed: posts.length,
        reasons,
        methodology: "Heuristic from public engagement + follow ratios. Not a third-party bot scan — signal, not certainty.",
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
