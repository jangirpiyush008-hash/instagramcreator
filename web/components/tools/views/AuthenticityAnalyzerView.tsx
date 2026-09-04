"use client";

import { CaveatBanner, MetricCard, SectionTitle, StatusBadge } from "../primitives";
import { cn } from "@/web/lib/cn";
import type { Platform } from "@/core/types";

// UI for the Authenticity Analyzer. Reads the fully-computed analysis
// out of props.data (built server-side by core/tools/authenticity-
// analyzer). Every score field carries its own explanation + source
// tag — this view does no scoring logic of its own, only presentation.

type DataSource = "verified" | "calculated" | "inferred" | "unknown";

interface SubScore {
  score: number;
  label: string;
  source: DataSource;
  confidencePct: number;
  reasons: string[];
}

interface PaidScore {
  classification: "Verified Paid" | "Likely Paid" | "Likely Organic" | "Unknown";
  aggregatedScore: number;
  confidencePct: number;
  reasons: string[];
  paidPostCount: number;
  totalPostsAnalyzed: number;
  source: DataSource;
}

interface FraudScore {
  risk: "Low" | "Moderate" | "Elevated" | "High" | "Insufficient data";
  confidencePct: number;
  reasons: string[];
  source: DataSource;
}

interface PaidSample {
  postIndex: number;
  postUrl: string | null;
  score: number;
  discountCodes: string[];
  affiliateUrls: string[];
  brandTagCount: number;
  sponsoredHashtags: string[];
  promoCtas: string[];
  reasons: string[];
}

interface CommentQuality {
  totalComments: number;
  genericPct: number;
  emojiOnlyPct: number;
  repetitivePct: number;
  botNamePct: number;
  avgLength: number;
  score: number;
}

interface AdLibraryStatus {
  available: boolean;
  hasActiveAds: boolean | null;
  confidence: string;
  method: string;
  note: string | null;
}

interface Verdict {
  label: string;
  tone: "positive" | "neutral" | "warning" | "danger";
  summary: string;
  supportingScores: string[];
}

interface BrandFit {
  structure: string;
  tone: "positive" | "neutral" | "warning" | "danger";
  headline: string;
  reasoning: string;
  estimatedRateInrRange: string | null;
  creatorTier: string;
  cautionNotes: string[];
}

interface BurstAnalysis {
  available: boolean;
  windowMinutes: number | null;
  peakConcentrationPct: number | null;
  score: number;
  flag: string | null;
}

interface LanguageAnalysis {
  available: boolean;
  captionScript: string | null;
  dominantCommentScript: string | null;
  dominantSharePct: number | null;
  mismatch: boolean;
  score: number;
  flag: string | null;
}

interface ProfileSignalsData {
  isBusinessAccount: boolean;
  businessCategory: string | null;
  bioCommercialHits: string[];
  bioBrandOfficialHit: boolean;
  commercialIntentScore: number;
  reasons: string[];
}

