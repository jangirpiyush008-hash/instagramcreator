import type { Platform } from "../types";

const HANDLE_RX = /^[A-Za-z0-9._-]{1,40}$/;

export function normalizeHandle(input: string): string {
  let h = input.trim();
  // strip leading @
  if (h.startsWith("@")) h = h.slice(1);
  // strip url prefixes
  h = h.replace(
    /^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i,
    "",
  );
  // strip trailing slash and query
  h = h.split(/[/?#]/)[0] ?? "";
  return h.toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RX.test(handle);
}

export function scanKey(platform: Platform, handle: string, toolId: string): string {
  return `${platform}:${normalizeHandle(handle)}:${toolId}`;
}
