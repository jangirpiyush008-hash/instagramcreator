import type { SocialTool } from "../types";
import { enrichCommentAudience } from "@/core/data/audience-enrichment";

// Real signals for follower quality — no third-party audit API needed. All
// derived from public engagement + follow ratios. Heuristic, not a bot-scan,
// but honest and reproducible from the numbers we already show.
//
// v2 signal: audience-profile completeness. Real audiences have bios and
// custom avatars; bought-follower audiences skew heavily toward empty
// bios + default avatars. We reuse the same enrichment pipeline as
// gender-split (sample commenter profiles, count how many are populated).
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
    title: "Real Follower Check — Instagram, TikTok & YouTube",
    description: "See how real an account's audience is from public engagement signals.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, 12);
    const isYouTube = platform === "youtube";

    // v2: audience-profile completeness. Fetch a small sample of commenter
    // profiles and measure how many have bios + custom avatars. Bought-
    // follower networks skew heavily toward empty profiles. Best-effort —
    // failure never breaks the tool.
    let audienceCompletenessPct: number | null = null;
    let audienceSampleSize = 0;
    try {
      const commentsResult = await data.getRecentComments(platform, handle, 100);
      if (commentsResult.comments.length > 0) {
        // Cap the enrichment cost hard here — this is a secondary signal.
        // Skip face analysis (bio + name-only) to stay cheap.
        const aud = await enrichCommentAudience(platform, data, commentsResult.comments, {
          maxProfiles: 15,
          runFaceAnalysis: false,
        });
        audienceSampleSize = aud.profilesFetched;
        audienceCompletenessPct = aud.profileCompletenessPct;
      }
    } catch (e) {
      console.warn("[fake-follower] audience enrichment failed:", e instanceof Error ? e.message : e);
    }

    // YouTube-specific caveats:
    //   • YT Data API always returns following=0 (Google doesn't expose the
    //     channel's subscriptions publicly). So the "Follows nobody" penalty
    //     that fires on IG/TT is a guaranteed false positive on YT — skip it.
    //   • YT subscriberCount is rounded (nearest 1K) so the ER math has an
    //     inherent floor of ±0.1% — mention this in the caveat.
    //   • We can lean harder on views/sub and comments/like ratios on YT
    //     because every video has viewCount (unlike IG photos).
    const ytNote = isYouTube
      ? "⚠️ Tentative on YouTube — YouTube Data API doesn't expose subscriber lists or channel subscriptions, so this score is engagement-derived only (not a follower-sample audit). Also, YouTube rounds subscriber count to the nearest 1K which slightly inflates engagement rate math on the boundary."
      : null;

    const totals = posts.reduce(
      (a, p) => ({
        likes: a.likes + p.likes,
        comments: a.comments + p.comments,
        views: a.views + (p.views ?? 0),
      }),
      { likes: 0, comments: 0, views: 0 },
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

    // "Follows nobody" — only a real signal on IG/TT. YouTube API always
    // returns following=0 (Google doesn't expose it), so skip on YT.
    if (!isYouTube && followers > 10_000 && following === 0) {
      quality -= 8;
      reasons.push({ flag: "Follows nobody", note: "Large accounts that follow no one are often bot-managed brand shells.", delta: -8 });
    }
    if (!isYouTube && followers > 10_000 && following > 0 && following / followers > 0.5) {
      quality -= 12;
      reasons.push({ flag: "Follow-back pattern", note: `Following ${following.toLocaleString()} vs followers ${followers.toLocaleString()} looks like a growth-hack pattern.`, delta: -12 });
    }
    if (!profile.verified && followers > 1_000_000) {
      quality -= 4;
      reasons.push({ flag: "Unverified at scale", note: "Real 1M+ creators almost always get verified.", delta: -4 });
    }

    // YouTube-only signals — replace the follow-ratio signals with metrics
    // we CAN measure on YT: views/sub, comments/view, likes/view.
    if (isYouTube && posts.length > 0 && followers > 0) {
      const viewsPerSubPct = (totals.views / n / followers) * 100;
      const likesPerViewPct = totals.views > 0 ? (totals.likes / totals.views) * 100 : 0;
      const commentsPerLikePct = totals.likes > 0 ? (totals.comments / totals.likes) * 100 : 0;

      // Healthy avg views/sub on YouTube: 10–20% for engaged audiences.
      // <2% = bought subscribers not watching, or dead audience.
      if (viewsPerSubPct < 2) {
        quality -= 25;
        reasons.push({
          flag: "Very low watch rate",
          note: `Avg ${viewsPerSubPct.toFixed(1)}% of subs watch new videos. Real audiences sit at 10–20%. Strong sign of purchased subs.`,
          delta: -25,
        });
      } else if (viewsPerSubPct < 5) {
        quality -= 12;
        reasons.push({
          flag: "Low watch rate",
          note: `Avg ${viewsPerSubPct.toFixed(1)}% of subs watch new videos — below the 10% healthy floor.`,
          delta: -12,
        });
      }

      // Real subs like videos ~3–8% of the time. Bots basically never like.
      if (likesPerViewPct > 0 && likesPerViewPct < 0.5) {
        quality -= 10;
        reasons.push({
          flag: "Low like rate",
          note: `${likesPerViewPct.toFixed(2)}% of viewers like. Real engaged audiences sit at 3–8%.`,
          delta: -10,
        });
      }

      // Comments < 5% of likes is normal (people like more than comment).
      // Comments > 40% of likes on a big channel is suspicious — engagement pods.
      if (followers > 100_000 && commentsPerLikePct > 40) {
        quality -= 8;
        reasons.push({
          flag: "Unusual comment/like ratio",
          note: `Comments are ${commentsPerLikePct.toFixed(0)}% of likes — could indicate engagement pods.`,
          delta: -8,
        });
      }
    }

    // Audience-profile completeness signal (v2). Real audiences: 60-90%
    // completeness (bio + custom avatar). Bot-heavy audiences: <30%.
    if (audienceCompletenessPct !== null && audienceSampleSize >= 5) {
      if (audienceCompletenessPct < 25) {
        quality -= 18;
        reasons.push({
          flag: "Empty-profile audience",
          note: `Only ${audienceCompletenessPct.toFixed(0)}% of ${audienceSampleSize} sampled commenters have both a bio AND a custom avatar. Real audiences sit at 60-90%. Strong bot indicator.`,
          delta: -18,
        });
      } else if (audienceCompletenessPct < 45) {
        quality -= 8;
        reasons.push({
          flag: "Low audience profile completeness",
          note: `${audienceCompletenessPct.toFixed(0)}% of ${audienceSampleSize} sampled commenters have bio+avatar (healthy: 60%+). Mild bot signal.`,
          delta: -8,
        });
      }
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
        audienceCompletenessPct,
        audienceSampleSize,
        ...(ytNote ? { caveat: ytNote } : {}),
        methodology:
          (ytNote ? ytNote + " " : "") +
          "Heuristic from public engagement + follow ratios + sampled audience-profile completeness (bio + custom avatar rate across 15 recent commenters). Not a third-party bot scan — signal, not certainty.",
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
