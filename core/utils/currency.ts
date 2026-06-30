import { PRICING } from "../constants";
import type { Region } from "../types";

export function formatAmount(minor: number, region: Region): string {
  const cfg = PRICING[region];
  const major = minor / 100;
  if (region === "IN") {
    return `${cfg.symbol}${Math.round(major).toLocaleString("en-IN")}`;
  }
  return `${cfg.symbol}${major.toFixed(2)}`;
}

export function formatDateTimeForRegion(iso: string, region: Region): string {
  const d = new Date(iso);
  return d.toLocaleString(region === "IN" ? "en-IN" : "en-US", {
    timeZone: region === "IN" ? "Asia/Kolkata" : undefined,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
