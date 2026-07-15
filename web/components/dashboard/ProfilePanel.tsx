"use client";

import { useState } from "react";
import { cn } from "@/web/lib/cn";
import { SignOutButton } from "@/web/components/SignOutButton";

// Profile / Account settings panel. Rendered as a tab in the dashboard.
// Sections:
//   1. Personal — full name, email (readonly), phone, country, timezone
//   2. Company — company, job title (optional, for B2B customers)
//   3. Notifications — email opt-ins
//   4. Security — change password
//   5. Danger zone — delete account (defers to email support for now
//      to avoid accidental permanent loss)

export interface ProfileData {
  email: string;
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  countryCode?: string;
  company?: string;
  jobTitle?: string;
  timezone?: string;
  marketingOptIn: boolean;
  productUpdatesOptIn: boolean;
  hasPassword: boolean;      // false for OAuth-only users
}

// Trim country list to major markets we actually serve. Users can email
// support to add exotic ones; keeps the dropdown scannable.
const COUNTRY_OPTS = [
  { code: "IN", label: "🇮🇳 India" },
  { code: "US", label: "🇺🇸 United States" },
  { code: "GB", label: "🇬🇧 United Kingdom" },
  { code: "AE", label: "🇦🇪 United Arab Emirates" },
  { code: "CA", label: "🇨🇦 Canada" },
  { code: "AU", label: "🇦🇺 Australia" },
  { code: "SG", label: "🇸🇬 Singapore" },
  { code: "DE", label: "🇩🇪 Germany" },
  { code: "FR", label: "🇫🇷 France" },
  { code: "BR", label: "🇧🇷 Brazil" },
  { code: "JP", label: "🇯🇵 Japan" },
  { code: "MX", label: "🇲🇽 Mexico" },
  { code: "OTHER", label: "🌐 Other" },
];

// Curated timezone list — IANA names for the biggest markets. Users
// with obscure zones can leave blank; server accepts any valid IANA
// string but the picker keeps 90% of users on rails.
const TIMEZONE_OPTS = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Asia/Tokyo",
  "America/Sao_Paulo",
  "UTC",
];