interface AudienceEnrichment {
  completenessPct: number | null;
  sampleSize: number;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

export function AuthenticityAnalyzerView({ handle, data }: Props) {
  const decodeScore = (data?.decodeScore as number) ?? 0;
  const decodeLabel = (data?.decodeLabel as string) ?? "Insufficient data";
  const followers = (data?.followers as number) ?? 0;
  const postsAnalyzed = (data?.postsAnalyzed as number) ?? 0;
  const commentsAnalyzed = (data?.commentsAnalyzed as number) ?? 0;
  const verified = (data?.verified as boolean) ?? false;

  const audience = (data?.audience as SubScore | undefined);
  const engagement = (data?.engagement as SubScore | undefined);
  const reach = (data?.reach as SubScore | undefined);
  const paid = (data?.paid as PaidScore | undefined);
  const fraud = (data?.fraud as FraudScore | undefined);

  const adLibrary = data?.adLibraryStatus as AdLibraryStatus | undefined;
  const paidSamples = (data?.paidSignalSamples as PaidSample[] | undefined) ?? [];
  const commentQuality = data?.commentQuality as CommentQuality | undefined;
  const caveats = (data?.caveats as string[] | undefined) ?? [];
  const methodology = data?.methodology as string | undefined;

  // v2 depth data
  const verdict = data?.verdict as Verdict | undefined;
  const brandFit = data?.brandFit as BrandFit | undefined;
  const burst = data?.burstAnalysis as BurstAnalysis | null | undefined;
  const languageAnalysis = data?.languageAnalysis as LanguageAnalysis | null | undefined;
  const profSignals = data?.profileSignals as ProfileSignalsData | null | undefined;
  const audienceEnr = data?.audienceEnrichment as AudienceEnrichment | undefined;

  return (
    <div className="space-y-6">
      {/* HEADER: Decode Score */}
      <DecodeHeader
        handle={handle}
        score={decodeScore}
        label={decodeLabel}
        followers={followers}
        postsAnalyzed={postsAnalyzed}
        commentsAnalyzed={commentsAnalyzed}
        verified={verified}
      />

      {/* HERO: Final Verdict — the one-line answer */}
      {verdict && <VerdictHero verdict={verdict} />}

      {/* HERO: Brand Deal Fit — collab structure recommendation */}
      {brandFit && <BrandFitHero fit={brandFit} />}

      {/* Note about MVP scope — profile-input only for now */}
      <CaveatBanner>
        <strong>Analyzing profile @{handle}.</strong> This scan aggregates the
        creator&apos;s last {postsAnalyzed || 24} posts and their comment
        stream. Post-specific reel analysis (paste one reel URL, score that
        reel only) ships in the next release.
      </CaveatBanner>

      {/* FIVE SUB-SCORES */}
      <section>
        <SectionTitle hint="Each dimension is scored independently — see spec">
          Five signal scores
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {audience && (
            <ScoreCard
              title="Audience Authenticity"
              score={audience.score}
              label={audience.label}
              source={audience.source}
              confidence={audience.confidencePct}
              reasons={audience.reasons}
              accent="pink"
            />
          )}
          {engagement && (
            <ScoreCard
              title="Engagement Quality"
              score={engagement.score}
              label={engagement.label}
              source={engagement.source}
              confidence={engagement.confidencePct}
              reasons={engagement.reasons}
              accent="cyan"
            />
          )}
          {reach && (
            <ScoreCard
              title="Organic Reach Strength"
              score={reach.score}
              label={reach.label}
              source={reach.source}
              confidence={reach.confidencePct}
              reasons={reach.reasons}
              accent="emerald"
              note="High reach vs followers is a positive signal — never treated as fake"
            />
          )}
          {paid && (
            <PaidCard paid={paid} adLibrary={adLibrary} />
          )}
          {fraud && (
            <FraudCard fraud={fraud} />
          )}
          <MethodologyMiniCard />
        </div>
      </section>

      {/* PAID CONTENT SAMPLES (only shows if any posts flagged) */}
      {paidSamples.length > 0 && (
        <section>
          <SectionTitle hint={`${paidSamples.length} of ${postsAnalyzed} posts showed paid signals`}>
            Sampled paid-content posts
          </SectionTitle>
          <div className="space-y-2">
            {paidSamples.map((s, i) => (
              <PaidSampleRow key={i} sample={s} />
            ))}
          </div>
        </section>
      )}

      {/* COMMENT QUALITY BREAKDOWN */}
      {commentQuality && commentQuality.totalComments > 0 && (
        <section>
          <SectionTitle hint={`${commentQuality.totalComments} comments sampled`}>
            Comment quality breakdown
          </SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Generic praise"
              value={`${commentQuality.genericPct.toFixed(0)}%`}
              accent={commentQuality.genericPct > 40 ? "red" : "muted"}
              sub="e.g. &quot;nice&quot;, &quot;great post&quot;"
            />
            <MetricCard
              label="Emoji-only"
              value={`${commentQuality.emojiOnlyPct.toFixed(0)}%`}
              accent={commentQuality.emojiOnlyPct > 35 ? "red" : "muted"}
              sub="🔥 ❤️ 😍"
            />
            <MetricCard
              label="Repetitive"
              value={`${commentQuality.repetitivePct.toFixed(0)}%`}
              accent={commentQuality.repetitivePct > 15 ? "red" : "muted"}
              sub="Near-duplicate texts"
            />
            <MetricCard
              label="Bot-shaped names"
              value={`${commentQuality.botNamePct.toFixed(0)}%`}
              accent={commentQuality.botNamePct > 12 ? "red" : "muted"}
              sub="e.g. &quot;user_1234567&quot;"
            />
          </div>
        </section>
      )}

      {/* v2 DEPTH SIGNALS — burst / language / profile detail */}
      {(burst?.available || languageAnalysis?.available || (profSignals && profSignals.commercialIntentScore > 0) || (audienceEnr && audienceEnr.sampleSize >= 5)) && (
        <section>
          <SectionTitle hint="Extra corroborating signals we ran against this account">
            Depth signals
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {audienceEnr && audienceEnr.sampleSize >= 5 && (
              <DepthCard
                title="Commenter profile completeness"
                value={audienceEnr.completenessPct !== null ? `${audienceEnr.completenessPct.toFixed(0)}%` : "—"}
                sub={`${audienceEnr.sampleSize} sampled · healthy 60%+`}
                tone={
                  audienceEnr.completenessPct === null ? "neutral" :
                  audienceEnr.completenessPct >= 60 ? "positive" :
                  audienceEnr.completenessPct >= 30 ? "warning" : "danger"
                }
              />
            )}
            {burst?.available && (
              <DepthCard
                title="Comment timing"
                value={burst.peakConcentrationPct !== null ? `${burst.peakConcentrationPct.toFixed(0)}%` : "—"}
                sub={burst.flag ?? "in peak window — natural distribution"}
                tone={burst.score >= 80 ? "positive" : burst.score >= 60 ? "neutral" : "warning"}
              />
            )}
            {languageAnalysis?.available && (
              <DepthCard
                title="Comment language"
                value={languageAnalysis.dominantCommentScript ?? "—"}
                sub={
                  languageAnalysis.mismatch
                    ? `${languageAnalysis.dominantSharePct?.toFixed(0)}% vs caption in ${languageAnalysis.captionScript} — mismatch`
                    : `${languageAnalysis.dominantSharePct?.toFixed(0)}% dominance — matches caption`
                }
                tone={languageAnalysis.mismatch ? (languageAnalysis.score < 60 ? "warning" : "neutral") : "positive"}
              />
            )}
            {profSignals && (profSignals.commercialIntentScore > 0 || profSignals.businessCategory) && (
              <DepthCard
                title="Profile shape"
                value={profSignals.bioBrandOfficialHit ? "Brand-owned" : profSignals.commercialIntentScore >= 40 ? "Commercial" : profSignals.commercialIntentScore >= 20 ? "Mixed" : "Creator"}
                sub={profSignals.businessCategory ?? (profSignals.bioCommercialHits[0] ?? "no commercial bio signals")}
                tone="neutral"
              />
            )}
          </div>
        </section>
      )}

      {/* AD LIBRARY STATUS — theme-aware colors so light mode is readable */}
      {adLibrary && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            adLibrary.available && adLibrary.hasActiveAds
              ? "border-amber-500/40 bg-amber-500/15 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100"
              : adLibrary.available
                ? "border-emerald-500/40 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                : "border-border bg-card/60 text-foreground/70",
          )}
        >
          <span className="font-medium text-foreground">Meta Ad Library:</span>{" "}
          {adLibrary.available && adLibrary.hasActiveAds
            ? "This account currently runs paid Meta ads. Some post reach may be boosted."
            : adLibrary.available
              ? "No active Meta-served ads detected for this account."
              : `Insufficient data — ${adLibrary.note ?? "probe unavailable"}. Paid distribution not verified from Meta directly.`}
        </div>
      )}

      {/* CAVEATS */}
      {caveats.length > 0 && (
        <div className="space-y-2">
          {caveats.map((c, i) => (
            <CaveatBanner key={i}>{c}</CaveatBanner>
          ))}
        </div>
      )}

      {/* METHODOLOGY */}
      {methodology && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Methodology:</span> {methodology}
        </div>
      )}
    </div>
  );
}

