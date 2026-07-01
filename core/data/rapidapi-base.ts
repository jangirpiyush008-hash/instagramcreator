// Tiny shared helper for any RapidAPI-marketplace adapter.
// Handles auth headers, timeouts, and JSON parsing in one place.

import { DataSourceError, ProviderRateLimitError } from "../utils/errors";

export interface RapidAPIConfig {
  apiKey: string;
  host: string;
}

export async function rapidApiFetch<T>(
  config: RapidAPIConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!config.apiKey || !config.host) {
    throw new DataSourceError("RapidAPI not configured (missing key or host)");
  }
  const url = `https://${config.host}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "x-rapidapi-key": config.apiKey,
        "x-rapidapi-host": config.host,
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      throw new ProviderRateLimitError(config.host, path);
    }
    if (!res.ok) {
      // Don't bubble the response body (may contain key or PII) — just status.
      throw new DataSourceError(`RapidAPI ${config.host} returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ProviderRateLimitError) throw e;
    if (e instanceof DataSourceError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new DataSourceError(`RapidAPI ${config.host} timeout after 12s`);
    }
    throw new DataSourceError(`RapidAPI ${config.host} fetch error`, e);
  } finally {
    clearTimeout(timeout);
  }
}