export function ProfilePanel({ initial }: { initial: ProfileData }) {
  const [fullName, setFullName] = useState(initial.fullName ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [countryCode, setCountryCode] = useState(initial.countryCode ?? "");
  const [company, setCompany] = useState(initial.company ?? "");
  const [jobTitle, setJobTitle] = useState(initial.jobTitle ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(initial.marketingOptIn);
  const [productUpdatesOptIn, setProductUpdatesOptIn] = useState(initial.productUpdatesOptIn);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          country_code: countryCode || undefined,
          company,
          job_title: jobTitle,
          timezone: timezone || undefined,
          marketing_opt_in: marketingOptIn,
          product_updates_opt_in: productUpdatesOptIn,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setSaveMsg({ kind: "err", text: body.error ?? "Save failed" });
      } else {
        setSaveMsg({ kind: "ok", text: "Saved" });
        setTimeout(() => setSaveMsg(null), 2500);
      }
    } catch (e) {
      setSaveMsg({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!body.ok) {
        setPwMsg({ kind: "err", text: body.error ?? "Password change failed" });
      } else {
        setPwMsg({ kind: "ok", text: "Password updated" });
        setCurrentPassword("");
        setNewPassword("");
        setTimeout(() => setPwMsg(null), 2500);
      }
    } catch (e) {
      setPwMsg({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <header className="flex items-center gap-4">
        {initial.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initial.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-border shadow-sm"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-gradient-ig text-white grid place-items-center text-2xl font-bold shadow-sm">
            {(fullName || initial.email).charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {fullName || "My Profile"}
          </h1>
          <p className="text-sm text-muted-foreground">{initial.email}</p>
        </div>
      </header>

      {/* ── Personal ────────────────────────────────────────────────── */}
      <Section
        title="Personal information"
        blurb="How you appear on DecodeCreator + how we contact you."
      >
        <Grid>
          <Field label="Full name">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Piyush Jangir"
              className={inputClass}
            />
          </Field>
          <Field label="Email" hint="Sign-in email — contact support to change">
            <input type="email" value={initial.email} disabled className={cn(inputClass, "opacity-60 cursor-not-allowed")} />
          </Field>
          <Field label="Phone" hint="Include country code, e.g. +91 98xxxxxx01">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98xxxxxx01"
              className={inputClass}
            />
          </Field>
          <Field label="Country">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className={inputClass}
            >
              <option value="">— Select —</option>
              {COUNTRY_OPTS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputClass}
            >
              <option value="">— Select —</option>
              {TIMEZONE_OPTS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </Grid>
      </Section>

      {/* ── Company (optional) ──────────────────────────────────────── */}
      <Section
        title="Company (optional)"
        blurb="For invoices + tailoring product for teams."
      >
        <Grid>
          <Field label="Company">
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Inc."
              className={inputClass}
            />
          </Field>
          <Field label="Job title">
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Growth Lead"
              className={inputClass}
            />
          </Field>
        </Grid>
      </Section>

      {/* ── Notifications ───────────────────────────────────────────── */}
      <Section title="Notifications" blurb="What we're allowed to email you.">
        <div className="space-y-3">
          <ToggleRow
            checked={productUpdatesOptIn}
            onChange={setProductUpdatesOptIn}
            label="Product updates"
            hint="Occasional emails when we ship new tools or features. Recommended."
          />
          <ToggleRow
            checked={marketingOptIn}
            onChange={setMarketingOptIn}
            label="Marketing + promotions"
            hint="Discount codes, seasonal deals, tips. Off by default."
          />
        </div>
      </Section>

      {/* Save row */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/60">
        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className={cn(
            "px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm",
            saving ? "bg-muted text-muted-foreground cursor-wait" : "bg-foreground text-background hover:opacity-90",
          )}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saveMsg && (
          <div
            className={cn(
              "text-sm",
              saveMsg.kind === "ok" ? "text-emerald-500" : "text-destructive",
            )}
          >
            {saveMsg.text}
          </div>
        )}
      </div>

      {/* ── Security ────────────────────────────────────────────────── */}
      <Section
        title="Security"
        blurb={
          initial.hasPassword
            ? "Change your password. We'll ask for the current one first."
            : "You signed in with Google — no password on this account. To add one, sign out and use the email/password signup flow."
        }
      >
        {initial.hasPassword ? (
          <Grid>
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={inputClass}
              />
            </Field>
            <Field label="New password" hint="8–128 characters, different from current">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
          </Grid>
        ) : null}
        {initial.hasPassword && (
          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={changePassword}
              disabled={pwSaving || !currentPassword || !newPassword}
              className={cn(
                "px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm",
                pwSaving || !currentPassword || !newPassword
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:opacity-90",
              )}
            >
              {pwSaving ? "Updating…" : "Change password"}
            </button>
            {pwMsg && (
              <div
                className={cn(
                  "text-sm",
                  pwMsg.kind === "ok" ? "text-emerald-500" : "text-destructive",
                )}
              >
                {pwMsg.text}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Session ─────────────────────────────────────────────────── */}
      <Section title="Session">
        <div className="flex items-center gap-4">
          <SignOutButton />
          <div className="text-sm text-muted-foreground">
            Signs you out on this browser. Other devices stay signed in.
          </div>
        </div>
      </Section>

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <Section title="Danger zone" tone="destructive">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground/80 leading-relaxed">
          To delete your account and all associated data, email{" "}
          <a
            href={`mailto:support.decodecreator@gmail.com?subject=Delete my account (${initial.email})`}
            className="underline font-medium text-foreground"
          >
            support.decodecreator@gmail.com
          </a>{" "}
          from your account email. We&apos;ll permanently delete
          everything within 7 days — subscriptions cancelled, API keys
          revoked, scan history erased. (Self-serve delete button
          coming later — kept behind email for now to prevent accidental
          loss.)
        </div>
      </Section>
    </div>
  );
}

// ── Small building blocks ──────────────────────────────────────────────

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all";

function Section({
  title,
  blurb,
  children,
  tone,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
  tone?: "destructive";
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2
          className={cn(
            "text-lg font-semibold tracking-tight",
            tone === "destructive" && "text-destructive",
          )}
        >
          {title}
        </h2>
        {blurb && <p className="text-sm text-muted-foreground mt-1">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </label>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-primary"
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