// ─── Decode Score header ────────────────────────────────────────────
function DecodeHeader({
  handle,
  score,
  label,
  followers,
  postsAnalyzed,
  commentsAnalyzed,
  verified,
}: {
  handle: string;
  score: number;
  label: string;
  followers: number;
  postsAnalyzed: number;
  commentsAnalyzed: number;
  verified: boolean;
}) {
  const scoreColor =
    score >= 85
      ? "text-emerald-600 dark:text-emerald-300"
      : score >= 70
        ? "text-emerald-700 dark:text-emerald-400"
        : score >= 55
          ? "text-amber-600 dark:text-amber-300"
          : score >= 35
            ? "text-amber-700 dark:text-amber-400"
            : "text-red-600 dark:text-red-400";

  const ringColor =
    score >= 85 ? "stroke-emerald-500 dark:stroke-emerald-400" : score >= 70 ? "stroke-emerald-500" : score >= 55 ? "stroke-amber-500 dark:stroke-amber-400" : score >= 35 ? "stroke-amber-600 dark:stroke-amber-500" : "stroke-red-500";

  // Progress ring: circumference = 2πr; offset = C * (1 - pct/100)
  const r = 44;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/80 to-card/40 p-6 sm:p-8">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-ig" />
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
        <div className="relative shrink-0">
          <svg width="130" height="130" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-border/60" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={cn("transition-all duration-700", ringColor)}
              strokeDasharray={c}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={cn("text-4xl font-bold tabular-nums", scoreColor)}>{score.toFixed(0)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</div>
          </div>
        </div>

        <div className="flex-1 text-center sm:text-left">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Decode Score for @{handle} {verified && <span title="Verified account">✓</span>}
          </div>
          <div className={cn("text-3xl sm:text-4xl font-bold mt-1", scoreColor)}>{label}</div>
          <div className="mt-3 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 justify-center sm:justify-start">
            <span>{followers.toLocaleString()} followers</span>
            <span>·</span>
            <span>{postsAnalyzed} posts analyzed</span>
            <span>·</span>
            <span>{commentsAnalyzed.toLocaleString()} comments sampled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-score card ─────────────────────────────────────────────────
function ScoreCard({
  title,
  score,
  label,
  source,
  confidence,
  reasons,
  accent,
  note,
}: {
  title: string;
  score: number;
  label: string;
  source: DataSource;
  confidence: number;
  reasons: string[];
  accent: "pink" | "cyan" | "amber" | "emerald" | "red" | "muted";
  note?: string;
}) {
  const isInsufficient = label === "Insufficient data";
  const accentBar = {
    pink: "bg-gradient-ig",
    cyan: "bg-[hsl(187_95%_50%)]",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
    red: "bg-red-500",
    muted: "bg-muted",
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/60 p-5 flex flex-col">
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", accentBar)} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-semibold tabular-nums">
              {isInsufficient ? "—" : score.toFixed(0)}
            </div>
            {!isInsufficient && <div className="text-xs text-muted-foreground">/100</div>}
          </div>
          <div className={cn(
            "mt-1 text-sm font-medium",
            score >= 70
              ? "text-emerald-600 dark:text-emerald-300"
              : score >= 55
                ? "text-amber-600 dark:text-amber-300"
                : score >= 35
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-red-600 dark:text-red-300",
            isInsufficient && "text-muted-foreground",
          )}>
            {label}
          </div>
        </div>
        <SourceBadge source={source} confidence={confidence} />
      </div>
      {note && (
        <div className="mt-3 text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300/80 bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/30 dark:border-emerald-500/20 rounded-md px-2 py-1.5">
          {note}
        </div>
      )}
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {reasons.slice(0, 5).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-foreground/40 shrink-0">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Paid content card (special layout — classification, not a 0-100) ──
function PaidCard({ paid, adLibrary }: { paid: PaidScore; adLibrary?: AdLibraryStatus }) {
  const badgeClass = {
    "Verified Paid": "bg-purple-500/15 text-purple-800 dark:text-purple-200 border-purple-500/40",
    "Likely Paid": "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40",
    "Likely Organic": "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
    "Unknown": "bg-muted text-foreground/70 border-border",
  }[paid.classification];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/60 p-5 flex flex-col">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-400" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Paid Content</div>
          <div className={cn("mt-2 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium", badgeClass)}>
            {paid.classification}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {paid.paidPostCount} of {paid.totalPostsAnalyzed} recent posts show paid signals
          </div>
        </div>
        <SourceBadge source={paid.source} confidence={paid.confidencePct} />
      </div>
      {paid.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {paid.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-foreground/40 shrink-0">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      {adLibrary?.available === false && (
        <div className="mt-3 text-[11px] text-muted-foreground italic">
          Meta Ad Library check was unavailable — paid-distribution (boost) status not verified. Caption signals only.
        </div>
      )}
    </div>
  );
}

// ─── Fraud card ─────────────────────────────────────────────────────
function FraudCard({ fraud }: { fraud: FraudScore }) {
  const risk = fraud.risk;
  const statusMap = {
    Low: "ok",
    Moderate: "warn",
    Elevated: "warn",
    High: "bad",
    "Insufficient data": "warn",
  } as const;
  const statusColor = statusMap[risk];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/60 p-5 flex flex-col">
      <div className={cn(
        "absolute inset-x-0 top-0 h-[2px]",
        risk === "Low" ? "bg-emerald-400" : risk === "High" ? "bg-red-500" : "bg-amber-400",
      )} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Fraud / Suspicion Risk</div>
          <div className="mt-2">
            <StatusBadge status={statusColor} label={risk} />
          </div>
        </div>
        <SourceBadge source={fraud.source} confidence={fraud.confidencePct} />
      </div>
      {fraud.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {fraud.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-foreground/40 shrink-0">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Data-source badge ───────────────────────────────────────────────
function SourceBadge({ source, confidence }: { source: DataSource; confidence: number }) {
  const map = {
    verified: { label: "Verified", cls: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40" },
    calculated: { label: "Calculated", cls: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/40" },
    inferred: { label: "Inferred", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40" },
    unknown: { label: "Unknown", cls: "bg-muted text-foreground/70 border-border" },
  }[source];
  return (
    <div className="text-right">
      <div className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold", map.cls)}>
        {map.label}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
        {confidence.toFixed(0)}% confidence
      </div>
    </div>
  );
}

// ─── Methodology / info card (fills the 6th grid slot) ──────────────
function MethodologyMiniCard() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-5 text-xs text-muted-foreground leading-relaxed">
      <div className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-2">
        How to read these
      </div>
      <p>
        Five orthogonal signals. Reach and authenticity are NOT the same — a
        creator can pull 100× their follower count and still be 100% authentic
        (Instagram distributes content beyond followers as a normal product
        behavior). Fraud fires only when engagement quality contradicts
        engagement volume, never on reach ratio alone.
      </p>
    </div>
  );
}

// ─── Final Verdict hero ─────────────────────────────────────────────
function VerdictHero({ verdict }: { verdict: Verdict }) {
  const toneClass = {
    positive: "border-emerald-500/40 bg-emerald-500/10",
    neutral: "border-blue-500/40 bg-blue-500/10",
    warning: "border-amber-500/50 bg-amber-500/15",
    danger: "border-red-500/50 bg-red-500/15",
  }[verdict.tone];

  const toneText = {
    positive: "text-emerald-700 dark:text-emerald-300",
    neutral: "text-blue-700 dark:text-blue-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-red-700 dark:text-red-300",
  }[verdict.tone];

  const icon = {
    positive: "✓",
    neutral: "•",
    warning: "!",
    danger: "✕",
  }[verdict.tone];

  return (
    <div className={cn("rounded-2xl border-2 p-5 sm:p-6", toneClass)}>
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold",
            verdict.tone === "positive" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200",
            verdict.tone === "neutral" && "bg-blue-500/20 text-blue-700 dark:text-blue-200",
            verdict.tone === "warning" && "bg-amber-500/25 text-amber-800 dark:text-amber-200",
            verdict.tone === "danger" && "bg-red-500/25 text-red-800 dark:text-red-200",
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Final Verdict
          </div>
          <div className={cn("text-xl sm:text-2xl font-bold mt-0.5", toneText)}>
            {verdict.label}
          </div>
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{verdict.summary}</p>
          {verdict.supportingScores.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-foreground/60">
              {verdict.supportingScores.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-foreground/40 shrink-0">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brand Deal Fit hero ────────────────────────────────────────────
function BrandFitHero({ fit }: { fit: BrandFit }) {
  const toneClass = {
    positive: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-card/40",
    neutral: "border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-card/40",
    warning: "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-card/40",
    danger: "border-red-500/40 bg-gradient-to-br from-red-500/10 to-card/40",
  }[fit.tone];

  return (
    <div className={cn("rounded-2xl border p-5 sm:p-6", toneClass)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Brand Deal Fit · {fit.creatorTier} tier
          </div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">{fit.structure}</div>
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{fit.headline}</p>
          <p className="mt-2 text-xs text-foreground/60 leading-relaxed">{fit.reasoning}</p>
          {fit.cautionNotes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">
              {fit.cautionNotes.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0">⚠</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {fit.estimatedRateInrRange && (
          <div className="rounded-xl border border-border bg-card/70 px-4 py-3 min-w-[220px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Rate benchmark (estimate)
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">{fit.estimatedRateInrRange}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              India market · vary by niche, geo, deliverable
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Depth signal card (small tile) ─────────────────────────────────
function DepthCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  tone: "positive" | "neutral" | "warning" | "danger";
}) {
  const accent = {
    positive: "border-l-emerald-500",
    neutral: "border-l-blue-500",
    warning: "border-l-amber-500",
    danger: "border-l-red-500",
  }[tone];
  return (
    <div className={cn("rounded-xl border border-border border-l-4 bg-card/60 p-4", accent)}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-foreground/60 leading-snug">{sub}</div>
    </div>
  );
}

// ─── Paid-content sample row ────────────────────────────────────────
function PaidSampleRow({ sample }: { sample: PaidSample }) {
  const chip = (label: string, cls: string) => (
    <span
      key={label}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
  const chips: React.ReactNode[] = [];
  if (sample.sponsoredHashtags.length > 0) {
    chips.push(chip(`#${sample.sponsoredHashtags[0]}`, "bg-purple-500/15 text-purple-200 border-purple-500/30"));
  }
  if (sample.discountCodes.length > 0) {
    chips.push(chip(`code ${sample.discountCodes[0]}`, "bg-amber-500/15 text-amber-200 border-amber-500/30"));
  }
  if (sample.affiliateUrls.length > 0) {
    chips.push(chip("affiliate link", "bg-amber-500/15 text-amber-200 border-amber-500/30"));
  }
  if (sample.brandTagCount >= 2) {
    chips.push(chip(`${sample.brandTagCount} @brand tags`, "bg-cyan-500/15 text-cyan-200 border-cyan-500/30"));
  }
  if (sample.promoCtas.length > 0) {
    chips.push(chip(`"${sample.promoCtas[0]}"`, "bg-muted text-foreground/70 border-border"));
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-amber-300 font-medium tabular-nums shrink-0">
          {sample.score}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {sample.postUrl ? (
              <a href={sample.postUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                Post #{sample.postIndex + 1} ↗
              </a>
            ) : (
              <span>Post #{sample.postIndex + 1}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">{chips}</div>
        </div>
      </div>
    </div>
  );
}
