import type { Region } from "../types";
import { REGION_MAP_IN_COUNTRIES } from "../constants";

export function regionFromCountry(country: string | null | undefined): Region {
  if (!country) return "GLOBAL";
  return REGION_MAP_IN_COUNTRIES.has(country.toUpperCase()) ? "IN" : "GLOBAL";
}

export function regionFromHeaders(headers: Headers): Region {
  // Vercel / Cloudflare commonly set these
  const country =
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    headers.get("x-country") ??
    null;
  return regionFromCountry(country);
}
