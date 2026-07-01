import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "../types";

// Writes a follower-count snapshot for the (platform, handle) pair. Called
// from the scan API on every tool run, so live-counter accumulates history
// no matter which tool the user reaches first.
//
// Best-effort — if the table is missing (older deployments) or the write
// races another one, we swallow the error so the scan itself never fails.

export async function recordProfileSnapshot(
  supa: SupabaseClient,
  platform: Platform,
  handle: string,
  followers: number,
  following?: number,
): Promise<void> {
  if (!Number.isFinite(followers) || followers < 0) return;
  try {
    await supa.from("profile_snapshots").insert({
      platform,
      handle,
      followers,
      following: following ?? null,
    });
  } catch (e) {
    console.warn(
      "[snapshots] insert failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

export interface SnapshotRow {
  followers: number;
  taken_at: string;
}

// Reads the newest N snapshots for a handle, ordered newest-first. Used by
// live-counter to compute real growth deltas.
export async function readRecentSnapshots(
  supa: SupabaseClient,
  platform: Platform,
  handle: string,
  limit: number,
): Promise<SnapshotRow[]> {
  try {
    const { data, error } = await supa
      .from("profile_snapshots")
      .select("followers, taken_at")
      .eq("platform", platform)
      .eq("handle", handle)
      .order("taken_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as SnapshotRow[];
  } catch (e) {
    console.warn(
      "[snapshots] read failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
