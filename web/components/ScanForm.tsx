"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/web/lib/cn";
import { normalizeHandle, isValidHandle } from "@/core/utils/handle";

type Platform = "instagram" | "tiktok" | "youtube";

export function ScanForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = normalizeHandle(handle);
    if (!h || !isValidHandle(h)) {
      setError("Enter a valid handle (letters, numbers, dots, dashes, underscores).");
      return;
    }
    setSubmitting(true);
    router.push(`/${platform}/${encodeURIComponent(h)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="inline-flex rounded-full border border-border bg-background/60 p-1">
        <PlatformPill
          active={platform === "instagram"}
          onClick={() => setPlatform("instagram")}
          label="Instagram"
          accentClass="bg-gradient-ig"
        />
        <PlatformPill
          active={platform === "tiktok"}
          onClick={() => setPlatform("tiktok")}
          label="TikTok"
          accentClass="bg-gradient-tt"
        />
        <PlatformPill
          active={platform === "youtube"}
          onClick={() => setPlatform("youtube")}
          label="YouTube"
          accentClass="bg-gradient-yt"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
            @
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="enter an IG, TikTok, or YouTube @handle"
            autoComplete="off"
            spellCheck={false}
            aria-label="Handle"
            className="h-14 w-full rounded-xl border border-input bg-background/80 pl-10 pr-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="h-14 px-7 rounded-xl font-medium text-white bg-gradient-ig hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-pink-900/30 sm:w-auto w-full"
        >
          {submitting ? "Scanning…" : "Search"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Public data only — the account is never notified.
      </p>
    </form>
  );
}

function PlatformPill({
  active,
  onClick,
  label,
  accentClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  accentClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-5 py-2 text-sm rounded-full transition-all font-medium",
        active
          ? `${accentClass} text-white shadow-md`
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
