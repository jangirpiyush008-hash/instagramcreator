"use client";

import { useState } from "react";
import { Avatar, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface CommentEntry {
  username: string;
  comment: string;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_WINNER: CommentEntry = { username: "anaya_kapoor", comment: "Done! Tagged my BFF 🤞 fingers crossed" };
const FALLBACK_POOL: CommentEntry[] = [
  FALLBACK_WINNER,
  { username: "rohan.codes", comment: "Following + sharing on my story now" },
  { username: "the.lina", comment: "Already a customer, love this!" },
  { username: "kabir_iyer", comment: "Sent ❤️ tagged 3 friends" },
  { username: "meera.creates", comment: "Pick me pick me 🎉" },
];

export function CommentPickerView({ handle, entitled, data }: Props) {
  const winner = (data?.winner as CommentEntry | undefined) ?? FALLBACK_WINNER;
  const runnerUps = (data?.runnerUps as CommentEntry[] | undefined) ?? FALLBACK_POOL.slice(1, 4);
  const totalComments = (data?.totalComments as number) ?? 4_812;
  const uniqueUsers = (data?.uniqueUsers as number) ?? 3_994;
  const duplicates = (data?.duplicatesRemoved as number) ?? 818;

  const [activeWinner, setActiveWinner] = useState(winner);
  const pool = [winner, ...runnerUps];

  return (
    <div className="space-y-6">
      <SectionTitle hint={`from @${handle}'s most recent post`}>Giveaway winner</SectionTitle>

      <div className="rounded-2xl bg-gradient-ig p-[1.5px]">
        <div className="rounded-[calc(theme(borderRadius.2xl)-1.5px)] bg-card p-6 flex items-start gap-5">
          <Avatar name={activeWinner.username} size={72} />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Winner</div>
            <div className="text-2xl font-semibold mt-1">@{activeWinner.username}</div>
            <p className="text-sm text-muted-foreground mt-2 italic">"{activeWinner.comment}"</p>
          </div>
          <button
            onClick={() => setActiveWinner(pool[Math.floor(Math.random() * pool.length)] ?? winner)}
            disabled={!entitled}
            className={
              "h-10 px-4 rounded-lg text-sm font-medium transition-all " +
              (entitled
                ? "bg-gradient-ig text-white hover:brightness-110"
                : "border border-border bg-muted text-muted-foreground cursor-not-allowed")
            }
          >
            Re-pick
          </button>
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Total comments" value={totalComments.toLocaleString()} accent="pink" />
          <MetricCard label="Unique users" value={uniqueUsers.toLocaleString()} accent="cyan" />
          <MetricCard label="Duplicates removed" value={duplicates.toLocaleString()} accent="amber" />
        </div>
      </section>

      <section>
        <SectionTitle>Runners-up</SectionTitle>
        <div className="space-y-2">
          {runnerUps.map((r, i) => (
            <div
              key={r.username + i}
              className={"flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 " + (entitled ? "" : "blur-locked")}
              aria-hidden={!entitled}
            >
              <Avatar name={r.username} size={32} hueSeed={i * 100} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">@{r.username}</div>
                <div className="text-xs text-muted-foreground truncate">"{r.comment}"</div>
              </div>
              <div className="text-xs text-muted-foreground">#{i + 2}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <MetricCard label="Unlock" value="Re-pick + filters" sub="must-follow, must-tag, location" accent="pink" />
        <MetricCard label="Subscriber" value="CSV export" sub="full winners log for compliance" accent="cyan" />
      </div>
    </div>
  );
}
